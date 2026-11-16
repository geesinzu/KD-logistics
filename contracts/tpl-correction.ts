export const TPL_CORRECTION_STATUSES = ["waiting_driver_pickup", "picked_up", "at_3pl", "waiting_3pl_pickup"] as const;
type CorrectionState = {
  tplId: number | null; status: string; tplConfirmedAt?: unknown; tplConfirmedQty?: number | null;
  deliveredAt?: unknown; completedAt?: unknown; hubArrivedAt?: unknown;
  hubAcknowledgedAt?: unknown; onwardDispatchedAt?: unknown; deliveredQty?: number | null;
};
function recorded(value: unknown) {
  if (!value || String(value).startsWith("0000-00-00")) return false;
  const time = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(time) && time > 0;
}
export function tplCorrectionBlockReason(s: CorrectionState): string | null {
  if (!s.tplId) return "This shipment has no 3PL assignment to correct.";
  if (!(TPL_CORRECTION_STATUSES as readonly string[]).includes(s.status)) return "This delivery has advanced beyond a simple assignment correction. Its 3PL records need review first.";
  if (recorded(s.tplConfirmedAt) || s.tplConfirmedQty != null) return "A 3PL receipt or quantity is already recorded. Review it before changing the company.";
  if ([s.deliveredAt, s.completedAt, s.hubArrivedAt, s.hubAcknowledgedAt, s.onwardDispatchedAt].some(recorded) || (s.deliveredQty ?? 0) > 0) return "Delivery or hub receipt is already recorded. Review it before changing the company.";
  return null;
}
