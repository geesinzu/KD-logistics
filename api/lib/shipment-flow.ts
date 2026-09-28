import { RECEIVABLE_BY_BRANCH_STATUSES } from "../../contracts/constants";

// The rules for the receiving end of a shipment's journey: hub routes (the 3PL
// delivers to a hub such as PH, the hub's staff send it on), the two
// acknowledgements, and a branch recording a delivery the 3PL never posted.
// Pure functions with no database access so each rule is tested directly and
// the mutations only have to apply them.

export interface FlowShipment {
  status: string;
  hubBranchId: number | null;
  destBranchId: number;
  hubAcknowledgedAt: unknown;
}

export type GuardResult = { ok: true } | { ok: false; message: string };
const ok = { ok: true } as const;
const no = (message: string) => ({ ok: false, message }) as const;

// Where the 3PL's job ends: the hub on a hub route, otherwise the destination.
export function receivingBranchId(s: { hubBranchId: number | null; destBranchId: number }): number {
  return s.hubBranchId ?? s.destBranchId;
}

// A 3PL full delivery stops at the hub on a hub route.
export function statusAfterTplFullDelivery(s: { hubBranchId: number | null }): "at_hub" | "delivered" {
  return s.hubBranchId ? "at_hub" : "delivered";
}

// Acknowledgement #1: the hub confirms the shipment reached it.
export function hubAcknowledgeGuard(s: FlowShipment): GuardResult {
  if (!s.hubBranchId) return no("This shipment isn't routed through a hub");
  if (s.status !== "at_hub") return no("Only a shipment that has reached the hub can be acknowledged there");
  if (s.hubAcknowledgedAt) return no("Receipt at the hub was already acknowledged");
  return ok;
}

// Sending it on needs the hub's acknowledgement first: the two acknowledgements
// are the point of the flow.
export function dispatchOnwardGuard(s: FlowShipment): GuardResult {
  if (!s.hubBranchId) return no("This shipment isn't routed through a hub");
  if (s.status !== "at_hub") return no("Only a shipment at the hub can be dispatched onward");
  if (!s.hubAcknowledgedAt) return no("Acknowledge receipt at the hub before dispatching onward");
  return ok;
}

// Acknowledgement #2 (or the only one on a direct route): the destination
// confirms receipt. On a hub route this is normally after onward dispatch;
// if the hub never recorded the dispatch, the final branch may still close it
// out from "at_hub" -- flagged so the log can say the step was skipped.
export function finalAcknowledgeGuard(s: FlowShipment): { ok: true; skippedOnward: boolean } | { ok: false; message: string } {
  if (!s.hubBranchId) {
    return s.status === "delivered" ? { ok: true, skippedOnward: false } : no("Only a fully delivered shipment can be acknowledged");
  }
  if (s.status === "onward_in_transit") return { ok: true, skippedOnward: false };
  if (s.status === "at_hub") return { ok: true, skippedOnward: true };
  return no("This shipment hasn't been sent on from the hub yet");
}

// A branch recording that it received a shipment the 3PL never marked delivered.
export function markReceivedGuard(s: { status: string }): GuardResult {
  return (RECEIVABLE_BY_BRANCH_STATUSES as readonly string[]).includes(s.status)
    ? ok
    : no("This shipment isn't with the 3PL, so there is nothing to mark as received");
}

// Full quantity completes the receipt; anything short is recorded as a partial
// delivery and stays open, so the missing items remain tracked. The quantity
// entered is the TOTAL received so far, so a later top-up completes it.
export function receiptOutcome(
  receivedQty: number,
  expectedQty: number | null,
): { kind: "full" | "partial"; remaining: number } {
  if (expectedQty == null || receivedQty >= expectedQty) return { kind: "full", remaining: 0 };
  return { kind: "partial", remaining: expectedQty - receivedQty };
}

// "Time received" must be a real moment: not in the future (a few minutes of
// clock difference between phone and server is allowed) and not before the
// shipment was even assigned. It is what the 3PL's on-time result is judged
// against, so a late tap must not make the 3PL look late.
export function receivedAtError(receivedAt: Date, now: Date, notBefore: Date | null): string | null {
  if (isNaN(receivedAt.getTime())) return "Enter a valid time received";
  if (receivedAt.getTime() > now.getTime() + 5 * 60 * 1000) return "Time received can't be in the future";
  if (notBefore && !isNaN(notBefore.getTime()) && receivedAt.getTime() < notBefore.getTime()) {
    return "Time received can't be before the shipment was assigned to the 3PL";
  }
  return null;
}
