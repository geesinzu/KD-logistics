import { calendarDate, REPORT_DAY } from "./delivery-brief";
import type { BriefRow } from "./delivery-brief";
export const PRINT_PARTS = [
  {
    key: "summary",
    label: "Summary and key figures",
    detail: "Shipment totals, on-time rate and confirmed receipts.",
  },
  {
    key: "late",
    label: "Shipments delivered after ETA",
    detail: "Shipment, branch, 3PL, ETA, delivery date and days late.",
  },
  {
    key: "branches",
    label: "Branch performance",
    detail: "The full branch table for the selected report filters.",
  },
  {
    key: "partners",
    label: "3PL performance",
    detail: "Partner scorecards and delivery performance.",
  },
  {
    key: "followups",
    label: "Open shipment follow-ups",
    detail: "All rows for the currently selected follow-up type.",
  },
  {
    key: "analysis",
    label: "Movement trends and stage times",
    detail: "Volume chart and average time at each stage.",
  },
  {
    key: "actions",
    label: "Branch snapshot and suggested actions",
    detail: "Top branch snapshot and recommended next steps.",
  },
] as const;
export type PrintPart = (typeof PRINT_PARTS)[number]["key"];
export type PrintSelection = Record<PrintPart, boolean>;
export const concisePrint = (): PrintSelection => ({
  summary: true,
  late: true,
  branches: false,
  partners: false,
  followups: false,
  analysis: false,
  actions: false,
});
export const fullPrint = (): PrintSelection => ({
  summary: true,
  late: true,
  branches: true,
  partners: true,
  followups: true,
  analysis: true,
  actions: true,
});
// A date-only ETA covers the full Lagos day. Calendar days, rather than
// elapsed 24-hour periods, match the report's on-time/late date rule.
export function deliveredDaysLate(row: BriefRow): number | null {
  if (
    row.cancelled ||
    row.onTime !== false ||
    row.serviceAt === null ||
    row.serviceEta === null ||
    !Number.isFinite(row.serviceAt) ||
    !Number.isFinite(row.serviceEta)
  )
    return null;
  const days = Math.round(
    (Date.parse(calendarDate(new Date(row.serviceAt))) -
      Date.parse(calendarDate(new Date(row.serviceEta)))) /
      REPORT_DAY
  );
  return days > 0 ? days : null;
}
export function deliveredLateRows(rows: BriefRow[]) {
  return rows
    .flatMap(row => {
      const daysLate = deliveredDaysLate(row);
      return daysLate === null ? [] : [{ ...row, daysLate }];
    })
    .sort((a, b) => b.daysLate - a.daysLate || a.id - b.id);
}
