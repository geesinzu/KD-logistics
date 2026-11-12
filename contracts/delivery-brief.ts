// Created-date cohorts, evaluated using their CURRENT recorded outcomes.
// This is deliberately separate from analytics' activity-date metrics.
export const REPORT_DAY = 86_400_000;
const HOUR = 3_600_000;
export type BriefShipment = {
  id: number;
  trackingId: string | null;
  destBranchId: number;
  tplId: number | null;
  hubBranchId: number | null;
  createdAt: unknown;
  status: string;
  estimatedDeliveryDate: unknown;
  deliveredAt: unknown;
  completedAt: unknown;
  hubArrivedAt: unknown;
  onwardDispatchedAt: unknown;
  onwardDetails: unknown;
};
export type CustodyEvent = { shipmentId: number; createdAt: unknown };
export function time(value: unknown): number | null {
  if (!value) return null;
  const ms =
    value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}
export function calendarDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return ["year", "month", "day"]
    .map(type => parts.find(p => p.type === type)?.value)
    .join("-");
}
export function validDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function cohortRange(from: string, to: string) {
  if (!validDate(from) || !validDate(to))
    throw new Error("Choose valid calendar dates");
  const start = Date.parse(`${from}T00:00:00+01:00`),
    end = Date.parse(`${to}T00:00:00+01:00`) + REPORT_DAY;
  const days = Math.round((end - start) / REPORT_DAY);
  if (days < 1 || days > 366)
    throw new Error("Select a date range of 1–366 days");
  const previousStart = start - days * REPORT_DAY;
  return {
    start,
    end,
    previousStart,
    days,
    previousFrom: calendarDate(new Date(previousStart)),
    previousTo: calendarDate(new Date(start - 1)),
  };
}
function deadline(value: unknown): number | null {
  if (value instanceof Date && !Number.isFinite(value.getTime())) return null;
  const date =
    value instanceof Date
      ? calendarDate(value)
      : typeof value === "string"
        ? value.slice(0, 10)
        : "";
  return validDate(date) ? Date.parse(`${date}T23:59:59.999+01:00`) : null;
}
function average(values: number[]) {
  return values.length
    ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10
    : null;
}
export function buildBriefRows(
  shipments: BriefShipment[],
  events: CustodyEvent[],
  branchNames: Map<number, string>,
  partnerNames: Map<number, string>,
  now: number
) {
  const custody = new Map<number, number>();
  for (const e of events) {
    const t = time(e.createdAt);
    if (
      t !== null &&
      t <= now &&
      (!custody.has(e.shipmentId) || t < custody.get(e.shipmentId)!)
    )
      custody.set(e.shipmentId, t);
  }
  return shipments.map(s => {
    const created = time(s.createdAt);
    const known = (v: unknown) => {
      const t = time(v);
      return t !== null && t <= now ? t : null;
    };
    const handoff = custody.get(s.id) ?? null;
    const cancelled = s.status === "cancelled";
    const serviceDone =
      ["delivered", "completed", "at_hub", "onward_in_transit"].includes(
        s.status
      ) ||
      (!!s.hubBranchId && known(s.hubArrivedAt) !== null);
    const serviceAt =
      cancelled || !serviceDone
        ? null
        : (known(s.deliveredAt) ??
          (s.hubBranchId ? known(s.hubArrivedAt) : null));
    const acknowledgedAt =
      s.status === "completed" ? known(s.completedAt) : null;
    // On a hub route, completedAt is acknowledgement, not physical arrival.
    const finalAt = cancelled
      ? null
      : s.hubBranchId
        ? acknowledgedAt
        : ["delivered", "completed"].includes(s.status)
          ? (serviceAt ?? acknowledgedAt)
          : null;
    const serviceTimestampGap = !cancelled && serviceDone && serviceAt === null;
    const serviceEta = deadline(s.estimatedDeliveryDate);
    let onward: { expectedDate?: unknown } = {};
    if (typeof s.onwardDetails === "string") {
      try {
        onward = JSON.parse(s.onwardDetails) ?? {};
      } catch {
        /* unknown legacy JSON */
      }
    } else if (s.onwardDetails && typeof s.onwardDetails === "object")
      onward = s.onwardDetails;
    const stageEta =
      s.hubBranchId && serviceAt ? deadline(onward.expectedDate) : serviceEta;
    const stage = cancelled
      ? "Cancelled"
      : finalAt
        ? acknowledgedAt
          ? "Acknowledged"
          : "Awaiting acknowledgement"
        : serviceTimestampGap
          ? "Service receipt timestamp missing"
          : !handoff && !serviceAt
            ? "Awaiting warehouse handoff"
            : !serviceAt
              ? "With 3PL"
              : known(s.onwardDispatchedAt)
                ? "Onward / awaiting branch confirmation"
                : "At hub";
    const branch = branchNames.get(s.destBranchId) ?? "Unknown branch";
    const partner = s.tplId
      ? (partnerNames.get(s.tplId) ?? "Unknown partner")
      : "Unassigned";
    const hub = s.hubBranchId
      ? (branchNames.get(s.hubBranchId) ?? "Unknown hub")
      : null;
    const followUp =
      cancelled || acknowledgedAt
        ? null
        : serviceTimestampGap
          ? "Operations data review"
          : finalAt
            ? `${branch} branch team`
            : serviceAt && hub
              ? `${hub} hub / ${branch} branch team`
              : handoff
                ? partner
                : "Warehouse team";
    const duration = (end: number | null, start: number | null) =>
      end !== null && start !== null && end >= start
        ? (end - start) / HOUR
        : null;
    return {
      id: s.id,
      trackingId: s.trackingId ?? `#${s.id}`,
      branchId: s.destBranchId,
      branch,
      partnerId: s.tplId,
      partner,
      hub,
      created,
      handoff,
      serviceAt,
      finalAt,
      acknowledgedAt,
      cancelled,
      serviceEta,
      stageEta,
      stage,
      followUp,
      overdueHours:
        !cancelled &&
        !serviceTimestampGap &&
        !finalAt &&
        stageEta !== null &&
        now > stageEta
          ? Math.ceil((now - stageEta) / HOUR)
          : 0,
      serviceTimestampGap,
      missingEta:
        !cancelled && !serviceTimestampGap && !finalAt && stageEta === null,
      onTime:
        serviceAt !== null && serviceEta !== null
          ? serviceAt <= serviceEta
          : null,
      processingHours: duration(handoff, created),
      transitHours: duration(serviceAt, handoff),
      hubHours: duration(
        known(s.onwardDispatchedAt),
        known(s.hubArrivedAt) ?? (hub ? serviceAt : null)
      ),
      onwardHours: hub
        ? duration(acknowledgedAt, known(s.onwardDispatchedAt))
        : null,
    };
  });
}
export type BriefRow = ReturnType<typeof buildBriefRows>[number];
export function summarizeBrief(rows: BriefRow[]) {
  const eligible = rows.filter(r => r.onTime !== null),
    onTime = eligible.filter(r => r.onTime).length;
  const stages = [
    { key: "processingHours" as const, label: "Creation → 3PL custody" },
    { key: "transitHours" as const, label: "3PL custody → service receipt" },
    { key: "hubHours" as const, label: "Hub receipt → onward dispatch" },
    { key: "onwardHours" as const, label: "Onward dispatch → acknowledgement" },
  ].map(({ key, label }) => {
    const values = rows
      .filter(r => !r.cancelled)
      .map(r => r[key])
      .filter((v): v is number => v !== null);
    return { key, label, hours: average(values), count: values.length };
  });
  return {
    total: rows.length,
    cancelled: rows.filter(r => r.cancelled).length,
    eligible: eligible.length,
    onTime,
    rate: eligible.length
      ? Math.round((onTime / eligible.length) * 1000) / 10
      : null,
    finalReceipt: rows.filter(r => r.finalAt !== null).length,
    open: rows.filter(r => !r.cancelled && !r.finalAt).length,
    overdue: rows.filter(r => r.overdueHours > 0).length,
    awaitingAck: rows.filter(r => r.finalAt && !r.acknowledgedAt).length,
    serviceTimestampGaps: rows.filter(r => r.serviceTimestampGap).length,
    missingEta: rows.filter(r => r.missingEta).length,
    stages,
    transitDays:
      stages[1].hours === null
        ? null
        : Math.round((stages[1].hours / 24) * 10) / 10,
  };
}
