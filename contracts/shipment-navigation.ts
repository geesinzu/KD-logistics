import { IN_TRANSIT_STATUSES, SHIPMENT_STATUSES } from "./constants";

export const SHIPMENT_FILTERS = [
  { key: "", label: "All", statuses: [] as readonly string[] },
  { key: "active", label: "Active", statuses: SHIPMENT_STATUSES.filter(s => !["delivered", "completed", "cancelled"].includes(s)) },
  { key: "created", label: "Created", statuses: ["created"] },
  { key: "labeled", label: "Labeled", statuses: ["labeled"] },
  { key: "assigned_to_3pl", label: "Assigned to 3PL", statuses: ["assigned_to_3pl", "waiting_driver_pickup", "waiting_3pl_pickup", "at_3pl"] },
  { key: "picked_up", label: "Picked Up", statuses: ["picked_up", "picked_up_by_3pl"] },
  { key: "in_transit_with_3pl", label: "In Transit", statuses: IN_TRANSIT_STATUSES },
  { key: "at_hub_onward", label: "At Hub / Onward", statuses: ["at_hub", "onward_in_transit"] },
  { key: "delivered_or_completed", label: "Delivered / Completed", statuses: ["delivered", "completed"] },
  { key: "delivered", label: "Delivered", statuses: ["delivered"] },
  { key: "completed", label: "Completed", statuses: ["completed"] },
  { key: "cancelled", label: "Cancelled", statuses: ["cancelled"] },
] as const;
export type ShipmentFilter = typeof SHIPMENT_FILTERS[number]["key"];
export function shipmentFilter(key: string | null): { key: ShipmentFilter; label: string; statuses: readonly string[] } {
  return SHIPMENT_FILTERS.find(f => f.key === key) ?? SHIPMENT_FILTERS[0];
}
export function currentShipmentMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit" }).formatToParts(now);
  return `${parts.find(p => p.type === "year")!.value}-${parts.find(p => p.type === "month")!.value}`;
}
export function validShipmentMonth(value: string | null): value is string {
  return !!value && /^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(value);
}
export function shipmentMonthLabel(value: string) {
  return value === "all" ? "All months" : new Date(`${value}-01T00:00:00+01:00`).toLocaleDateString("en-NG", { timeZone: "Africa/Lagos", month: "long", year: "numeric" });
}
export function shipmentMonthRange(year: number, month: number) {
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) throw new Error("Choose a valid shipment month and year");
  const start = new Date(`${year}-${String(month).padStart(2, "0")}-01T00:00:00+01:00`);
  const end = new Date(Date.UTC(year, month, 1) - 3_600_000);
  return { start, end };
}
export function hasCompleteShipmentMonth(input: { year?: number; month?: number }) {
  return (input.year === undefined) === (input.month === undefined);
}
export function shipmentListUrl(status: ShipmentFilter, month: string) {
  const params = new URLSearchParams({ month });
  if (status) params.set("status", status);
  return `/shipments?${params}`;
}
export function shipmentListFilters(params: URLSearchParams, now = new Date()) {
  const rawMonth = params.get("month");
  const month = rawMonth === "all" || validShipmentMonth(rawMonth) ? rawMonth : currentShipmentMonth(now);
  const pageNumber = Number(params.get("page") ?? "1");
  const page = Number.isSafeInteger(pageNumber) && pageNumber > 0 && pageNumber <= 1_000_000 ? pageNumber : 1;
  return { month, status: shipmentFilter(params.get("status")), search: params.get("q") ?? "", page };
}
export function shipmentDateLabel(value: unknown) {
  const date = value instanceof Date ? value : new Date(String(value ?? ""));
  return Number.isFinite(date.getTime()) && date.getTime() > 0
    ? date.toLocaleDateString("en-NG", { timeZone: "Africa/Lagos", day: "numeric", month: "short", year: "numeric" })
    : "Not recorded";
}
