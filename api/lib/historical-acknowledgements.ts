import { randomUUID } from "node:crypto";
import type { Connection, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { TRPCError } from "@trpc/server";
import { planAcknowledgements } from "../../db/lib/historical-ack-plan.mjs";
import type { HistoricalAckRow } from "../../db/lib/historical-ack-plan.mjs";

export const HISTORICAL_ACK_CUTOFF = "2026-11-01";
export const HISTORICAL_ACK_JOB = "kedi_ack_before_nov2026";
export const HISTORICAL_ACK_ACTOR = "system_backfill";

// Deliberately independent of the normal acknowledgement mutation and all
// notification senders. No push, email, or notification records are emitted.
export async function runHistoricalAcknowledgements(
  connection: Connection,
  userId: number,
  expectedDigest?: string,
) {
  const apply = expectedDigest !== undefined;
  let locked = false;
  let transaction = false;
  try {
    await connection.query("SET SESSION time_zone = '+01:00'");
    if (apply) {
      const [lock] = await connection.execute<RowDataPacket[]>("SELECT GET_LOCK(?, 0) AS acquired", [HISTORICAL_ACK_JOB]);
      locked = Number(lock[0]?.acquired) === 1;
      if (!locked) throw new TRPCError({ code: "CONFLICT", message: "Another correction is running. Refresh the preview shortly." });
      // Reject nontransactional live tables: rollback must cover every write.
      const [engines] = await connection.query<RowDataPacket[]>("SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('shipments', 'tracking_events', 'activity_log') AND engine = 'InnoDB'");
      if (engines.length !== 3) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "The required transactional tables are unavailable. No changes were made." });
    }
    await connection.beginTransaction(); transaction = true;
    const [done] = await connection.execute<RowDataPacket[]>("SELECT details, created_at FROM activity_log WHERE action = 'historical_ack_completed' AND entity_type = 'maintenance' AND JSON_UNQUOTE(JSON_EXTRACT(details, '$.job')) = ? ORDER BY id DESC LIMIT 1", [HISTORICAL_ACK_JOB]);
    if (done.length) {
      if (apply) throw new TRPCError({ code: "CONFLICT", message: "This one-time correction has already completed." });
      const details = typeof done[0].details === "string" ? JSON.parse(done[0].details) : done[0].details;
      return { completed: true as const, cutoff: HISTORICAL_ACK_CUTOFF, count: Number(details.count), completedAt: String(done[0].created_at) };
    }
    const [rows] = await connection.execute<RowDataPacket[]>(`SELECT id, tracking_id, status, delivered_at, completed_at, updated_at, hub_branch_id, actual_item_count, delivered_qty, remaining_qty FROM shipments WHERE status = 'delivered' AND (completed_at IS NULL OR CAST(completed_at AS CHAR) LIKE '0000-00-00%') AND (delivered_at IS NULL OR CAST(delivered_at AS CHAR) < ?) ORDER BY id${apply ? " FOR UPDATE" : ""}`, [HISTORICAL_ACK_CUTOFF + " 00:00:00"]);
    const acknowledged = new Set<string>();
    for (let offset = 0; offset < rows.length; offset += 500) {
      const ids = rows.slice(offset, offset + 500).map(r => r.id);
      const [events] = await connection.execute<RowDataPacket[]>(`SELECT shipment_id FROM tracking_events WHERE event_type = 'delivery_acknowledged' AND shipment_id IN (${ids.map(() => "?").join(",")})${apply ? " FOR UPDATE" : ""}`, ids);
      for (const event of events) acknowledged.add(String(event.shipment_id));
    }
    const plan = planAcknowledgements(rows as HistoricalAckRow[], HISTORICAL_ACK_CUTOFF, acknowledged);
    if (!apply) return {
      completed: false as const, cutoff: HISTORICAL_ACK_CUTOFF, count: plan.eligible.length,
      digest: plan.digest, skipped: plan.skipped,
      records: plan.eligible.map(r => ({ id: String(r.id), trackingId: r.tracking_id, deliveredAt: r.delivered_at! })),
    };
    if (expectedDigest !== plan.digest) throw new TRPCError({ code: "CONFLICT", message: "Shipments changed since the preview. Refresh and review the new preview." });
    if (!plan.eligible.length) throw new TRPCError({ code: "BAD_REQUEST", message: "There are no eligible shipments to update." });

    const jobId = randomUUID(), appliedAt = new Date().toISOString();
    for (const row of plan.eligible) {
      const [before] = await connection.execute<RowDataPacket[]>("SELECT * FROM shipments WHERE id = ? FOR UPDATE", [row.id]);
      // Store the original row durably BEFORE its update, in the same transaction.
      const [backup] = await connection.execute<ResultSetHeader>("INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES (?, 'historical_ack_backup', 'shipment', ?, ?)", [userId, row.id, JSON.stringify({ job: HISTORICAL_ACK_JOB, jobId, appliedAt, cutoff: HISTORICAL_ACK_CUTOFF, before: before[0] })]);
      const [update] = await connection.execute<ResultSetHeader>("UPDATE shipments SET status = 'completed', completed_at = delivered_at, updated_at = NOW() WHERE id = ? AND status = 'delivered' AND (completed_at IS NULL OR CAST(completed_at AS CHAR) LIKE '0000-00-00%') AND delivered_at < ? AND hub_branch_id IS NULL AND COALESCE(remaining_qty, 0) = 0", [row.id, HISTORICAL_ACK_CUTOFF + " 00:00:00"]);
      if (update.affectedRows !== 1) throw new Error("Target changed");
      const note = `Administrator-requested historical correction. Acknowledgement date copied from existing delivery date; not a new physical receipt confirmation. Applied at ${appliedAt}; job ${jobId}. No notifications sent.`;
      const [event] = await connection.execute<ResultSetHeader>("INSERT INTO tracking_events (shipment_id, event_type, old_status, new_status, notes, created_by, actor_role, actor_type, created_at) VALUES (?, 'delivery_acknowledged', 'delivered', 'completed', ?, ?, ?, 'kedi_user', ?)", [row.id, note, userId, HISTORICAL_ACK_ACTOR, row.delivered_at]);
      await connection.execute("UPDATE activity_log SET details = JSON_SET(details, '$.eventId', ?) WHERE id = ?", [String(event.insertId), backup.insertId]);
      const [after] = await connection.execute<RowDataPacket[]>("SELECT status, delivered_at, completed_at FROM shipments WHERE id = ?", [row.id]);
      if (after[0]?.status !== "completed" || after[0].delivered_at !== row.delivered_at || after[0].completed_at !== row.delivered_at) throw new Error("Verification failed");
    }
    await connection.execute("INSERT INTO activity_log (user_id, action, entity_type, details) VALUES (?, 'historical_ack_completed', 'maintenance', ?)", [userId, JSON.stringify({ job: HISTORICAL_ACK_JOB, jobId, appliedAt, cutoff: HISTORICAL_ACK_CUTOFF, count: plan.eligible.length, digest: plan.digest, notificationsSent: 0 })]);
    await connection.commit(); transaction = false;
    return { completed: true as const, cutoff: HISTORICAL_ACK_CUTOFF, count: plan.eligible.length, completedAt: appliedAt };
  } finally {
    try { if (transaction) await connection.rollback(); }
    finally { if (locked) await connection.execute("SELECT RELEASE_LOCK(?)", [HISTORICAL_ACK_JOB]); }
  }
}
