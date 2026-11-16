import { TRPCError } from "@trpc/server";
import { and, eq, sql } from "drizzle-orm";
import { shipments, trackingEvents, activityLog } from "@db/schema";
import type { getDb } from "../queries/connection";
import { containsReceiptEvidence, partialDeletePlan, partialQuantityBlockReason, statusWithoutPartial } from "@contracts/partial-delivery";
type Database = ReturnType<typeof getDb>;
type Milestone = "createdAt" | "labeledAt" | "assignedAt" | "deliveredAt" | "completedAt";
type Actor = { id: number; name: string };
const precondition = (message: string) => new TRPCError({ code: "PRECONDITION_FAILED", message });

export async function deleteShipmentEvent(db: Database, eventId: number, actor: Actor, milestoneFields: Record<string, Milestone>) {
  const [reference] = await db.select({ shipmentId: trackingEvents.shipmentId }).from(trackingEvents).where(eq(trackingEvents.id, eventId)).limit(1);
  if (!reference) throw new TRPCError({ code: "NOT_FOUND", message: "Event not found." });
  return db.transaction(async tx => {
    // Same lock order as 3PL writes and assignment corrections.
    const [before] = await tx.select().from(shipments).where(eq(shipments.id, reference.shipmentId)).limit(1).for("update");
    if (!before) throw new TRPCError({ code: "NOT_FOUND", message: "Shipment not found." });
    const history = await tx.select().from(trackingEvents).where(eq(trackingEvents.shipmentId, before.id)).orderBy(trackingEvents.id).for("update");
    const event = history.find(e => e.id === eventId);
    if (!event) throw new TRPCError({ code: "CONFLICT", message: "This event was already removed. Refresh the shipment." });
    const remaining = history.filter(e => e.id !== eventId);
    const laterStatusChange = remaining.some(e => e.id > event.id && e.oldStatus && e.newStatus && e.oldStatus !== e.newStatus);
    let revertedStatus: string | null = !laterStatusChange && event.oldStatus && event.newStatus && event.oldStatus !== event.newStatus && before.status === event.newStatus ? event.oldStatus : null;
    let quantityChange: { deliveredQty: number; remainingQty: number } | null = null;
    const patch: Partial<typeof shipments.$inferInsert> = {};
    if (event.eventType === "tpl_partial_delivery") {
      const corrections = await tx.select({ details: activityLog.details }).from(activityLog).where(and(eq(activityLog.entityId, before.id), eq(activityLog.entityType, "shipment"), eq(activityLog.action, "correct_delivery_quantity"))).for("update");
      const correctedLater = corrections.some(c => Number((c.details as { correctionEventId?: number })?.correctionEventId) > event.id);
      let plan;
      try { plan = partialDeletePlan(before, event, remaining, correctedLater); } catch (e) { throw precondition((e as Error).message); }
      patch.deliveredQty = plan.deliveredQty; patch.remainingQty = plan.remainingQty;
      patch.status = plan.status as typeof before.status;
      quantityChange = { deliveredQty: plan.deliveredQty, remainingQty: plan.remainingQty };
      revertedStatus = plan.status !== before.status ? plan.status : null;
    } else if (revertedStatus) {
      patch.status = revertedStatus as typeof before.status;
      const milestone = milestoneFields[event.eventType];
      if (milestone && milestone !== "createdAt") patch[milestone] = null;
      if (event.eventType === "tpl_receipt_confirmed") Object.assign(patch, { tplConfirmedQty: null, tplCondition: null, tplConfirmedAt: null, tplNotes: null });
    }
    await tx.insert(activityLog).values({ userId: actor.id, action: "delete_tracking_event", entityType: "tracking_event", entityId: event.id, details: {
      shipmentId: before.id, eventType: event.eventType, notes: event.notes, deletedBy: actor.name, revertedStatusTo: revertedStatus,
      qtyDelivered: event.qtyDelivered, oldStatus: event.oldStatus, newStatus: event.newStatus,
      quantityBefore: { deliveredQty: before.deliveredQty, remainingQty: before.remainingQty, status: before.status },
      quantityAfter: quantityChange ? { ...quantityChange, status: patch.status } : null,
    } });
    await tx.delete(trackingEvents).where(eq(trackingEvents.id, event.id));
    if (Object.keys(patch).length) await tx.update(shipments).set(patch).where(eq(shipments.id, before.id));
    return { success: true, revertedStatus, quantityChange };
  });
}

export type PartialTotalInput = { shipmentId: number; expectedDeliveredQty: number | null; expectedRemainingQty: number | null; expectedStatus: string; expectedTotal: number; deliveredQty: number; reason: string };
export async function correctPartialTotal(db: Database, input: PartialTotalInput, actor: Actor) {
  return db.transaction(async tx => {
    const [before] = await tx.select().from(shipments).where(eq(shipments.id, input.shipmentId)).limit(1).for("update");
    if (!before) throw new TRPCError({ code: "NOT_FOUND", message: "Shipment not found." });
    if (before.deliveredQty !== input.expectedDeliveredQty || before.remainingQty !== input.expectedRemainingQty || before.status !== input.expectedStatus || before.actualItemCount !== input.expectedTotal) throw new TRPCError({ code: "CONFLICT", message: "The quantities or delivery stage changed. Refresh and review the correction again." });
    const blocked = partialQuantityBlockReason(before);
    if (blocked) throw precondition(blocked);
    const history = await tx.select().from(trackingEvents).where(eq(trackingEvents.shipmentId, before.id)).orderBy(trackingEvents.id).for("update");
    if (containsReceiptEvidence(history)) throw precondition("Existing delivery or branch receipt evidence requires separate review.");
    const deletions = await tx.select({ id: activityLog.id, details: activityLog.details }).from(activityLog).where(and(
      eq(activityLog.action, "delete_tracking_event"),
      sql`JSON_UNQUOTE(JSON_EXTRACT(${activityLog.details}, '$.shipmentId')) = ${String(before.id)}`,
      sql`JSON_UNQUOTE(JSON_EXTRACT(${activityLog.details}, '$.eventType')) = 'tpl_partial_delivery'`,
    )).orderBy(activityLog.id).for("update");
    const evidence = deletions.filter(d => { const details = d.details as { shipmentId?: number; eventType?: string }; return details?.shipmentId === before.id && details.eventType === "tpl_partial_delivery"; });
    if (!evidence.length) throw precondition("No deleted partial-delivery entry was found for this shipment. Review the source of the quantity discrepancy first.");
    if (!Number.isInteger(input.deliveredQty) || input.deliveredQty < 0 || input.deliveredQty >= input.expectedTotal) throw new TRPCError({ code: "BAD_REQUEST", message: "Enter the confirmed partial total. For a complete delivery, use normal full-delivery confirmation." });
    if (input.deliveredQty === before.deliveredQty && before.remainingQty === before.actualItemCount! - input.deliveredQty) throw new TRPCError({ code: "BAD_REQUEST", message: "These totals are already correct." });
    const fallback = (evidence.at(-1)?.details as { revertedStatusTo?: string | null })?.revertedStatusTo;
    const status = input.deliveredQty > 0 ? "partially_delivered" : statusWithoutPartial(before.status, history, fallback);
    if (!status) throw precondition("The previous delivery stage cannot be established safely. Review the shipment history.");
    const remainingQty = before.actualItemCount! - input.deliveredQty;
    await tx.update(shipments).set({ deliveredQty: input.deliveredQty, remainingQty, status: status as typeof before.status }).where(eq(shipments.id, before.id));
    const [note] = await tx.insert(trackingEvents).values({ shipmentId: before.id, eventType: "note_added", oldStatus: before.status, newStatus: status,
      notes: `Partial-delivery total corrected after an earlier entry was deleted: ${before.deliveredQty ?? 0} → ${input.deliveredQty} delivered out of ${before.actualItemCount}; ${remainingQty} outstanding. This is a cumulative total correction, not an additional delivery. Existing valid delivery entries were kept. Reason: ${input.reason}`,
      createdBy: actor.id, actorRole: "super_admin", actorType: "kedi_user" });
    await tx.insert(activityLog).values({ userId: actor.id, action: "correct_delivery_quantity", entityType: "shipment", entityId: before.id, details: {
      trackingId: before.trackingId, reason: input.reason, deletionAuditIds: evidence.map(e => e.id), correctionEventId: note.insertId,
      before: { deliveredQty: before.deliveredQty, remainingQty: before.remainingQty, status: before.status },
      after: { deliveredQty: input.deliveredQty, remainingQty, status }, actualItemCount: before.actualItemCount,
    } });
    return { success: true, deliveredQty: input.deliveredQty, remainingQty, status };
  });
}
