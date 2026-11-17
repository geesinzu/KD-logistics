import { TRPCError } from "@trpc/server";
import { and, eq, inArray, or } from "drizzle-orm";
import { shipments, thirdPartyLogistics, trackingEvents, activityLog } from "@db/schema";
import type { TrpcContext } from "../context";
import type { getDb } from "../queries/connection";
import { assertTplWriteAccess } from "./shipment-access";
import { withShipmentLock } from "./shipment-transaction";
import { tplCorrectionBlockReason } from "@contracts/tpl-correction";

type Database = ReturnType<typeof getDb>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export function assertTplShipmentAccess(ctx: Pick<TrpcContext, "tplUser">, tplId: number | null) {
  if (ctx.tplUser && ctx.tplUser.tplId !== tplId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "This shipment is not assigned to your 3PL company." });
  }
}

// Serialize 3PL writes with assignment corrections. A former company cannot
// pass a stale ownership check, wait for a correction, then update the shipment.
export async function withAssignedShipment<T>(db: Database, ctx: Pick<TrpcContext, "user" | "tplUser">, shipmentId: number, work: (tx: Transaction, shipment: typeof shipments.$inferSelect, afterCommit: (effect: () => Promise<unknown>) => void) => Promise<T>) {
  assertTplWriteAccess(ctx);
  return withShipmentLock(db, shipmentId, (tx, shipment, afterCommit) => {
    assertTplShipmentAccess(ctx, shipment.tplId);
    return work(tx, shipment, afterCommit);
  });
}

export type TplCorrectionInput = { shipmentId: number; expectedTplId: number; expectedStatus: string; correctTplId: number; reason: string };

export async function correctTplAssignment(db: Database, input: TplCorrectionInput, actorId: number) {
  return db.transaction(async tx => {
    const [before] = await tx.select().from(shipments).where(eq(shipments.id, input.shipmentId)).limit(1).for("update");
    if (!before) throw new TRPCError({ code: "NOT_FOUND", message: "Shipment not found." });
    if (before.tplId !== input.expectedTplId || before.status !== input.expectedStatus) throw new TRPCError({ code: "CONFLICT", message: "The shipment changed. Refresh its details and review the correction again." });
    const blocked = tplCorrectionBlockReason(before);
    if (blocked) throw new TRPCError({ code: "PRECONDITION_FAILED", message: blocked });
    if (input.correctTplId === before.tplId) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a different 3PL company." });
    const [target] = await tx.select().from(thirdPartyLogistics).where(eq(thirdPartyLogistics.id, input.correctTplId)).limit(1).for("update");
    if (!target || target.status !== "active") throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an active 3PL company." });
    // Do not silently attribute confirmations or delivery activity from a
    // previous company to another company, even if the status was edited back.
    const [tplActivity] = await tx.select({ id: trackingEvents.id }).from(trackingEvents).where(and(
      eq(trackingEvents.shipmentId, input.shipmentId),
      or(eq(trackingEvents.actorType, "tpl_user"), inArray(trackingEvents.eventType, ["tpl_pickup_from_warehouse", "tpl_receipt_confirmed", "tpl_additional_items_received", "tpl_location_update", "tpl_sorting_update", "tpl_processing_update", "tpl_partial_delivery", "tpl_full_delivery", "delay_reported"])),
    )).limit(1);
    if (tplActivity) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This shipment already has 3PL activity. Review those records before changing the company." });
    const [old] = await tx.select({ name: thirdPartyLogistics.name }).from(thirdPartyLogistics).where(eq(thirdPartyLogistics.id, before.tplId!)).limit(1);
    const oldName = old?.name ?? `3PL #${before.tplId}`;
    await tx.update(shipments).set({ tplId: target.id }).where(eq(shipments.id, before.id));
    const [event] = await tx.insert(trackingEvents).values({
      shipmentId: before.id, eventType: "note_added", oldStatus: before.status, newStatus: before.status,
      notes: `3PL assignment corrected from ${oldName} to ${target.name}. Existing driver pickup/drop-off records, dates and delivery stage were preserved. Reason: ${input.reason}`,
      createdBy: actorId, actorRole: "super_admin", actorType: "kedi_user",
    });
    await tx.insert(activityLog).values({ userId: actorId, action: "correct_tpl_assignment", entityType: "shipment", entityId: before.id, details: {
      trackingId: before.trackingId, before: { tplId: before.tplId, tplName: oldName }, after: { tplId: target.id, tplName: target.name },
      reason: input.reason, preservedStatus: before.status, assignedDriverId: before.assignedDriverId,
      originalAssignedAt: before.assignedAt, correctionEventId: event.insertId,
    } });
    // This is a metadata correction, never a re-assignment workflow restart.
    const [after] = await tx.select().from(shipments).where(eq(shipments.id, before.id)).limit(1);
    for (const key of Object.keys(before) as (keyof typeof before)[]) {
      if (key !== "tplId" && key !== "updatedAt" && JSON.stringify(before[key]) !== JSON.stringify(after[key])) throw new Error("Correction changed a protected shipment field; rolled back.");
    }
    return { success: true, tplName: target.name, status: before.status };
  });
}
