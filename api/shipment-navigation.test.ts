import { describe, expect, it } from "vitest";
import {
  currentShipmentMonth, validShipmentMonth, shipmentMonthLabel, shipmentMonthRange,
  shipmentFilter, shipmentListUrl, shipmentListFilters, shipmentDateLabel, hasCompleteShipmentMonth,
} from "@contracts/shipment-navigation";
import { IN_TRANSIT_STATUSES, SHIPMENT_STATUSES } from "@contracts/constants";

describe("shipment month navigation", () => {
  it("uses Nigeria's current month even before UTC month rollover", () => {
    expect(currentShipmentMonth(new Date("2026-10-31T23:30:00Z"))).toBe("2026-11");
    expect(currentShipmentMonth(new Date("2026-10-31T22:59:59Z"))).toBe("2026-10");
  });
  it.each(["2026-00", "2026-13", "2026-1", "1999-12", "2101-01", "all", "", null])("rejects invalid picker values: %s", value => {
    expect(validShipmentMonth(value)).toBe(false);
  });
  it("uses Lagos midnight for both month boundaries", () => {
    const range = shipmentMonthRange(2026, 11);
    expect(range.start.toISOString()).toBe("2026-10-31T23:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-11-30T23:00:00.000Z");
  });
  it("handles leap February and year rollover", () => {
    const feb = shipmentMonthRange(2028, 2), dec = shipmentMonthRange(2026, 12);
    expect((feb.end.getTime() - feb.start.getTime()) / 86400000).toBe(29);
    expect(dec.end.toISOString()).toBe("2026-12-31T23:00:00.000Z");
  });
  it.each([[2026, 0], [2026, 13], [2026.5, 1], [1999, 12]])("rejects invalid server month %s/%s", (year, month) => {
    expect(() => shipmentMonthRange(year, month)).toThrow();
  });
  it("requires a complete month/year pair or neither", () => {
    expect(hasCompleteShipmentMonth({})).toBe(true);
    expect(hasCompleteShipmentMonth({ year: 2026, month: 11 })).toBe(true);
    expect(hasCompleteShipmentMonth({ year: 2026 })).toBe(false);
    expect(hasCompleteShipmentMonth({ month: 11 })).toBe(false);
  });
  it("uses the exact dashboard transit definition including hub routes", () => {
    expect(shipmentFilter("in_transit_with_3pl").statuses).toEqual(IN_TRANSIT_STATUSES);
    expect(shipmentFilter("in_transit_with_3pl").statuses).toContain("onward_in_transit");
  });
  it("keeps active and delivered groups disjoint", () => {
    const active = shipmentFilter("active").statuses;
    expect(active).toEqual(SHIPMENT_STATUSES.filter(s => !["delivered", "completed", "cancelled"].includes(s)));
    expect(shipmentFilter("delivered_or_completed").statuses).toEqual(["delivered", "completed"]);
    expect(shipmentFilter("completed").statuses).toEqual(["completed"]);
  });
  it("opens status and month together", () => {
    const url = new URL(shipmentListUrl("delivered_or_completed", "2026-10"), "http://localhost");
    const filters = shipmentListFilters(url.searchParams);
    expect(filters.month).toBe("2026-10");
    expect(filters.status.key).toBe("delivered_or_completed");
    expect(filters.page).toBe(1);
  });
  it("preserves all-month, search, page and completed deep links", () => {
    const f = shipmentListFilters(new URLSearchParams("status=completed&month=all&q=KEDI&page=3"));
    expect(f).toMatchObject({ month: "all", search: "KEDI", page: 3, status: { key: "completed" } });
    expect(shipmentMonthLabel(f.month)).toBe("All months");
  });
  it("defaults invalid links safely to the current creation month", () => {
    const f = shipmentListFilters(new URLSearchParams("status=unknown&month=2026-13&page=-1"), new Date("2026-11-12T10:00:00Z"));
    expect(f).toMatchObject({ month: "2026-11", status: { key: "" }, page: 1 });
  });
  it("does not invent dates for missing legacy timestamps", () => {
    expect(shipmentDateLabel(null)).toBe("Not recorded");
    expect(shipmentDateLabel("0000-00-00 00:00:00")).toBe("Not recorded");
    expect(shipmentDateLabel(new Date("2026-10-31T23:30:00Z"))).toContain("Nov 2026");
  });
});
