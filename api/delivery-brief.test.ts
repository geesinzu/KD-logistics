import { describe, expect, it } from "vitest";
import {
  cohortRange,
  buildBriefRows,
  summarizeBrief,
  type BriefShipment,
  type CustodyEvent,
} from "@contracts/delivery-brief";
const stamp = (v: string) => Date.parse(v);
const now = stamp("2026-11-11T17:00:00Z");
const base: BriefShipment = {
  id: 1,
  trackingId: "TEST-001",
  destBranchId: 8090001,
  tplId: 2,
  hubBranchId: null,
  createdAt: "2026-11-01T08:00:00Z",
  status: "delivered",
  estimatedDeliveryDate: "2026-11-04",
  deliveredAt: "2026-11-03T08:00:00Z",
  completedAt: null,
  hubArrivedAt: null,
  onwardDispatchedAt: null,
  onwardDetails: null,
};
const build = (
  items: BriefShipment[],
  events: CustodyEvent[] = [
    { shipmentId: 1, createdAt: "2026-11-02T08:00:00Z" },
  ]
) =>
  buildBriefRows(
    items,
    events,
    new Map([
      [8090001, "Makurdi"],
      [7, "PH"],
    ]),
    new Map([[2, "Partner"]]),
    now
  );
describe("Delivery Brief dates", () => {
  it("uses inclusive Lagos dates and an adjacent equal-length previous cohort", () => {
    const r = cohortRange("2026-11-01", "2026-11-11");
    expect(r.start).toBe(stamp("2026-10-31T23:00:00Z"));
    expect(r.end).toBe(stamp("2026-11-11T23:00:00Z"));
    expect(r.days).toBe(11);
    expect(r.previousFrom).toBe("2026-10-21");
    expect(r.previousTo).toBe("2026-10-31");
  });
  it.each([
    ["2026-02-30", "2026-03-01"],
    ["", "2026-11-11"],
    ["2026-11-12", "2026-11-11"],
    ["2024-01-01", "2026-11-11"],
  ])("rejects invalid or unbounded dates %s–%s", (a, b) => {
    expect(() => cohortRange(a, b)).toThrow();
  });
});
describe("Delivery Brief recorded milestones", () => {
  it("keeps direct receipt separate from acknowledgement and uses dynamic branch IDs", () => {
    const [r] = build([base]);
    expect(r.branch).toBe("Makurdi");
    expect(r.finalAt).toBe(r.serviceAt);
    expect(r.acknowledgedAt).toBeNull();
    expect(r.onTime).toBe(true);
    expect(r.stage).toBe("Awaiting acknowledgement");
    const s = summarizeBrief([r]);
    expect(s.awaitingAck).toBe(1);
    expect(s.finalReceipt).toBe(1);
    expect(s.open).toBe(0);
  });
  it("settles hub service at arrival without inventing a final receipt", () => {
    const [r] = build([
      {
        ...base,
        status: "at_hub",
        hubBranchId: 7,
        hubArrivedAt: base.deliveredAt,
      },
    ]);
    expect(r.serviceAt).not.toBeNull();
    expect(r.onTime).toBe(true);
    expect(r.finalAt).toBeNull();
    expect(r.overdueHours).toBe(0);
    expect(r.missingEta).toBe(true);
    expect(r.stage).toBe("At hub");
  });
  it("uses the onward ETA only after service completion", () => {
    const [r] = build([
      {
        ...base,
        status: "onward_in_transit",
        hubBranchId: 7,
        onwardDispatchedAt: "2026-11-04T08:00:00Z",
        onwardDetails: JSON.stringify({ expectedDate: "2026-11-05" }),
      },
    ]);
    expect(r.stageEta).toBe(stamp("2026-11-05T22:59:59.999Z"));
    expect(r.overdueHours).toBeGreaterThan(0);
    expect(r.followUp).toContain("PH hub");
  });
  it("measures hub dwell and onward acknowledgement independently", () => {
    const [r] = build([
      {
        ...base,
        status: "completed",
        hubBranchId: 7,
        hubArrivedAt: base.deliveredAt,
        onwardDispatchedAt: "2026-11-04T08:00:00Z",
        completedAt: "2026-11-05T08:00:00Z",
      },
    ]);
    expect(r.hubHours).toBe(24);
    expect(r.onwardHours).toBe(24);
    expect(r.finalAt).toBe(stamp("2026-11-05T08:00:00Z"));
    expect(r.overdueHours).toBe(0);
  });
  it("treats ETA as the end of the Lagos calendar day", () => {
    const [r] = build([
      {
        ...base,
        estimatedDeliveryDate: "2026-11-04",
        deliveredAt: "2026-11-04T23:00:00Z",
      },
    ]);
    expect(r.onTime).toBe(false);
  });
  it("does not inflate rate or durations for missing dates", () => {
    const [r] = build([{ ...base, estimatedDeliveryDate: null }], []);
    const s = summarizeBrief([r]);
    expect(s.rate).toBeNull();
    expect(s.eligible).toBe(0);
    expect(s.transitDays).toBeNull();
    expect(s.stages[0].count).toBe(0);
  });
  it("excludes cancelled work from performance and follow-ups but retains volume", () => {
    const [r] = build([{ ...base, status: "cancelled" }]);
    const s = summarizeBrief([r]);
    expect(s.total).toBe(1);
    expect(s.cancelled).toBe(1);
    expect(s.eligible).toBe(0);
    expect(s.open).toBe(0);
    expect(s.overdue).toBe(0);
    expect(s.stages[0].count).toBe(0);
  });
  it("chooses the earliest valid custody and rejects negative duration samples", () => {
    const [r] = build(
      [base],
      [
        { shipmentId: 1, createdAt: null },
        { shipmentId: 1, createdAt: "2026-11-02T09:00:00Z" },
        { shipmentId: 1, createdAt: "2026-11-02T08:00:00Z" },
      ]
    );
    expect(r.processingHours).toBe(24);
    expect(r.transitHours).toBe(24);
    const [bad] = build(
      [base],
      [{ shipmentId: 1, createdAt: "2026-10-31T08:00:00Z" }]
    );
    expect(bad.processingHours).toBeNull();
  });
  it("ignores zero, invalid and future milestone timestamps", () => {
    const [r] = build(
      [
        {
          ...base,
          deliveredAt: "0000-00-00 00:00:00",
          completedAt: "2026-12-01T00:00:00Z",
        },
      ],
      []
    );
    expect(r.serviceAt).toBeNull();
    expect(r.finalAt).toBeNull();
    expect(r.onTime).toBeNull();
  });
  it("does not count a partial direct delivery as a confirmed final receipt", () => {
    const [r] = build([{ ...base, status: "partially_delivered" }]);
    expect(r.finalAt).toBeNull();
    expect(r.serviceAt).toBeNull();
    expect(summarizeBrief([r]).eligible).toBe(0);
  });
  it("does not substitute acknowledgement time for missing 3PL arrival", () => {
    const [r] = build([
      {
        ...base,
        status: "completed",
        deliveredAt: null,
        completedAt: "2026-11-05T08:00:00Z",
      },
    ]);
    expect(r.serviceAt).toBeNull();
    expect(r.finalAt).not.toBeNull();
    expect(r.onTime).toBeNull();
    expect(r.serviceTimestampGap).toBe(true);
  });
  it("does not accuse a delivered record with a missing timestamp of being overdue", () => {
    const [r] = build([{ ...base, deliveredAt: null }]);
    expect(r.overdueHours).toBe(0);
    expect(r.followUp).toBe("Operations data review");
  });
  it("treats an invalid Date ETA as missing rather than throwing", () => { const [r] = build([{ ...base, estimatedDeliveryDate: new Date(NaN) }]); expect(r.onTime).toBeNull(); });
  it("produces honest empty-state summaries", () => {
    expect(summarizeBrief([])).toMatchObject({
      total: 0,
      rate: null,
      eligible: 0,
      open: 0,
      transitDays: null,
    });
  });
});
