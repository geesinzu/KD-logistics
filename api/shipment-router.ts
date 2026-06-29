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

// Helper to get 3PL name
async function getTplName(db: any, tplId: number): Promise<string> {
  const tpl = await db.select().from(thirdPartyLogistics).where(eq(thirdPartyLogistics.id, tplId)).limit(1);
  return tpl[0]?.name || `3PL #${tplId}`;
}

// Helper to get driver name
async function getDriverName(db: any, driverId: number): Promise<string> {
  const driver = await db.select({ name: users.name }).from(users).where(eq(users.id, driverId)).limit(1);
  return driver[0]?.name || `Driver #${driverId}`;
}

export const shipmentRouter = createRouter({
  // ── CREATE SHIPMENT (Step 1) ──
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
      await db.insert(trackingEvents).values({
        shipmentId,
        eventType: "created",
        newStatus: "created",
        notes: `Shipment created by ${ctx.user.name} for ${input.receiverName || "branch"}`,
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
        notes: `${input.actualItemCount} items logged. Location: ${input.storageLocation}`,
        createdBy: ctx.user.id,
        actorRole: ctx.user.role,
      });
      await db.insert(trackingEvents).values({
        shipmentId: input.shipmentId,
        eventType: "label_generated",
        newStatus: "labeled",
        notes: `Shipping label generated: ${trackingId}`,
        createdBy: ctx.user.id,
        actorRole: ctx.user.role,
      });
      return { success: true, trackingId, qrToken };
    }),

  // ── LOGISTICS: ASSIGN TO 3PL (Step 4) ──
  // If "3PL picks up directly" -> notify 3PL immediately
  // If "KEDI driver drops" -> notify driver to pick up
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
      const tplName = await getTplName(db, input.tplId);

      if (input.tplPickupType === "kedi_driver_drop") {
        // KEDI DRIVER DROPS: assign driver, driver gets notification
        const driverName = input.assignedDriverId ? await getDriverName(db, input.assignedDriverId) : "Unassigned";

        await db.update(shipments)
          .set({
            tplId: input.tplId,
            tplPickupType: "kedi_driver_drop",
            assignedDriverId: input.assignedDriverId,
            logisticsOfficerId: ctx.user.id,
            status: "waiting_driver_pickup",
            assignedAt: new Date(),
            estimatedDeliveryDate: input.estimatedDeliveryDate ? new Date(input.estimatedDeliveryDate) : null,
            specialInstructions: input.specialInstructions,
          })
          .where(eq(shipments.id, input.shipmentId));

        // Tracking: driver assignment notification
        await db.insert(trackingEvents).values({
          shipmentId: input.shipmentId,
          eventType: "assigned_to_3pl",
          oldStatus: "labeled",
          newStatus: "waiting_driver_pickup",
          notes: `Assigned to driver: ${driverName} -> drops at ${tplName}. ${input.specialInstructions || ""}`,
          createdBy: ctx.user!.id,
          actorRole: ctx.user!.role,
        });
      } else {
        // 3PL PICKS UP DIRECTLY: notify 3PL to come pickup
        await db.update(shipments)
          .set({
            tplId: input.tplId,
            tplPickupType: "tpl_pickup_direct",
            logisticsOfficerId: ctx.user.id,
            status: "waiting_3pl_pickup",
            assignedAt: new Date(),
            estimatedDeliveryDate: input.estimatedDeliveryDate ? new Date(input.estimatedDeliveryDate) : null,
            specialInstructions: input.specialInstructions,
          })
          .where(eq(shipments.id, input.shipmentId));

        // Tracking: 3PL notification to pickup
        await db.insert(trackingEvents).values({
          shipmentId: input.shipmentId,
          eventType: "assigned_to_3pl",
          oldStatus: "labeled",
          newStatus: "waiting_3pl_pickup",
          notes: `${tplName} notified: Pick up from Lagos HQ warehouse. ${input.specialInstructions || ""}`,
          createdBy: ctx.user.id,
          actorRole: ctx.user.role,
        });
      }

      return { success: true, tplName };
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
      await db.update(shipments).set({ status: "picked_up" }).where(eq(shipments.id, input.shipmentId));
      await db.insert(trackingEvents).values({
        shipmentId: input.shipmentId,
        eventType: "driver_pickup_confirmed",
        oldStatus: "waiting_driver_pickup",
        newStatus: "picked_up",
        notes: `Driver ${ctx.user.name} picked up from warehouse. Qty verified: ${input.qtyMatch ? "Yes" : "No"}. ${input.notes || ""}`,
        createdBy: ctx.user.id,
        actorRole: ctx.user.role,
      });
      return { success: true };
    }),

  // ── DRIVER: DROP AT 3PL (Step 6A) ──
  // After driver drops, 3PL gets notified to confirm receipt
  driverDropAt3pl: driverQuery
    .input(z.object({
      shipmentId: z.number(),
      tplRepName: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const shipment = await db.select().from(shipments).where(eq(shipments.id, input.shipmentId)).limit(1);
      const tplName = shipment[0]?.tplId ? await getTplName(db, shipment[0].tplId) : "3PL";

      await db.update(shipments).set({ status: "at_3pl" }).where(eq(shipments.id, input.shipmentId));

      // Tracking: shipment now at 3PL -> 3PL gets notification to confirm
      await db.insert(trackingEvents).values({
        shipmentId: input.shipmentId,
        eventType: "driver_dropoff_at_3pl",
        oldStatus: "picked_up",
        newStatus: "at_3pl",
        notes: `Driver ${ctx.user.name} dropped at ${tplName}. Rep: ${input.tplRepName || "N/A"}. ${tplName} must confirm receipt.`,
        createdBy: ctx.user.id,
        actorRole: ctx.user.role,
      });

      return { success: true, message: `${tplName} has been notified to confirm receipt.` };
    }),

  // ── 3PL: PICK UP FROM WAREHOUSE DIRECTLY (Step 6B) ──
  // When 3PL picks up from warehouse themselves
  tplPickupFromWarehouse: authedQuery
    .input(z.object({
      shipmentId: z.number(),
      receivedQty: z.number(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      await db.update(shipments)
        .set({ status: "picked_up_by_3pl", tplConfirmedQty: input.receivedQty })
        .where(eq(shipments.id, input.shipmentId));

      const actorId = ctx.user?.id ?? ctx.tplUser?.id ?? 0;
      const actorRole = ctx.user?.role ?? ctx.tplUser?.role ?? "unknown";
      await db.insert(trackingEvents).values({
        shipmentId: input.shipmentId,
        eventType: "tpl_pickup_from_warehouse",
        oldStatus: "waiting_3pl_pickup",
        newStatus: "picked_up_by_3pl",
        notes: `3PL picked up ${input.receivedQty} items from warehouse directly. ${input.notes || ""}`,
        createdBy: actorId,
        actorRole: actorRole,
        actorType: ctx.tplUser ? "tpl_user" : "kedi_user",
      });

      return { success: true };
    }),

  // ── 3PL: CONFIRM RECEIPT (Step 7) ──
  // 3PL logs in, confirms they received the shipment, verifies qty
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
      const conditionText = input.condition === "good" ? "All items in good condition"
        : input.condition === "partial" ? "Some items damaged/missing"
        : "Items significantly damaged";

      await db.update(shipments)
        .set({
          tplConfirmedQty: input.receivedQty,
          tplCondition: input.condition,
          tplConfirmedAt: new Date(),
          tplNotes: input.notes,
          status: "tpl_confirmed",
        })
        .where(eq(shipments.id, input.shipmentId));

      const actorId2 = ctx.user?.id ?? ctx.tplUser?.id ?? 0;
      const actorRole2 = ctx.user?.role ?? ctx.tplUser?.role ?? "unknown";
      await db.insert(trackingEvents).values({
        shipmentId: input.shipmentId,
        eventType: "tpl_receipt_confirmed",
        oldStatus: shipment[0].status,
        newStatus: "tpl_confirmed",
        notes: `3PL confirmed receipt: ${input.receivedQty}/${totalQty} items. ${conditionText}. ${input.notes || ""}`,
        createdBy: actorId2,
        actorRole: actorRole2,
        actorType: ctx.tplUser ? "tpl_user" : "kedi_user",
      });

      return { success: true, totalQty, receivedQty: input.receivedQty };
    }),

  // ── 3PL: UPDATE LOCATION / DELIVERY STATUS (Step 8) ──
  // 3PL can always update status, location, partial delivery
  tplUpdateLocation: authedQuery
    .input(z.object({
      shipmentId: z.number(),
      location: z.string(),
      updateType: z.enum(["location_update", "partial_delivery", "full_delivery", "delay_reported"]),
      deliveredQty: z.number().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const shipment = await db.select().from(shipments).where(eq(shipments.id, input.shipmentId)).limit(1);
      if (!shipment[0]) throw new Error("Shipment not found");

      let newStatus = shipment[0].status;
      let eventNotes = "";

      if (input.updateType === "partial_delivery") {
        newStatus = "partially_delivered";
        const prevDelivered = shipment[0].deliveredQty || 0;
        const totalDelivered = prevDelivered + (input.deliveredQty || 0);
        const remaining = (shipment[0].actualItemCount || 0) - totalDelivered;
        await db.update(shipments)
          .set({ status: newStatus, deliveredQty: totalDelivered, remainingQty: remaining > 0 ? remaining : 0 })
          .where(eq(shipments.id, input.shipmentId));
        eventNotes = `Partial delivery: ${input.deliveredQty} items at ${input.location}. Remaining: ${remaining}`;
      } else if (input.updateType === "full_delivery") {
        newStatus = "delivered";
        await db.update(shipments)
          .set({ status: "delivered", deliveredAt: new Date(), deliveredQty: shipment[0].actualItemCount, remainingQty: 0 })
          .where(eq(shipments.id, input.shipmentId));
        eventNotes = `Full delivery completed at ${input.location}. All ${shipment[0].actualItemCount} items delivered.`;
      } else if (input.updateType === "delay_reported") {
        eventNotes = `Delay reported at ${input.location}: ${input.notes || ""}`;
      } else {
        newStatus = "in_transit_with_3pl";
        await db.update(shipments).set({ status: newStatus }).where(eq(shipments.id, input.shipmentId));
        eventNotes = `In transit: ${input.location}. ${input.notes || ""}`;
      }

      const actorId3 = ctx.user?.id ?? ctx.tplUser?.id ?? 0;
      const actorRole3 = ctx.user?.role ?? ctx.tplUser?.role ?? "unknown";
      await db.insert(trackingEvents).values({
        shipmentId: input.shipmentId,
        eventType: input.updateType === "partial_delivery" ? "tpl_partial_delivery"
          : input.updateType === "full_delivery" ? "tpl_full_delivery"
          : input.updateType === "delay_reported" ? "delay_reported"
          : "tpl_location_update",
        oldStatus: shipment[0].status,
        newStatus,
        location: input.location,
        notes: eventNotes,
        qtyDelivered: input.deliveredQty,
        createdBy: actorId3,
        actorRole: actorRole3,
        actorType: ctx.tplUser ? "tpl_user" : "kedi_user",
      });

      return { success: true, newStatus };
    }),

  // ── COMPLETE SHIPMENT (Step 9) ──
  complete: authedQuery
    .input(z.object({ shipmentId: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(shipments).set({ status: "completed", completedAt: new Date() }).where(eq(shipments.id, input.shipmentId));
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

      if (ctx.user?.role === "driver") {
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
        estimatedItemCount: shipments.estimatedItemCount,
        tplId: shipments.tplId,
        assignedDriverId: shipments.assignedDriverId,
        priority: shipments.priority,
        createdAt: shipments.createdAt,
        updatedAt: shipments.updatedAt,
      })
        .from(shipments)
        .where(where)
        .orderBy(desc(shipments.createdAt))
        .limit(limit)
        .offset(offset);

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

  // ── LIST SHIPMENTS FOR 3PL (TPL users only) ──
  listForTpl: authedQuery
    .input(z.object({
      status: z.string().optional(),
      page: z.number().default(1),
      limit: z.number().default(50),
    }).optional())
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const tplId = ctx.tplUser?.tplId;
      if (!tplId && ctx.user?.role !== "super_admin" && ctx.user?.role !== "admin" && ctx.user?.role !== "logistics_officer") {
        return { shipments: [], total: 0 };
      }

      const conditions = [];
      if (input?.status) conditions.push(eq(shipments.status, input.status as any));

      // TPL users only see their own shipments
      if (ctx.tplUser) {
        conditions.push(eq(shipments.tplId, ctx.tplUser.tplId));
      } else if (input && "tplId" in input && (input as any).tplId) {
        conditions.push(eq(shipments.tplId, (input as any).tplId));
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const results = await db.select({
        id: shipments.id,
        trackingId: shipments.trackingId,
        status: shipments.status,
        destBranchId: shipments.destBranchId,
        receiverName: shipments.receiverName,
        actualItemCount: shipments.actualItemCount,
        itemDetails: shipments.itemDetails,
        tplId: shipments.tplId,
        tplPickupType: shipments.tplPickupType,
        assignedDriverId: shipments.assignedDriverId,
        priority: shipments.priority,
        createdAt: shipments.createdAt,
        updatedAt: shipments.updatedAt,
        deliveredQty: shipments.deliveredQty,
        remainingQty: shipments.remainingQty,
      })
        .from(shipments)
        .where(where)
        .orderBy(desc(shipments.createdAt))
        .limit(input?.limit ?? 50)
        .offset(((input?.page ?? 1) - 1) * (input?.limit ?? 50));

      const branchIds = [...new Set(results.map(s => s.destBranchId).filter(Boolean))];
      const branchList = branchIds.length > 0
        ? await db.select().from(branches).where(inArray(branches.id, branchIds as number[]))
        : [];

      const enriched = results.map(s => ({
        ...s,
        destinationBranch: branchList.find(b => b.id === s.destBranchId)?.name || "Unknown",
      }));

      const countResult = await db.select({ count: sql<number>`count(*)` }).from(shipments).where(where);
      return { shipments: enriched, total: countResult[0]?.count ?? 0 };
    }),

  // ── GET SINGLE SHIPMENT + TRACKING HISTORY ──
  getById: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const shipment = await db.select().from(shipments).where(eq(shipments.id, input.id)).limit(1);
      if (!shipment[0]) return null;

      const branch = await db.select().from(branches).where(eq(branches.id, shipment[0].destBranchId)).limit(1);
      const originBranch = shipment[0].originBranchId
        ? await db.select().from(branches).where(eq(branches.id, shipment[0].originBranchId)).limit(1)
        : [];
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
        originBranch: originBranch[0]?.name || "Lagos HQ",
        tplName: tpl[0]?.name || null,
        tplPickupType: shipment[0].tplPickupType,
        driverName: driver[0]?.name || null,
        driverPhone: driver[0]?.phone || null,
        creatorName: creator[0]?.name || "Unknown",
        trackingEvents: events,
      };
    }),

  // ── CANCEL ──
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
    let filtered = allShipments;
    if (ctx.user?.role === "driver") {
      filtered = allShipments.filter(s => s.assignedDriverId === ctx.user!.id);
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
    .input(z.object({ page: z.number().default(1), limit: z.number().default(20) }).optional())
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const page = input?.page ?? 1;
      const limit = input?.limit ?? 20;
      const offset = (page - 1) * limit;
      return db.select().from(shipments)
        .where(eq(shipments.assignedDriverId, ctx.user.id))
        .orderBy(desc(shipments.createdAt))
        .limit(limit).offset(offset);
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

  // ── GET TRACKING EVENTS FOR A SHIPMENT ──
  getTrackingHistory: authedQuery
    .input(z.object({ shipmentId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const events = await db.select().from(trackingEvents)
        .where(eq(trackingEvents.shipmentId, input.shipmentId))
        .orderBy(trackingEvents.createdAt);
      return events;
    }),
});
