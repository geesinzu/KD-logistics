// Optional real-MySQL integration suite. Requires an isolated schema created
// from db/schema.ts; never use production credentials. See docs maintenance.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createConnection } from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";
import type { TrpcContext } from "./context";
import { runHistoricalAcknowledgements, HISTORICAL_ACK_JOB } from "./lib/historical-acknowledgements";

const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("web-push", () => ({ default: { setVapidDetails: vi.fn(), sendNotification: send } }));
const testUrl = process.env.KEDI_ACK_TEST_URL;

describe.skipIf(!testUrl)("historical corrections on real MySQL", () => {
  let db: Connection;
  async function rows(sql: string, params: (string | number)[] = []) { const [result] = await db.execute<RowDataPacket[]>(sql, params); return result; }
  async function preview() { return runHistoricalAcknowledgements(db, 1); }
  async function digest() { const p = await preview(); if (p.completed) throw Error("already completed"); return p.digest; }
  beforeAll(async () => {
    const url = new URL(testUrl!);
    if (!["localhost", "127.0.0.1"].includes(url.hostname) || !url.pathname.endsWith("_test")) throw Error("Only an isolated localhost _test database is allowed");
    process.env.DATABASE_URL = testUrl;
    db = await createConnection({ uri: testUrl, dateStrings: true, supportBigNumbers: true, bigNumberStrings: true });
  });
  afterAll(async () => { if (db) await db.end(); });
  beforeEach(async () => {
    send.mockClear();
    await db.query("DROP TRIGGER IF EXISTS fail_historical_event");
    await db.query("DELETE FROM activity_log");
    await db.query("DELETE FROM tracking_events");
    await db.query("DELETE FROM shipments");
    await db.query("SET SESSION time_zone = '+01:00'");
    await db.query(`INSERT INTO shipments (id, tracking_id, created_by, dest_branch_id, status, delivered_at, actual_item_count, delivered_qty, remaining_qty, hub_branch_id) VALUES
      (1, 'OLD', 1, 2, 'delivered', '2026-10-31 23:59:59', 10, 10, 0, NULL),
      (2, 'NOV', 1, 2, 'delivered', '2026-11-01 00:00:00', 10, 10, 0, NULL),
      (3, 'HUB', 1, 2, 'delivered', '2026-10-20 00:00:00', 10, 10, 0, 7),
      (4, 'SHORT', 1, 2, 'delivered', '2026-10-20 00:00:00', 10, 8, 2, NULL),
      (5, 'MISSING', 1, 2, 'delivered', NULL, 10, 10, 0, NULL),
      (6, 'INCONSISTENT', 1, 2, 'delivered', '2026-10-20 00:00:00', 10, 10, 0, NULL)`);
    await db.query("INSERT INTO tracking_events (shipment_id, event_type) VALUES (6, 'delivery_acknowledged')");
  });
  it("previews without writes, commits backed-up corrections once, and suppresses notifications", async () => {
    const original = await rows("SELECT * FROM shipments ORDER BY id");
    const p = await preview();
    expect(p.completed).toBe(false);
    if (p.completed) throw Error("unexpected completion");
    expect(p.count).toBe(1); expect(p.skipped).toHaveLength(4);
    expect(await rows("SELECT * FROM activity_log")).toHaveLength(0);
    expect(await rows("SELECT * FROM shipments ORDER BY id")).toEqual(original);
    expect(await runHistoricalAcknowledgements(db, 1, p.digest)).toMatchObject({ completed: true, count: 1 });
    const changed = await rows("SELECT * FROM shipments ORDER BY id");
    expect(changed[0].completed_at).toBe(original[0].delivered_at);
    expect(changed[0].status).toBe("completed");
    expect(changed.slice(1)).toEqual(original.slice(1));
    const audit = await rows("SELECT details FROM activity_log WHERE action = 'historical_ack_backup'");
    const details = typeof audit[0].details === "string" ? JSON.parse(audit[0].details) : audit[0].details;
    expect(details.before).toEqual(original[0]); expect(details.eventId).toBeDefined();
    const events = await rows("SELECT * FROM tracking_events WHERE actor_role = 'system_backfill'");
    expect(events).toHaveLength(1); expect(events[0].created_at).toBe(original[0].delivered_at);
    expect(events[0].created_by).toBe("1");
    await expect(runHistoricalAcknowledgements(db, 1, p.digest)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await preview()).toMatchObject({ completed: true, count: 1 });
    // Exercise the actual notification-center SQL for KEDI and separate 3PL auth.
    await db.query("UPDATE shipments SET tpl_id = 10 WHERE id = 1");
    await db.query("INSERT INTO tracking_events (shipment_id, event_type) VALUES (1, 'assigned_to_3pl')");
    const { shipmentRouter } = await import("./shipment-router");
    for (const identity of [{ user: { id: 1, role: "super_admin" } }, { user: { id: 2, role: "branch_manager", branchId: 2 } }, { tplUser: { id: 1, tplId: 10 } }]) {
      const api = shipmentRouter.createCaller({ req: new Request("http://localhost"), resHeaders: new Headers(), ...identity } as TrpcContext);
      const feed = await api.recentActivity({ limit: 100 });
      expect(feed.events.length).toBeGreaterThan(0);
      expect(feed.events.some(e => e.actorRole === "system_backfill")).toBe(false);
    }
    expect(send).not.toHaveBeenCalled();
  }, 20000);
  it("rejects a changed preview with no updates or backups", async () => {
    const hash = await digest();
    await db.query("UPDATE shipments SET delivered_at = '2026-10-30 15:00:00' WHERE id = 1");
    await expect(runHistoricalAcknowledgements(db, 1, hash)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await rows("SELECT * FROM activity_log")).toHaveLength(0);
    expect((await rows("SELECT status FROM shipments WHERE id = 1"))[0].status).toBe("delivered");
  });
  it("rolls back the shipment, backup, and marker if the audit event fails", async () => {
    const hash = await digest();
    await db.query("CREATE TRIGGER fail_historical_event BEFORE INSERT ON tracking_events FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Test failure'");
    await expect(runHistoricalAcknowledgements(db, 1, hash)).rejects.toThrow();
    expect(await rows("SELECT * FROM activity_log")).toHaveLength(0);
    expect((await rows("SELECT status, completed_at FROM shipments WHERE id = 1"))[0]).toMatchObject({ status: "delivered", completed_at: null });
    expect(Number((await rows("SELECT IS_FREE_LOCK(?) AS available", [HISTORICAL_ACK_JOB]))[0].available)).toBe(1);
    await db.query("DROP TRIGGER fail_historical_event");
    expect(await runHistoricalAcknowledgements(db, 1, hash)).toMatchObject({ completed: true });
  });
  it("rejects a concurrent correction", async () => {
    const hash = await digest();
    const other = await createConnection(testUrl!);
    try {
      await other.execute("SELECT GET_LOCK(?, 0)", [HISTORICAL_ACK_JOB]);
      await expect(runHistoricalAcknowledgements(db, 1, hash)).rejects.toMatchObject({ code: "CONFLICT" });
      expect(await rows("SELECT * FROM activity_log")).toHaveLength(0);
    } finally { await other.end(); }
  });
});
