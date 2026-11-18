import { describe, it, expect } from "vitest";
import { buildBriefRows } from "@contracts/delivery-brief";
import type { BriefShipment } from "@contracts/delivery-brief";
import {
  deliveredDaysLate,
  deliveredLateRows,
  concisePrint,
  fullPrint,
  PRINT_PARTS,
} from "@contracts/report-print";
const base: BriefShipment = {
  id: 1,
  trackingId: "TEST-LATE",
  destBranchId: 1,
  tplId: 1,
  hubBranchId: null,
  createdAt: "2026-11-01T08:00:00Z",
  status: "delivered",
  estimatedDeliveryDate: "2026-11-04",
  deliveredAt: "2026-11-07T08:00:00Z",
  completedAt: null,
  hubArrivedAt: null,
  onwardDispatchedAt: null,
  onwardDetails: null,
};
function row(patch: Partial<BriefShipment> = {}) {
  return buildBriefRows(
    [{ ...base, ...patch }],
    [],
    new Map([
      [1, "Destination"],
      [2, "Hub"],
    ]),
    new Map([[1, "Partner"]]),
    Date.parse("2026-11-18T10:00:00Z")
  )[0];
}
describe("late-delivery evidence", () => {
  it("counts days between ETA and actual delivery, not how overdue the shipment is today", () => {
    expect(deliveredDaysLate(row())).toBe(3);
    expect(row().overdueHours).toBe(0);
  });
  it.each(["2026-11-03T10:00:00Z", "2026-11-04T22:59:59.999Z"])(
    "excludes on-time arrival %s",
    deliveredAt => expect(deliveredDaysLate(row({ deliveredAt }))).toBeNull()
  );
  it("counts a delivery at midnight on the next Lagos calendar date as one day late", () => {
    expect(
      deliveredDaysLate(row({ deliveredAt: "2026-11-04T23:00:00Z" }))
    ).toBe(1);
  });
  it("does not count a delayed acknowledgement as a delayed delivery", () => {
    expect(
      deliveredDaysLate(
        row({
          status: "completed",
          deliveredAt: "2026-11-04T09:00:00Z",
          completedAt: "2026-11-12T10:00:00Z",
        })
      )
    ).toBeNull();
  });
  it("uses hub arrival, not final-branch acknowledgement, on a hub route", () => {
    expect(
      deliveredDaysLate(
        row({
          hubBranchId: 2,
          status: "completed",
          deliveredAt: null,
          hubArrivedAt: "2026-11-06T10:00:00Z",
          completedAt: "2026-11-13T12:00:00Z",
        })
      )
    ).toBe(2);
  });
  it.each([
    { estimatedDeliveryDate: null },
    { deliveredAt: null },
    { deliveredAt: "invalid" },
    { deliveredAt: "0000-00-00 00:00:00" },
    { deliveredAt: "2026-12-01T10:00:00Z" },
    { status: "cancelled" },
    { status: "in_transit_with_3pl", deliveredAt: null },
    {
      status: "completed",
      deliveredAt: null,
      completedAt: "2026-11-12T10:00:00Z",
    },
  ])("excludes missing/invalid/future/cancelled evidence %j", patch =>
    expect(deliveredDaysLate(row(patch))).toBeNull()
  );
  it("sorts the largest delays first with stable shipment IDs", () => {
    expect(
      deliveredLateRows([
        row({ id: 3, deliveredAt: "2026-11-05T10:00:00Z" }),
        row({ id: 2 }),
        row({ id: 1 }),
      ]).map(r => [r.id, r.daysLate])
    ).toEqual([
      [1, 3],
      [2, 3],
      [3, 1],
    ]);
  });
});
describe("report print presets", () => {
  it("defaults to summary and late evidence only and returns fresh selections", () => {
    const selection = concisePrint();
    expect(PRINT_PARTS.filter(p => selection[p.key]).map(p => p.key)).toEqual([
      "summary",
      "late",
    ]);
    selection.summary = false;
    expect(concisePrint().summary).toBe(true);
  });
  it("includes every selectable section in the full preset", () =>
    expect(PRINT_PARTS.every(part => fullPrint()[part.key])).toBe(true));
});
