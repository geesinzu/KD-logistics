import { z } from "zod";
import { eq, desc, and, sql, inArray } from "drizzle-orm";
import { shipments, trackingEvents, users, branches, thirdPartyLogistics } from "@db/schema";
import { getDb } from "./queries/connection";
import { createRouter, authedQuery, adminQuery, shipmentCreatorQuery, warehouseQuery, logisticsQuery, driverQuery } from "./middleware";
import { BRANCH_TRACKING_CODES } from "@contracts/constants";

function generateTrackingId(branchName: string): string {
  const code = BRANCH_TRACKING_CODES[branchName] || "XX";
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const seq = String(Math.floor(Math.random() * 999) + 1).padStart(3, "0");
  return `KEDI-${code}${yy}${mm}${seq}`;
}

function generateQrToken(): string {
  return "qr_" + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

export const shipmentRouter = createRouter({
  // ── CREATE SHIPMENT (Step 1) ──
  // Origin is always Lagos HQ (id: 19). No item count at creation.
  create: shipmentCreatorQuery
    .input(z.object({
      destBranchId: z.number(),
      receiverName: z.string().optional(),
      receiverPhone: z.string().optional(),
      description: z.string().optional(),
      priority: z.enum(["normal", "urgent"]).default("normal"),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const result = await db.insert(shipments).values({
        createdBy: ctx.user.id,
        creatorRole: ctx.user.role,
        originBranchId: 19, // Lagos HQ
        destBranchId: input.destBranchId,
        receiverName: input.receiverName,
        receiverPhone: input.receiverPhone,
        description: input.description,
        priority: input.priority,
        status: "created",
      });
      const shipmentId = Number(result[0].insertId);

      // Add tracking event
      await db.insert(trackingEvents).values({
        shipmentId,
        eventType: "created",
        newStatus: "created",
        notes: `Shipment created by ${ctx.user.name}`,
        createdBy: ctx.user.id,
        actorRole: ctx.user.role,
      });

      return { success: true, shipmentId };
    }),

  // ── WAREHOUSE: INPUT ITEMS & GENERATE LABEL (Step 2-3) ──
  warehouseProcess: warehouseQuery
    .input(z.object({
      shipmentId: z.number(),
      actualItemCount: z.number().min(1),
      itemDetails: z.string(),
      storageLocation: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      // Get branch info for tracking ID
      const shipment = await db.select().from(shipments).where(eq(shipments.id, input.shipmentId)).limit(1);
      if (!shipment[0]) throw new Error("Shipment not found");

      const branch = await db.select().from(branches).where(eq(branches.id, shipment[0].destBranchId)).limit(1);
      const branchName = branch[0]?.name || "XX";
      const trackingId = generateTrackingId(branchName);
      const qrToken = generateQrToken();

      await db.update(shipments)
        .set({
          actualItemCount: input.actualItemCount,
          itemDetails: input.itemDetails,
          storageLocation: input.storageLocation,
          warehouseOfficerId: ctx.user.id,
          trackingId,
          qrCodeToken: qrToken,
          status: "labeled",
          labeledAt: new Date(),
        })
        .where(eq(shipments.id, input.shipmentId));

      await db.insert(trackingEvents).values({
        shipmentId: input.shipmentId,
        eventType: "items_input",
        oldStatus: "created",
        newStatus: "labeled",
        notes: `Items: ${input.actualItemCount}. Location: ${input.storageLocation}`,
        createdBy: ctx.user.id,
        actorRole: ctx.user.role,
      });

      await db.insert(trackingEvents).values({
        shipmentId: input.shipmentId,
        eventType: "label_generated",
        newStatus: "labeled",
        notes: `Label generated: ${trackingId}`,
        createdBy: ctx.user.id,
        actorRole: ctx.user.role,
      });

      return { success: true, trackingId, qrToken };
    }),

  // ── LOGISTICS: ASSIGN TO 3PL (Step 4) ──
  assign3pl: logisticsQuery
    .input(z.object({
      shipmentId: z.number(),
      tplId: z.number(),
      tplPickupType: z.enum(["kedi_driver_drop", "tpl_pickup_direct"]),
      assignedDriverId: z.number().optional(),
      estimatedDeliveryDate: z.string().optional(),
      specialInstructions: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const status = input.tplPickupType === "kedi_driver_drop" ? "waiting_driver_pickup" : "waiting_3pl_pickup";

      await db.update(shipments)
        .set({
          tplId: input.tplId,
          tplPickupType: input.tplPickupType,
          assignedDriverId: input.assignedDriverId,
          logisticsOfficerId: ctx.user.id,
          status,
          assignedAt: new Date(),
          estimatedDeliveryDate: input.estimatedDeliveryDate ? new Date(input.estimatedDeliveryDate) : null,
          specialInstructions: input.specialInstructions,
        })
        .where(eq(shipments.id, input.shipmentId));

      await db.insert(trackingEvents).values({
        shipmentId: input.shipmentId,
        eventType: "assigned_to_3pl",
        oldStatus: "labeled",
        newStatus: status,
        notes: `Assigned to 3PL (ID: ${input.tplId}). Pickup: ${input.tplPickupType}`,
        createdBy: ctx.user.id,
        actorRole: ctx.user.role,
      });

      return { success: true };
    }),

  // ── DRIVER: CONFIRM PICKUP (Step 5) ──
  driverPickup: driverQuery
    .input(z.object({
      shipmentId: z.number(),
      notes: z.string().optional(),
      qtyMatch: z.boolean(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      await db.update(shipments)
        .set({ status: "picked_up" })
        .where(eq(shipments.id, input.shipmentId));

      await db.insert(trackingEvents).values({
        shipmentId: input.shipmentId,
        eventType: "driver_pickup_confirmed",
        oldStatus: "waiting_driver_pickup",
        newStatus: "picked_up",
        notes: input.notes || `Driver ${ctx.user.name} confirmed pickup. Qty match: ${input.qtyMatch}`,
        createdBy: ctx.user.id,
        actorRole: ctx.user.role,
      });

      return { success: true };
    }),

  // ── DRIVER: DROP AT 3PL (Step 6A) ──
  driverDropAt3pl: driverQuery
    .input(z.object({
      shipmentId: z.number(),
      tplRepName: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      await db.update(shipments)
        .set({ status: "at_3pl" })
        .where(eq(shipments.id, input.shipmentId));

      await db.insert(trackingEvents).values({
        shipmentId: input.shipmentId,
        eventType: "driver_dropoff_at_3pl",
        oldStatus: "picked_up",
        newStatus: "at_3pl",
        notes: `Driver ${ctx.user.name} dropped at 3PL. Rep: ${input.tplRepName || "N/A"}`,
        createdBy: ctx.user.id,
        actorRole: ctx.user.role,
      });

      return { success: true };
    }),

  // ── 3PL: CONFIRM RECEIPT (Step 7) ──
  tplConfirmReceipt: authedQuery
    .input(z.object({
      shipmentId: z.number(),
      receivedQty: z.number().min(0),
      condition: z.enum(["good", "partial", "damaged"]),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const shipment = await db.select().from(shipments).where(eq(shipments.id, input.shipmentId)).limit(1);
      if (!shipment[0]) throw new Error("Shipment not found");

      const totalQty = shipment[0].actualItemCount || input.receivedQty;
      const isFull = input.receivedQty >= totalQty && input.condition === "good";
      const newStatus = isFull ? "tpl_confirmed" : "tpl_confirmed";

      await db.update(shipments)
        .set({
          tplConfirmedQty: input.receivedQty,
          tplCondition: input.condition,
          tplConfirmedAt: new Date(),
          tplNotes: input.notes,
          status: newStatus,
        })
        .where(eq(shipments.id, input.shipmentId));

      await db.insert(trackingEvents).values({
        shipmentId: input.shipmentId,
        eventType: "tpl_receipt_confirmed",
        oldStatus: shipment[0].status,
        newStatus,
        notes: `3PL confirmed receipt: ${input.receivedQty}/${totalQty} items. Condition: ${input.condition}`,
        createdBy: ctx.user.id,
        actorRole: ctx.user.role,
        actorType: ctx.user.role === "tpl_user" ? "tpl_user" : "kedi_user",
      });

      return { success: true, isFull };
    }),

  // ── 3PL: UPDATE LOCATION / PARTIAL DELIVERY (Step 8) ──
  tplUpdateLocation: authedQuery
    .input(z.object({
      shipmentId: z.number(),
      location: z.string(),
      updateType: z.enum(["location_update", "partial_delivery", "full_delivery", "delay_reported"]),
      deliveredQty: z.number().optional(),
      remainingQty: z.number().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const shipment = await db.select().from(shipments).where(eq(shipments.id, input.shipmentId)).limit(1);
      if (!shipment[0]) throw new Error("Shipment not found");

      let newStatus = shipment[0].status;
      if (input.updateType === "partial_delivery") {
        newStatus = "partially_delivered";
        const prevDelivered = shipment[0].deliveredQty || 0;
        const totalDelivered = prevDelivered + (input.deliveredQty || 0);
        const remaining = (shipment[0].actualItemCount || 0) - totalDelivered;

        await db.update(shipments)
          .set({
            status: newStatus,
            deliveredQty: totalDelivered,
            remainingQty: remaining > 0 ? remaining : 0,
          })
          .where(eq(shipments.id, input.shipmentId));
      } else if (input.updateType === "full_delivery") {
        newStatus = "delivered";
        await db.update(shipments)
          .set({
            status: "delivered",
            deliveredAt: new Date(),
            deliveredQty: shipment[0].actualItemCount,
            remainingQty: 0,
          })
          .where(eq(shipments.id, input.shipmentId));
      } else {
        await db.update(shipments)
          .set({ status: "in_transit_with_3pl" })
          .where(eq(shipments.id, input.shipmentId));
        newStatus = "in_transit_with_3pl";
      }

      await db.insert(trackingEvents).values({
        shipmentId: input.shipmentId,
        eventType: input.updateType === "partial_delivery" ? "tpl_partial_delivery"
          : input.updateType === "full_delivery" ? "tpl_full_delivery"
          : input.updateType === "delay_reported" ? "delay_reported"
          : "tpl_location_update",
        oldStatus: shipment[0].status,
        newStatus,
        location: input.location,
        notes: input.notes || `${input.updateType} at ${input.location}`,
        qtyDelivered: input.deliveredQty,
        qtyRemaining: input.remainingQty,
        createdBy: ctx.user.id,
        actorRole: ctx.user.role,
        actorType: ctx.user.role === "tpl_user" ? "tpl_user" : "kedi_user",
      });

      return { success: true, newStatus };
    }),

  // ── COMPLETE SHIPMENT (Step 9) ──
  complete: authedQuery
    .input(z.object({ shipmentId: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(shipments)
        .set({ status: "completed", completedAt: new Date() })
        .where(eq(shipments.id, input.shipmentId));
      return { success: true };
    }),

  // ── LIST SHIPMENTS ──
  list: authedQuery
    .input(z.object({
      page: z.number().default(1),
      limit: z.number().default(20),
      status: z.string().optional(),
      search: z.string().optional(),
      tplId: z.number().optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const page = input?.page ?? 1;
      const limit = input?.limit ?? 20;
      const offset = (page - 1) * limit;

      const conditions = [];
      if (input?.status) conditions.push(eq(shipments.status, input.status as any));
      if (input?.tplId) conditions.push(eq(shipments.tplId, input.tplId));

      // Role-based filtering
      if (ctx.user.role === "driver") {
        conditions.push(eq(shipments.assignedDriverId, ctx.user.id));
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const results = await db.select({
        id: shipments.id,
        trackingId: shipments.trackingId,
        status: shipments.status,
        destBranchId: shipments.destBranchId,
        receiverName: shipments.receiverName,
        actualItemCount: shipments.actualItemCount,
        tplId: shipments.tplId,
        assignedDriverId: shipments.assignedDriverId,
        priority: shipments.priority,
        estimatedItemCount: shipments.estimatedItemCount,
        createdAt: shipments.createdAt,
        updatedAt: shipments.updatedAt,
      })
        .from(shipments)
        .where(where)
        .orderBy(desc(shipments.createdAt))
        .limit(limit)
        .offset(offset);

      // Get branch names and TPL names
      const branchIds = [...new Set(results.map(s => s.destBranchId).filter(Boolean))];
      const branchList = branchIds.length > 0
        ? await db.select().from(branches).where(inArray(branches.id, branchIds as number[]))
        : [];

      const tplIds = [...new Set(results.map(s => s.tplId).filter(Boolean))];
      const tplList = tplIds.length > 0
        ? await db.select().from(thirdPartyLogistics).where(inArray(thirdPartyLogistics.id, tplIds as number[]))
        : [];

      const enriched = results.map(s => ({
        ...s,
        destinationBranch: branchList.find(b => b.id === s.destBranchId)?.name || "Unknown",
        tplName: tplList.find(t => t.id === s.tplId)?.name || null,
      }));

      const countResult = await db.select({ count: sql<number>`count(*)` }).from(shipments).where(where);
      return { shipments: enriched, total: countResult[0]?.count ?? 0 };
    }),

  // ── GET SINGLE SHIPMENT ──
  getById: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const shipment = await db.select().from(shipments).where(eq(shipments.id, input.id)).limit(1);
      if (!shipment[0]) return null;

      const branch = await db.select().from(branches).where(eq(branches.id, shipment[0].destBranchId)).limit(1);
      const tpl = shipment[0].tplId
        ? await db.select().from(thirdPartyLogistics).where(eq(thirdPartyLogistics.id, shipment[0].tplId)).limit(1)
        : [];
      const driver = shipment[0].assignedDriverId
        ? await db.select({ name: users.name, phone: users.phone }).from(users).where(eq(users.id, shipment[0].assignedDriverId)).limit(1)
        : [];
      const events = await db.select().from(trackingEvents).where(eq(trackingEvents.shipmentId, input.id)).orderBy(trackingEvents.createdAt);
      const creator = await db.select({ name: users.name }).from(users).where(eq(users.id, shipment[0].createdBy)).limit(1);

      return {
        ...shipment[0],
        destinationBranch: branch[0]?.name || "Unknown",
        tplName: tpl[0]?.name || null,
        driverName: driver[0]?.name || null,
        driverPhone: driver[0]?.phone || null,
        creatorName: creator[0]?.name || "Unknown",
        trackingEvents: events,
      };
    }),

  // ── CANCEL SHIPMENT ──
  cancel: adminQuery
    .input(z.object({ shipmentId: z.number(), reason: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      await db.update(shipments).set({ status: "cancelled" }).where(eq(shipments.id, input.shipmentId));
      await db.insert(trackingEvents).values({
        shipmentId: input.shipmentId,
        eventType: "cancelled",
        oldStatus: "cancelled",
        notes: `Cancelled by ${ctx.user.name}. Reason: ${input.reason}`,
        createdBy: ctx.user.id,
        actorRole: ctx.user.role,
      });
      return { success: true };
    }),

  // ── STATS ──
  stats: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const allShipments = await db.select().from(shipments);

    // Role filter
    let filtered = allShipments;
    if (ctx.user.role === "driver") {
      filtered = allShipments.filter(s => s.assignedDriverId === ctx.user.id);
    }

    return {
      total: filtered.length,
      created: filtered.filter(s => s.status === "created").length,
      labeled: filtered.filter(s => s.status === "labeled").length,
      active: filtered.filter(s => !["delivered", "completed", "cancelled"].includes(s.status)).length,
      delivered: filtered.filter(s => s.status === "delivered" || s.status === "completed").length,
      cancelled: filtered.filter(s => s.status === "cancelled").length,
    };
  }),

  // ── DRIVER DELIVERIES ──
  myDeliveries: driverQuery
    .input(z.object({
      page: z.number().default(1),
      limit: z.number().default(20),
    }).optional())
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const page = input?.page ?? 1;
      const limit = input?.limit ?? 20;
      const offset = (page - 1) * limit;

      const results = await db.select().from(shipments)
        .where(eq(shipments.assignedDriverId, ctx.user.id))
        .orderBy(desc(shipments.createdAt))
        .limit(limit)
        .offset(offset);

      return results;
    }),

  // ── QR SCAN VALIDATE ──
  qrValidate: authedQuery
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const db = getDb();
      const result = await db.select().from(shipments).where(eq(shipments.qrCodeToken, input.token)).limit(1);
      if (!result[0]) return null;
      const branch = await db.select().from(branches).where(eq(branches.id, result[0].destBranchId)).limit(1);
      return { ...result[0], destinationBranch: branch[0]?.name || "Unknown" };
    }),
});
