import { eq, and, inArray, isNotNull, desc } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { shipments, trackingEvents } from "@db/schema";
import { RECEIVABLE_BY_BRANCH_STATUSES } from "@contracts/constants";
import { notifyTplUpdateReminder, notifyTplUpdateOverdue } from "./push";

// Automatic 3PL update reminders. Runs on a timer (api/boot.ts) while the
// server process is alive -- deliberately NOT a cPanel-style external cron
// hitting a secret endpoint, since that design existed only to work around
// shared hosting stopping idle processes. A persistently-running host (e.g.
// Railway) has no such problem, so an in-process interval is simpler and
// needs no manual setup on the host at all.

// Event types that count as "the 3PL told us something" -- resets the clock.
const TPL_UPDATE_EVENT_TYPES = [
  "tpl_pickup_from_warehouse",
  "tpl_receipt_confirmed",
  "tpl_location_update",
  "tpl_sorting_update",
  "tpl_processing_update",
  "tpl_partial_delivery",
  "tpl_full_delivery",
  "delay_reported",
  "tpl_additional_items_received",
];

function isValidDate(d: unknown): boolean {
  if (!d) return false;
  const t = new Date(d as string).getTime();
  return !isNaN(t) && new Date(d as string).getFullYear() >= 2000;
}

// Nigeria has no daylight saving and a single timezone, but this reads Lagos
// local time via Intl rather than hardcoding a UTC+1 offset, so it stays
// correct regardless of which timezone the host server itself runs in.
function currentLagosHour(now: Date): number {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Lagos",
    hour: "numeric",
    hour12: false,
  }).format(now);
  return parseInt(formatted, 10) % 24;
}

// 7am-7pm Lagos time. Reminders only SEND inside this window.
export function isWithinOperatingHours(now: Date): boolean {
  const hour = currentLagosHour(now);
  return hour >= 7 && hour < 19;
}

// The instant 7am Lagos time most recently arrived (today's, once we're past
// it; otherwise yesterday's). Lagos is fixed UTC+1 year-round (WAT, no DST),
// so 7am Lagos is always 6am UTC on the same Lagos calendar date -- that date
// is read via Intl (not assumed from the server's own clock/timezone).
function mostRecentOperatingWindowStart(now: Date): Date {
  const lagosDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [year, month, day] = lagosDate.split("-").map(Number);
  const todayOpen = new Date(Date.UTC(year, month - 1, day, 6, 0, 0));
  if (currentLagosHour(now) >= 7) return todayOpen;
  const yesterdayOpen = new Date(todayOpen);
  yesterdayOpen.setUTCDate(yesterdayOpen.getUTCDate() - 1);
  return yesterdayOpen;
}

export interface ReminderDecision {
  shouldRemind: boolean;
  shouldEscalate: boolean;
}

// shouldRemind: 6h+ since the last real update, and either never reminded
// for this stale period or 2h+ since the last reminder (so it repeats).
// shouldEscalate: 12h+ since the last real update, and not already escalated
// for this stale period (any real update resets both).
export function reminderDecision(params: {
  hoursSinceLastUpdate: number;
  hoursSinceLastReminder: number | null;
  alreadyEscalated: boolean;
}): ReminderDecision {
  const { hoursSinceLastUpdate, hoursSinceLastReminder, alreadyEscalated } = params;
  return {
    shouldRemind: hoursSinceLastUpdate >= 6 && (hoursSinceLastReminder === null || hoursSinceLastReminder >= 2),
    shouldEscalate: hoursSinceLastUpdate >= 12 && !alreadyEscalated,
  };
}

export interface ReminderCheckSummary {
  withinOperatingHours: boolean;
  shipmentsChecked: number;
  remindersSent: number;
  escalationsSent: number;
}

// Walks every shipment currently in the 3PL's custody, works out how long
// it's been since that 3PL actually told us anything, and reminds/escalates
// as needed. Pushes and the operating-hours gate are skipped outside 7am-7pm,
// but the function still runs and reports what it WOULD have done, so the
// manual test trigger is informative even outside the window.
export async function checkTplUpdateReminders(now: Date = new Date()): Promise<ReminderCheckSummary> {
  const withinOperatingHours = isWithinOperatingHours(now);
  const db = getDb();

  const active = await db.select().from(shipments).where(and(
    inArray(shipments.status, RECEIVABLE_BY_BRANCH_STATUSES as any),
    isNotNull(shipments.tplId),
  ));

  let remindersSent = 0;
  let escalationsSent = 0;

  for (const shipment of active) {
    const events = await db.select().from(trackingEvents)
      .where(eq(trackingEvents.shipmentId, shipment.id))
      .orderBy(desc(trackingEvents.id));

    const lastTplEvent = events.find(e => e.actorType === "tpl_user" && TPL_UPDATE_EVENT_TYPES.includes(e.eventType));
    const lastReminderEvent = events.find(e => e.eventType === "tpl_update_reminder");
    const lastEscalationEvent = events.find(e => e.eventType === "tpl_update_overdue");

    // Honest fallback chain: a real 3PL update if there's been one, else when
    // it was assigned to them, else (shouldn't normally happen) when created.
    const startClock: unknown = lastTplEvent?.createdAt ?? shipment.assignedAt ?? shipment.createdAt;
    if (!isValidDate(startClock)) continue; // can't tell -- never guess a clock start

    // The clock never counts idle-hour time: a shipment that's been quiet
    // since before today's 7am open is treated as having gone quiet AT 7am,
    // not however many hours earlier it actually was -- the overnight gap
    // the 3PL isn't on the hook for never gets counted toward the 6h/12h
    // thresholds below.
    const rawStart = new Date(startClock as unknown as string);
    const windowStart = mostRecentOperatingWindowStart(now);
    const effectiveStart = rawStart.getTime() > windowStart.getTime() ? rawStart : windowStart;

    const hoursSinceLastUpdate = (now.getTime() - effectiveStart.getTime()) / 3_600_000;

    // A reminder/escalation only counts if it happened AFTER the last real
    // update -- one from a previous stale period is irrelevant now.
    const reminderStillCounts = !!lastReminderEvent && (!lastTplEvent || lastReminderEvent.id > lastTplEvent.id);
    const hoursSinceLastReminder = reminderStillCounts
      ? (now.getTime() - new Date(lastReminderEvent!.createdAt as unknown as string).getTime()) / 3_600_000
      : null;
    const alreadyEscalated = !!lastEscalationEvent && (!lastTplEvent || lastEscalationEvent.id > lastTplEvent.id);

    const { shouldRemind, shouldEscalate } = reminderDecision({ hoursSinceLastUpdate, hoursSinceLastReminder, alreadyEscalated });
    const hoursRounded = Math.floor(hoursSinceLastUpdate);

    if (shouldRemind && withinOperatingHours) {
      await db.insert(trackingEvents).values({
        shipmentId: shipment.id,
        eventType: "tpl_update_reminder",
        oldStatus: shipment.status,
        newStatus: shipment.status,
        notes: `Automatic reminder sent -- no update from the 3PL for ${hoursRounded}h.`,
        createdBy: 0,
        actorRole: "system",
      });
      await notifyTplUpdateReminder(shipment.id, hoursRounded).catch(() => {});
      remindersSent++;
    }

    if (shouldEscalate && withinOperatingHours) {
      await db.insert(trackingEvents).values({
        shipmentId: shipment.id,
        eventType: "tpl_update_overdue",
        oldStatus: shipment.status,
        newStatus: shipment.status,
        notes: `No update from the 3PL for ${hoursRounded}h.`,
        createdBy: 0,
        actorRole: "system",
      });
      await notifyTplUpdateOverdue(shipment.id, hoursRounded).catch(() => {});
      escalationsSent++;
    }
  }

  return { withinOperatingHours, shipmentsChecked: active.length, remindersSent, escalationsSent };
}

let intervalHandle: ReturnType<typeof setInterval> | null = null;

// Starts the recurring check. Safe to call once at server startup; a second
// call is a no-op so a hot-reload in dev can't stack up multiple timers.
export function startTplReminderScheduler(intervalMs = 30 * 60 * 1000): void {
  if (intervalHandle) return;
  // Run once shortly after startup (not instantly -- let DB connections
  // settle) rather than waiting a full interval after every deploy.
  setTimeout(() => {
    checkTplUpdateReminders().catch(err => console.error("[Reminders] Initial check failed:", err));
  }, 30_000);
  intervalHandle = setInterval(() => {
    checkTplUpdateReminders().catch(err => console.error("[Reminders] Scheduled check failed:", err));
  }, intervalMs);
}
