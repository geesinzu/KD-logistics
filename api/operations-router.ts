import { z } from "zod";
import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, eq, desc, or, sql, isNull, like } from "drizzle-orm";
import {
  activityLog,
  branches,
  branchTransfers,
  branchTransferEvents,
  operationFiles,
  shipments,
  users,
} from "@db/schema";
import { createRouter, kediQuery, superAdminQuery } from "./middleware";
import { getDb } from "./queries/connection";
import {
  fileInput,
  DOCUMENT_KINDS,
  transferActionInput,
  transferCreateInput,
  TRANSFER_STATUSES,
} from "@contracts/operations";
import { decodeUpload, fileMetadata, saveFiles } from "./lib/private-files";
import {
  approver,
  requireOrigin,
  requireTransferRead,
  transferPlan,
  transferReference,
} from "./lib/operations-policy";
import { assertShipmentReadAccess } from "./lib/shipment-access";
import {
  operationsReady,
  requireOperationsReady,
  enableOperations,
} from "./lib/operations-schema";
const digest = (input: unknown) =>
  createHash("sha256").update(JSON.stringify(input)).digest("hex");
function publicRecord<T extends { clientKey: string; requestHash: string }>(
  record: T
) {
  const { clientKey, requestHash, ...visible } = record;
  void clientKey;
  void requestHash;
  return visible;
}
const conflict = () =>
  new TRPCError({
    code: "CONFLICT",
    message:
      "This record changed or the request was already used. Refresh before trying again.",
  });
const safeQuery = kediQuery.use(async ({ next }) => {
  const result = await next();
  if (!result.ok && result.error.code === "INTERNAL_SERVER_ERROR")
    return {
      ...result,
      error: new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          "Could not save or load this record. Please retry; contact Super Admin if it continues.",
      }),
    };
  return result;
});
const safeAdmin = superAdminQuery.use(async ({ next }) => {
  const result = await next();
  if (!result.ok && result.error.code === "INTERNAL_SERVER_ERROR")
    return {
      ...result,
      error: new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          "Could not complete this operation. Existing shipments have not been changed.",
      }),
    };
  return result;
});
const positiveId = z.number().int().positive();
const documentWriteRoles = [
  "super_admin",
  "admin",
  "logistics_officer",
  "warehouse_supply",
  "shipment_creator",
  "branch_manager",
  "driver",
];

export const operationsRouter = createRouter({
  status: safeQuery.query(async () => ({ ready: await operationsReady() })),
  enable: safeAdmin.mutation(async ({ ctx }) => {
    await enableOperations();
    await getDb()
      .insert(activityLog)
      .values({
        userId: ctx.user.id,
        action: "enable_operations",
        entityType: "system",
        details: { features: ["shipment_documents", "branch_transfers"] },
      });
    return { ready: true };
  }),
  library: safeQuery
    .input(
      z.object({
        search: z.string().trim().max(100).optional(),
        kind: z.enum(DOCUMENT_KINDS).optional(),
        page: z.number().int().min(1).default(1),
      })
    )
    .query(async ({ ctx, input }) => {
      await requireOperationsReady();
      const filters = [
        eq(operationFiles.parentType, "shipment"),
        isNull(operationFiles.removedAt),
      ];
      if (ctx.user.role === "driver")
        filters.push(eq(shipments.assignedDriverId, ctx.user.id));
      if (ctx.user.role === "branch_manager")
        filters.push(
          ctx.user.branchId
            ? or(
                eq(shipments.destBranchId, ctx.user.branchId),
                eq(shipments.hubBranchId, ctx.user.branchId)
              )!
            : sql`1 = 0`
        );
      if (input.kind) filters.push(eq(operationFiles.kind, input.kind));
      if (input.search)
        filters.push(
          or(
            like(operationFiles.name, `%${input.search}%`),
            like(shipments.trackingId, `%${input.search}%`)
          )!
        );
      const where = and(...filters);
      const [items, count] = await Promise.all([
        getDb()
          .select({ ...fileMetadata, trackingId: shipments.trackingId })
          .from(operationFiles)
          .innerJoin(shipments, eq(shipments.id, operationFiles.parentId))
          .where(where)
          .orderBy(desc(operationFiles.id))
          .limit(20)
          .offset((input.page - 1) * 20),
        getDb()
          .select({ count: sql<number>`count(*)` })
          .from(operationFiles)
          .innerJoin(shipments, eq(shipments.id, operationFiles.parentId))
          .where(where),
      ]);
      return { items, total: Number(count[0].count) };
    }),
  documents: safeQuery
    .input(z.object({ shipmentId: positiveId }))
    .query(async ({ ctx, input }) => {
      await requireOperationsReady();
      const [shipment] = await getDb()
        .select()
        .from(shipments)
        .where(eq(shipments.id, input.shipmentId))
        .limit(1);
      if (!shipment) throw new TRPCError({ code: "NOT_FOUND" });
      assertShipmentReadAccess(ctx, shipment);
      return getDb()
        .select(fileMetadata)
        .from(operationFiles)
        .where(
          and(
            eq(operationFiles.parentType, "shipment"),
            eq(operationFiles.parentId, input.shipmentId)
          )
        )
        .orderBy(desc(operationFiles.id));
    }),
  uploadDocument: safeQuery
    .input(
      z.object({
        shipmentId: positiveId,
        kind: z.enum(DOCUMENT_KINDS),
        file: fileInput,
        clientKey: z.string().uuid(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!documentWriteRoles.includes(ctx.user.role))
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This account can view documents but cannot upload them.",
        });
      await requireOperationsReady();
      const file = decodeUpload(input.file);
      return getDb().transaction(async tx => {
        const [shipment] = await tx
          .select()
          .from(shipments)
          .where(eq(shipments.id, input.shipmentId))
          .limit(1)
          .for("update");
        if (!shipment) throw new TRPCError({ code: "NOT_FOUND" });
        assertShipmentReadAccess(ctx, shipment);
        const [existing] = await tx
          .select({ ...fileMetadata, sha256: operationFiles.sha256 })
          .from(operationFiles)
          .where(eq(operationFiles.clientKey, input.clientKey))
          .limit(1);
        if (existing) {
          if (
            existing.parentType !== "shipment" ||
            existing.parentId !== input.shipmentId ||
            existing.uploadedBy !== ctx.user.id ||
            existing.sha256 !== file.sha256 ||
            existing.kind !== input.kind ||
            existing.name !== file.name
          )
            throw conflict();
          return { success: true };
        }
        await saveFiles(
          tx,
          "shipment",
          input.shipmentId,
          "document",
          input.kind,
          [file],
          ctx.user,
          undefined,
          input.clientKey
        );
        await tx
          .insert(activityLog)
          .values({
            userId: ctx.user.id,
            action: "upload_document",
            entityType: "shipment",
            entityId: input.shipmentId,
            details: {
              shipmentId: input.shipmentId,
              name: file.name,
              kind: input.kind,
              size: file.size,
              sha256: file.sha256,
            },
          });
        return { success: true };
      });
    }),
  removeDocument: safeAdmin
    .input(
      z.object({ id: positiveId, reason: z.string().trim().min(5).max(1000) })
    )
    .mutation(async ({ ctx, input }) => {
      await requireOperationsReady();
      return getDb().transaction(async tx => {
        const [file] = await tx
          .select(fileMetadata)
          .from(operationFiles)
          .where(eq(operationFiles.id, input.id))
          .limit(1)
          .for("update");
        if (!file || file.removedAt)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Document no longer available.",
          });
        if (file.parentType !== "shipment")
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "Transfer photo evidence cannot be removed through document controls.",
          });
        await tx
          .update(operationFiles)
          .set({
            content: null,
            removedAt: new Date(),
            removedBy: ctx.user.id,
            removalReason: input.reason,
          })
          .where(eq(operationFiles.id, file.id));
        await tx
          .insert(activityLog)
          .values({
            userId: ctx.user.id,
            action: "remove_document",
            entityType: "shipment",
            entityId: file.parentId,
            details: { fileId: file.id, name: file.name, reason: input.reason },
          });
        return { success: true };
      });
    }),
  transfers: safeQuery
    .input(
      z.object({
        status: z.enum(TRANSFER_STATUSES).optional(),
        search: z.string().trim().max(100).optional(),
        page: z.number().int().min(1).default(1),
        branchId: positiveId.optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      await requireOperationsReady();
      const user = ctx.user;
      if (
        !approver(user) &&
        user.role !== "viewer" &&
        user.role !== "branch_manager"
      )
        throw new TRPCError({ code: "FORBIDDEN" });
      const filters = [];
      if (user.role === "branch_manager")
        filters.push(
          user.branchId
            ? or(
                eq(branchTransfers.sourceBranchId, user.branchId),
                eq(branchTransfers.destinationBranchId, user.branchId)
              )
            : sql`1 = 0`
        );
      if (input.status) filters.push(eq(branchTransfers.status, input.status));
      if (input.branchId)
        filters.push(
          or(
            eq(branchTransfers.sourceBranchId, input.branchId),
            eq(branchTransfers.destinationBranchId, input.branchId)
          )
        );
      if (input.search) {
        const numeric = Number(input.search.replace(/^KBT-/i, ""));
        filters.push(
          or(
            like(branchTransfers.description, `%${input.search}%`),
            like(branchTransfers.companyName, `%${input.search}%`),
            Number.isSafeInteger(numeric) && numeric > 0
              ? eq(branchTransfers.id, numeric)
              : sql`1 = 0`
          )
        );
      }
      const where = filters.length ? and(...filters) : undefined;
      const [items, count, offices] = await Promise.all([
        getDb()
          .select()
          .from(branchTransfers)
          .where(where)
          .orderBy(desc(branchTransfers.id))
          .limit(20)
          .offset((input.page - 1) * 20),
        getDb()
          .select({ count: sql<number>`count(*)` })
          .from(branchTransfers)
          .where(where),
        getDb().select({ id: branches.id, name: branches.name }).from(branches),
      ]);
      return {
        items: items.map(t => ({
          ...publicRecord(t),
          reference: transferReference(t.id),
          sourceName:
            offices.find(b => b.id === t.sourceBranchId)?.name ??
            "Branch unavailable",
          destinationName:
            offices.find(b => b.id === t.destinationBranchId)?.name ??
            "Branch unavailable",
        })),
        total: Number(count[0].count),
      };
    }),
  transfer: safeQuery
    .input(z.object({ id: positiveId }))
    .query(async ({ ctx, input }) => {
      await requireOperationsReady();
      const [transfer] = await getDb()
        .select()
        .from(branchTransfers)
        .where(eq(branchTransfers.id, input.id))
        .limit(1);
      if (!transfer)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Transfer not found.",
        });
      requireTransferRead(ctx.user, transfer);
      const [events, files, offices] = await Promise.all([
        getDb()
          .select()
          .from(branchTransferEvents)
          .where(eq(branchTransferEvents.transferId, transfer.id))
          .orderBy(branchTransferEvents.id),
        getDb()
          .select(fileMetadata)
          .from(operationFiles)
          .where(
            and(
              eq(operationFiles.parentType, "transfer"),
              eq(operationFiles.parentId, transfer.id),
              isNull(operationFiles.removedAt)
            )
          )
          .orderBy(operationFiles.id),
        getDb()
          .select({ id: branches.id, name: branches.name })
          .from(branches)
          .where(
            or(
              eq(branches.id, transfer.sourceBranchId),
              eq(branches.id, transfer.destinationBranchId)
            )
          ),
      ]);
      return {
        ...publicRecord(transfer),
        reference: transferReference(transfer.id),
        sourceName:
          offices.find(b => b.id === transfer.sourceBranchId)?.name ??
          "Branch unavailable",
        destinationName:
          offices.find(b => b.id === transfer.destinationBranchId)?.name ??
          "Branch unavailable",
        events: events.map(publicRecord),
        files,
      };
    }),
  requestTransfer: safeQuery
    .input(transferCreateInput)
    .mutation(async ({ ctx, input }) => {
      await requireOperationsReady();
      if (!approver(ctx.user)) requireOrigin(ctx.user, input.sourceBranchId);
      const files = input.photos.map(f => decodeUpload(f, true));
      const requestHash = digest({
        ...input,
        photos: files.map(f => f.sha256),
      });
      // Serialize a requester's retries using their account row. This also
      // revalidates the current branch/role while the request is committed.
      return getDb().transaction(async tx => {
        const [actor] = await tx
          .select()
          .from(users)
          .where(eq(users.id, ctx.user.id))
          .limit(1)
          .for("update");
        if (!actor || actor.status !== "active")
          throw new TRPCError({ code: "FORBIDDEN" });
        if (!approver(actor)) requireOrigin(actor, input.sourceBranchId);
        const [previous] = await tx
          .select()
          .from(branchTransfers)
          .where(eq(branchTransfers.clientKey, input.clientKey))
          .limit(1);
        if (previous) {
          if (
            previous.requestedBy !== actor.id ||
            previous.requestHash !== requestHash
          )
            throw conflict();
          return { id: previous.id, reference: transferReference(previous.id) };
        }
        const offices = await tx
          .select()
          .from(branches)
          .where(
            or(
              eq(branches.id, input.sourceBranchId),
              eq(branches.id, input.destinationBranchId)
            )
          );
        if (offices.length !== 2 || offices.some(b => b.status !== "active"))
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Choose two different active branch offices.",
          });
        const [result] = await tx
          .insert(branchTransfers)
          .values({
            clientKey: input.clientKey,
            requestHash,
            sourceBranchId: input.sourceBranchId,
            destinationBranchId: input.destinationBranchId,
            description: input.description,
            quantity: input.quantity,
            unit: input.unit,
            reason: input.reason,
            requestedBy: actor.id,
            ...input.transport,
          });
        const id = result.insertId;
        const [event] = await tx
          .insert(branchTransferEvents)
          .values({
            transferId: id,
            clientKey: input.clientKey,
            requestHash,
            action: "request",
            actorId: actor.id,
            actorName: actor.name,
            actorRole: actor.role,
            quantity: input.quantity,
            note: input.reason,
            statusAfter: "requested",
          });
        await saveFiles(
          tx,
          "transfer",
          id,
          "request",
          "transfer_photo",
          files,
          actor,
          event.insertId
        );
        await tx
          .insert(activityLog)
          .values({
            userId: actor.id,
            action: "request_branch_transfer",
            entityType: "branch_transfer",
            entityId: id,
            details: {
              sourceBranchId: input.sourceBranchId,
              destinationBranchId: input.destinationBranchId,
              quantity: input.quantity,
              photoCount: files.length,
            },
          });
        return { id, reference: transferReference(id) };
      });
    }),
  updateTransfer: safeQuery
    .input(transferActionInput)
    .mutation(async ({ ctx, input }) => {
      await requireOperationsReady();
      const files =
        "photos" in input ? input.photos.map(f => decodeUpload(f, true)) : [];
      const requestHash = digest({
        ...input,
        ...("photos" in input ? { photos: files.map(f => f.sha256) } : {}),
      });
      return getDb().transaction(async tx => {
        const [t] = await tx
          .select()
          .from(branchTransfers)
          .where(eq(branchTransfers.id, input.id))
          .limit(1)
          .for("update");
        if (!t) throw new TRPCError({ code: "NOT_FOUND" });
        const [actor] = await tx
          .select()
          .from(users)
          .where(eq(users.id, ctx.user.id))
          .limit(1)
          .for("update");
        if (!actor || actor.status !== "active")
          throw new TRPCError({ code: "FORBIDDEN" });
        requireTransferRead(actor, t);
        const [previous] = await tx
          .select()
          .from(branchTransferEvents)
          .where(eq(branchTransferEvents.clientKey, input.clientKey))
          .limit(1);
        if (previous) {
          if (
            previous.transferId !== t.id ||
            previous.actorId !== actor.id ||
            previous.requestHash !== requestHash
          )
            throw conflict();
          return { id: t.id, status: t.status };
        }
        if (t.version !== input.expectedVersion) throw conflict();
        const plan = transferPlan(actor, t, input);
        const now = new Date();
        const patch: Partial<typeof branchTransfers.$inferInsert> = {
          ...plan,
          version: t.version + 1,
        };
        if (input.action === "approve")
          Object.assign(patch, { approvedBy: actor.id, approvedAt: now });
        if (input.action === "dispatch") {
          const [photo] = await tx
            .select({ id: operationFiles.id })
            .from(operationFiles)
            .where(
              and(
                eq(operationFiles.parentType, "transfer"),
                eq(operationFiles.parentId, t.id),
                eq(operationFiles.stage, "request"),
                isNull(operationFiles.removedAt)
              )
            )
            .limit(1);
          if (!photo)
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message:
                "The sending branch's item photos are required before dispatch.",
            });
          Object.assign(patch, {
            ...input.transport,
            dispatchedBy: actor.id,
            dispatchedAt: now,
          });
        }
        if (input.action === "receive" && plan.status === "received")
          patch.receivedAt = now;
        await tx
          .update(branchTransfers)
          .set(patch)
          .where(eq(branchTransfers.id, t.id));
        const [event] = await tx
          .insert(branchTransferEvents)
          .values({
            transferId: t.id,
            clientKey: input.clientKey,
            requestHash,
            action: input.action,
            actorId: actor.id,
            actorName: actor.name,
            actorRole: actor.role,
            quantity:
              input.action === "receive"
                ? input.quantity
                : input.action === "dispatch"
                  ? t.quantity
                  : null,
            note: input.note,
            statusAfter: plan.status,
          });
        if (files.length)
          await saveFiles(
            tx,
            "transfer",
            t.id,
            input.action === "receive" ? "receipt" : "dispatch",
            "transfer_photo",
            files,
            actor,
            event.insertId
          );
        await tx
          .insert(activityLog)
          .values({
            userId: actor.id,
            action: `${input.action}_branch_transfer`,
            entityType: "branch_transfer",
            entityId: t.id,
            details: {
              before: {
                status: t.status,
                receivedQty: t.receivedQty,
                version: t.version,
              },
              after: {
                status: plan.status,
                receivedQty:
                  "receivedQty" in plan ? plan.receivedQty : t.receivedQty,
                version: t.version + 1,
              },
              eventId: event.insertId,
              note: input.note,
              photoCount: files.length,
            },
          });
        return { id: t.id, status: plan.status };
      });
    }),
});
