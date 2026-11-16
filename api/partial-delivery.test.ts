import { describe, expect, it } from "vitest";
import { partialDeletePlan, partialIncrement, partialQuantityBlockReason } from "@contracts/partial-delivery";
const base = { actualItemCount: 50, deliveredQty: 32, remainingQty: 18, status: "partially_delivered" };
const event = { id: 3, eventType: "tpl_partial_delivery", oldStatus: "in_transit_with_3pl", newStatus: "partially_delivered", qtyDelivered: 32 };
const prior = [{ id: 1, eventType: "tpl_receipt_confirmed", oldStatus: "at_3pl", newStatus: "tpl_confirmed" }];
describe("partial delivery quantity rollback", () => {
  it("removes the wrong 32 so re-entering 38 gives 38 delivered and 12 remaining", () => {
    const plan = partialDeletePlan(base, event, prior);
    expect(plan).toEqual({ deliveredQty: 0, remainingQty: 50, status: "in_transit_with_3pl" });
    expect(partialIncrement({ ...base, ...plan }, 38)).toEqual({ deliveredQty: 38, remainingQty: 12 });
  });
  it("undoes a repeated partial entry even when old and new status are identical", () => {
    expect(partialDeletePlan({ ...base, deliveredQty: 38, remainingQty: 12 }, { ...event, qtyDelivered: 6, oldStatus: "partially_delivered" }, [event, ...prior])).toEqual({ deliveredQty: 32, remainingQty: 18, status: "partially_delivered" });
  });
  it("keeps other valid partial deliveries when deleting an older entry", () => {
    expect(partialDeletePlan({ ...base, deliveredQty: 38, remainingQty: 12 }, event, [{ ...event, id: 4, qtyDelivered: 6, oldStatus: "partially_delivered" }])).toEqual({ deliveredQty: 6, remainingQty: 44, status: "partially_delivered" });
  });
  it("finds a previous stage when the last surviving event also began partial", () => {
    expect(partialDeletePlan({ ...base, deliveredQty: 6, remainingQty: 44 }, { ...event, qtyDelivered: 6, oldStatus: "partially_delivered" }, prior).status).toBe("tpl_confirmed");
  });
  it("does not rewind later non-delivery movement", () => {
    expect(partialDeletePlan({ ...base, status: "in_transit_with_3pl" }, event, prior).status).toBe("in_transit_with_3pl");
  });
  it.each([{ deliveredQty: 70, remainingQty: 0 }, { deliveredQty: 20, remainingQty: 30 }, { remainingQty: 0 }])("rejects inconsistent stored totals %j", change => {
    expect(() => partialDeletePlan({ ...base, ...change }, event, prior)).toThrow();
  });
  it("requires review when a newer correction replaced the quantities", () => expect(() => partialDeletePlan(base, event, prior, true)).toThrow(/later quantity correction/));
  it("requires a recorded delta and a trustworthy previous stage", () => {
    expect(() => partialDeletePlan(base, { ...event, qtyDelivered: null }, prior)).toThrow(/reliable/);
    expect(() => partialDeletePlan(base, { ...event, oldStatus: "partially_delivered" }, [])).toThrow(/previous delivery stage/);
  });
  it.each(["tpl_full_delivery", "branch_marked_delivered", "delivery_acknowledged", "hub_acknowledged", "onward_dispatched"])("does not erase dependent %s evidence", eventType => {
    expect(() => partialDeletePlan(base, event, [{ ...event, id: 5, eventType }])).toThrow(/receipt or delivery evidence/);
  });
});
describe("new partial entry validation", () => {
  it.each([undefined, 0, -1, 1.5, 19, 50])("rejects invalid or excess quantity %s", delta => expect(() => partialIncrement(base, delta)).toThrow());
  it("requires full delivery confirmation for the exact final balance", () => expect(() => partialIncrement(base, 18)).toThrow(/Full Delivery Complete/));
  it("adds only the new delivery under the current balance", () => expect(partialIncrement(base, 6)).toEqual({ deliveredQty: 38, remainingQty: 12 }));
  it("blocks the stale 70-total case instead of adding even more", () => expect(() => partialIncrement({ ...base, deliveredQty: 70, remainingQty: 0 }, 1)).toThrow(/review/));
  it.each([{ status: "completed" }, { status: "at_hub" }, { deliveryReportedBy: "branch" }, { deliveredAt: new Date() }, { hubArrivedAt: new Date() }, { actualItemCount: null }])("requires review of protected records %j", state => expect(partialQuantityBlockReason({ ...base, ...state })).not.toBeNull());
});
