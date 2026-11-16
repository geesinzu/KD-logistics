export const PARTIAL_EDIT_STAGES = ["at_3pl", "picked_up_by_3pl", "tpl_confirmed", "in_transit_with_3pl", "partially_delivered"] as const;
export type DeliveryQuantityState = {
  status: string; actualItemCount: number | null; deliveredQty: number | null; remainingQty: number | null;
  deliveryReportedBy?: string | null; deliveredAt?: unknown; completedAt?: unknown;
  hubArrivedAt?: unknown; hubAcknowledgedAt?: unknown; onwardDispatchedAt?: unknown;
};
export type QuantityEvent = { id: number; eventType: string; oldStatus: string | null; newStatus: string | null; qtyDelivered?: number | null };
function recorded(value: unknown) {
  if (!value || String(value).startsWith("0000-00-00")) return false;
  const ms = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(ms) && ms > 0;
}
export function partialQuantityBlockReason(s: DeliveryQuantityState) {
  if (!Number.isInteger(s.actualItemCount) || (s.actualItemCount ?? 0) <= 0) return "A confirmed item total is required before changing delivery quantities.";
  if (!(PARTIAL_EDIT_STAGES as readonly string[]).includes(s.status)) return "This shipment has moved beyond partial-delivery editing. Review its receipt records first.";
  if (s.deliveryReportedBy === "branch") return "The branch has recorded receipt quantities. Those records need separate review.";
  if ([s.deliveredAt, s.completedAt, s.hubArrivedAt, s.hubAcknowledgedAt, s.onwardDispatchedAt].some(recorded)) return "Delivery or hub receipt is already recorded. Review it before changing quantities.";
  return null;
}
export function containsReceiptEvidence(events: QuantityEvent[]) {
  return events.some(e => ["tpl_full_delivery", "branch_marked_delivered", "delivery_acknowledged", "hub_acknowledged", "onward_dispatched"].includes(e.eventType));
}
export function statusWithoutPartial(current: string, remainingEvents: QuantityEvent[], fallback?: string | null) {
  if (current !== "partially_delivered") return current;
  const candidates = [...remainingEvents].sort((a, b) => b.id - a.id).map(e => e.newStatus).concat(fallback ?? null);
  return candidates.find(s => s && s !== "partially_delivered" && (PARTIAL_EDIT_STAGES as readonly string[]).includes(s)) ?? null;
}
export function partialDeletePlan(s: DeliveryQuantityState, event: QuantityEvent, remainingEvents: QuantityEvent[], correctedLater = false) {
  const blocked = partialQuantityBlockReason(s);
  if (blocked) throw new Error(blocked);
  if (correctedLater) throw new Error("A later quantity correction has replaced these totals. Review that correction before deleting earlier delivery entries.");
  if (containsReceiptEvidence(remainingEvents)) throw new Error("Other receipt or delivery evidence depends on these quantities. Review it before deleting this entry.");
  const total = s.actualItemCount!, delivered = s.deliveredQty ?? 0, delta = event.qtyDelivered;
  if (!Number.isInteger(delta) || (delta ?? 0) <= 0) throw new Error("This entry has no reliable delivered quantity. Use a reviewed quantity correction instead.");
  if (!Number.isInteger(delivered) || delivered < delta! || delivered >= total || (s.remainingQty != null && s.remainingQty !== total - delivered)) throw new Error("The stored quantities are inconsistent. Use Correct partial-delivery total before deleting more history.");
  const deliveredQty = delivered - delta!, remainingQty = total - deliveredQty;
  const priorStage = event.oldStatus && event.oldStatus !== "partially_delivered" && (PARTIAL_EDIT_STAGES as readonly string[]).includes(event.oldStatus) ? event.oldStatus : null;
  const status = deliveredQty === 0 && s.status === "partially_delivered"
    ? priorStage ?? statusWithoutPartial(s.status, remainingEvents)
    : s.status;
  if (!status) throw new Error("The previous delivery stage cannot be established safely. Review the shipment history first.");
  return { deliveredQty, remainingQty, status };
}
export function partialIncrement(s: DeliveryQuantityState, delta: number | undefined) {
  const blocked = partialQuantityBlockReason(s);
  if (blocked) throw new Error(blocked);
  const delivered = s.deliveredQty ?? 0, total = s.actualItemCount!;
  if (!Number.isInteger(delivered) || delivered < 0 || delivered >= total || (s.remainingQty != null && s.remainingQty !== total - delivered)) throw new Error("Recorded delivery totals need review by Super Admin before another partial entry is added.");
  if (!Number.isInteger(delta) || (delta ?? 0) <= 0) throw new Error("Enter a positive whole number delivered in this update.");
  if (delta! >= total - delivered) throw new Error(delta! > total - delivered ? `Only ${total - delivered} items remain. Enter only the additional items delivered, or ask Super Admin to correct an earlier mistake.` : "All remaining items are delivered. Choose Full Delivery Complete instead.");
  return { deliveredQty: delivered + delta!, remainingQty: total - delivered - delta! };
}
