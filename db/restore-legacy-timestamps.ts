// One-time data restoration: writes real timestamps (from a pre-corruption
// backup export) back into shipments/tracking_events rows whose created_at
// was lost when the NOT NULL constraint was enforced during an earlier
// `drizzle-kit push`. See db/data/shipment-timestamps-backup.txt for the
// source data and the restoration plan for full context.
//
// Dry-run by default -- prints exactly what it would change. Pass --apply
// to actually write. Never touches a row whose current value is already
// valid, and never guesses: any shipment whose live event count or event
// types don't line up with the backup is skipped and reported, not forced.
//
// Usage:
//   npx tsx db/restore-legacy-timestamps.ts            (dry run)
//   npx tsx db/restore-legacy-timestamps.ts --apply     (writes for real)

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createConnection } from "mysql2";
import { drizzle } from "drizzle-orm/mysql2";
import { eq, asc } from "drizzle-orm";
import * as schema from "./schema";
import { shipments, trackingEvents } from "./schema";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes("--apply");

function isValidEventDate(d: unknown): boolean {
  if (!d) return false;
  const time = new Date(d as string).getTime();
  return !isNaN(time) && new Date(d as string).getFullYear() >= 2000;
}

// Event list timestamps in the backup are [DD/MM/YYYY, HH:mm:ss] with no
// explicit offset. Confirmed against the file's own "Created:" line (which
// DOES carry an explicit "GMT+0800 (China Standard Time)") that both fields
// share the same basis -- every shipment's first event matches its Created
// line to the second. So: parse as UTC+8 wall-clock, convert to a true UTC
// instant.
function parseBackupEventDate(dd: string, mm: string, yyyy: string, hh: string, min: string, ss: string): Date {
  const utcMs = Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min), Number(ss));
  return new Date(utcMs - 8 * 60 * 60 * 1000);
}

interface BackupEvent {
  eventType: string;
  createdAt: Date;
}

interface BackupShipment {
  trackingId: string;
  createdAt: Date;
  events: BackupEvent[];
}

function parseBackup(raw: string): BackupShipment[] {
  const text = raw.replace(/\\n/g, "\n");
  const blocks = text.split(/\n(?=SHIPMENT: )/).filter(b => b.trim().startsWith("SHIPMENT:"));

  return blocks.map(block => {
    const trackingId = /SHIPMENT: (\S+)/.exec(block)![1];
    const createdMatch = /Created: (.+)/.exec(block)!;
    const createdAt = new Date(createdMatch[1].trim());

    const events: BackupEvent[] = [];
    const eventLineRe = /- \[(\d{2})\/(\d{2})\/(\d{4}), (\d{2}):(\d{2}):(\d{2})\] (\w+) \|/g;
    let m: RegExpExecArray | null;
    while ((m = eventLineRe.exec(block)) !== null) {
      const [, dd, mm, yyyy, hh, min, ss, eventType] = m;
      events.push({ eventType, createdAt: parseBackupEventDate(dd, mm, yyyy, hh, min, ss) });
    }

    return { trackingId, createdAt, events };
  });
}

async function main() {
  const raw = readFileSync(join(__dirname, "data", "shipment-timestamps-backup.txt"), "utf-8");
  const backupShipments = parseBackup(raw);
  console.log(`Parsed ${backupShipments.length} shipments from backup.\n`);

  const connection = createConnection(process.env.DATABASE_URL || "");
  const db = drizzle(connection, { schema, mode: "planetscale" });

  let shipmentsMatched = 0;
  let shipmentsNotFound = 0;
  let shipmentDatesFixed = 0;
  let eventsFixed = 0;
  let shipmentsSkippedCountMismatch = 0;
  let shipmentsSkippedTypeMismatch = 0;

  for (const backup of backupShipments) {
    const liveRows = await db.select().from(shipments).where(eq(shipments.trackingId, backup.trackingId)).limit(1);
    const live = liveRows[0];
    if (!live) {
      console.log(`[NOT FOUND] ${backup.trackingId} -- no matching shipment in live DB, skipped.`);
      shipmentsNotFound++;
      continue;
    }
    shipmentsMatched++;

    if (!isValidEventDate(live.createdAt)) {
      console.log(`[SHIPMENT] ${backup.trackingId}: created_at invalid live -> ${backup.createdAt.toISOString()}`);
      shipmentDatesFixed++;
      if (APPLY) {
        await db.update(shipments).set({ createdAt: backup.createdAt }).where(eq(shipments.id, live.id));
      }
    }

    const liveEvents = await db.select().from(trackingEvents)
      .where(eq(trackingEvents.shipmentId, live.id))
      .orderBy(asc(trackingEvents.id));

    if (liveEvents.length !== backup.events.length) {
      console.log(`[MISMATCH] ${backup.trackingId}: live has ${liveEvents.length} events, backup has ${backup.events.length} -- events skipped, review manually.`);
      shipmentsSkippedCountMismatch++;
      continue;
    }

    let typeMismatch = false;
    for (let i = 0; i < liveEvents.length; i++) {
      if (liveEvents[i].eventType !== backup.events[i].eventType) {
        console.log(`[MISMATCH] ${backup.trackingId}: event #${i} type live="${liveEvents[i].eventType}" backup="${backup.events[i].eventType}" -- events skipped, review manually.`);
        typeMismatch = true;
        break;
      }
    }
    if (typeMismatch) {
      shipmentsSkippedTypeMismatch++;
      continue;
    }

    for (let i = 0; i < liveEvents.length; i++) {
      const liveEvent = liveEvents[i];
      const backupEvent = backup.events[i];
      if (!isValidEventDate(liveEvent.createdAt)) {
        console.log(`  [EVENT] ${backup.trackingId} #${i} ${liveEvent.eventType}: invalid live -> ${backupEvent.createdAt.toISOString()}`);
        eventsFixed++;
        if (APPLY) {
          await db.update(trackingEvents).set({ createdAt: backupEvent.createdAt }).where(eq(trackingEvents.id, liveEvent.id));
        }
      }
    }
  }

  console.log("\n── Summary ──");
  console.log(`Mode: ${APPLY ? "APPLIED (wrote to database)" : "DRY RUN (no changes written -- pass --apply to write)"}`);
  console.log(`Shipments matched: ${shipmentsMatched}`);
  console.log(`Shipments not found in live DB: ${shipmentsNotFound}`);
  console.log(`Shipment created_at fixed: ${shipmentDatesFixed}`);
  console.log(`Tracking events fixed: ${eventsFixed}`);
  console.log(`Shipments skipped (event count mismatch): ${shipmentsSkippedCountMismatch}`);
  console.log(`Shipments skipped (event type mismatch): ${shipmentsSkippedTypeMismatch}`);

  connection.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
