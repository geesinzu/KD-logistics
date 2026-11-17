// Optional real-MySQL tests. Never point these at production; the local test
// schema is cleared before every test. Create it using db/schema.ts.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createConnection } from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";
import type { TrpcContext } from "./context";
import { shipmentRouter } from "./shipment-router";
const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("web-push", () => ({ default: { setVapidDetails: vi.fn(), sendNotification: send } }));
const url = process.env.KEDI_CORRECTION_TEST_URL;
const input = { shipmentId: 70001, expectedTplId: 10030001, expectedStatus: "at_3pl", correctTplId: 10030002, reason: "Driver dropped at Knightpride; S.generation was incorrectly selected." };
describe.skipIf(!url)("3PL correction on real MySQL", () => {
  let db: Connection;
  const context = (tplId?: number) => ({ req: new Request("http://localhost"), resHeaders: new Headers(), ...(tplId ? { tplUser: { id: tplId, tplId, role: "tpl_admin", status: "active" } } : { user: { id: 1, name: "Test Super Admin", role: "super_admin", status: "active" } }) }) as TrpcContext;
  const api = () => shipmentRouter.createCaller(context());
  const partner = (id: number) => shipmentRouter.createCaller(context(id));
  async function rows(sql: string) { const [result] = await db.query<RowDataPacket[]>(sql); return result; }
  beforeAll(async () => {
    const target = new URL(url!);
    if (!["127.0.0.1", "localhost"].includes(target.hostname) || !target.pathname.endsWith("_test") || process.env.DATABASE_URL !== url) throw Error("Use matching isolated localhost _test URLs only");
    db = await createConnection({ uri: url, dateStrings: true });
  });
  afterAll(async () => { if (db) await db.end(); });
  beforeEach(async () => {
    send.mockClear(); await db.query("DROP TRIGGER IF EXISTS fail_tpl_audit");
    for (const table of ["tracking_events", "activity_log", "shipments", "third_party_logistics"]) await db.query(`DELETE FROM ${table}`);
    await db.query("INSERT INTO third_party_logistics (id,name,code,status) VALUES (10030001,'S.generation Logistics','SGNL','active'),(10030002,'Knightpride Logistics','KNGL','active'),(10030003,'Inactive partner','INACT','inactive')");
    await db.query("INSERT INTO shipments (id,tracking_id,created_by,dest_branch_id,status,tpl_id,tpl_pickup_type,assigned_driver_id,actual_item_count,estimated_delivery_date,created_at,labeled_at,assigned_at,special_instructions) VALUES (70001,'TEST-CORRECTION',1,2,'at_3pl',10030001,'kedi_driver_drop',9,12,'2026-11-20','2026-11-13 07:00:00','2026-11-13 07:30:00','2026-11-13 08:00:00','Keep cartons sealed')");
    await db.query("INSERT INTO tracking_events (shipment_id,event_type,old_status,new_status,notes,created_by,actor_role,created_at) VALUES (70001,'assigned_to_3pl','labeled','waiting_driver_pickup','Assigned to S.generation',1,'logistics_officer','2026-11-13 08:00:00'),(70001,'driver_pickup_confirmed','waiting_driver_pickup','picked_up','Original pickup evidence',9,'driver','2026-11-13 10:00:00'),(70001,'driver_dropoff_at_3pl','picked_up','at_3pl','Original drop-off evidence',9,'driver','2026-11-13 14:00:00')");
  });
  it("changes only the company, preserves the entire driver history, and revokes the old company", async () => {
    const [before] = await rows("SELECT * FROM shipments WHERE id=70001");
    const events = await rows("SELECT * FROM tracking_events ORDER BY id");
    expect(await api().correct3plAssignment(input)).toMatchObject({ success: true, tplName: "Knightpride Logistics", status: "at_3pl" });
    const [after] = await rows("SELECT * FROM shipments WHERE id=70001");
    expect(after.tpl_id).toBe(10030002);
    for (const key of Object.keys(before)) if (!["tpl_id", "updated_at"].includes(key)) expect(after[key]).toEqual(before[key]);
    const afterEvents = await rows("SELECT * FROM tracking_events ORDER BY id");
    expect(afterEvents.slice(0, 3)).toEqual(events); expect(afterEvents).toHaveLength(4);
    expect(afterEvents[3]).toMatchObject({ event_type: "note_added", old_status: "at_3pl", new_status: "at_3pl", created_by: 1 });
    const audit = await rows("SELECT * FROM activity_log"); expect(audit).toHaveLength(1); expect(audit[0].action).toBe("correct_tpl_assignment");
    expect((await partner(10030002).getById({ id: 70001 }))?.tplName).toBe("Knightpride Logistics");
    const history = await partner(10030002).getTrackingHistory({ shipmentId: 70001 });
    expect(history.some(e => e.eventType === "driver_dropoff_at_3pl")).toBe(true);
    await expect(partner(10030001).getById({ id: 70001 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(partner(10030001).getTrackingHistory({ shipmentId: 70001 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const old = partner(10030001);
    const denied = [() => old.tplPickupFromWarehouse({ shipmentId: 70001, receivedQty: 12 }), () => old.tplConfirmReceipt({ shipmentId: 70001, receivedQty: 12, condition: "good" }), () => old.tplReceiveRemainingItems({ shipmentId: 70001, additionalQty: 1 }), () => old.tplUpdateLocation({ shipmentId: 70001, location: "Wrong company", updateType: "full_delivery" }), () => old.tplUpdateDeliveryDate({ shipmentId: 70001, estimatedDeliveryDate: "2026-12-01" })];
    for (const call of denied) await expect(call()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await rows("SELECT status FROM shipments WHERE id=70001"))[0].status).toBe("at_3pl");
    expect(await rows("SELECT * FROM tracking_events ORDER BY id")).toEqual(afterEvents);
    expect(send).not.toHaveBeenCalled();
    await partner(10030002).tplConfirmReceipt({ shipmentId: 70001, receivedQty: 12, condition: "good" });
    expect((await rows("SELECT status FROM shipments WHERE id=70001"))[0].status).toBe("tpl_confirmed");
  });
  it("rolls back the company change and history note if the audit cannot be stored", async () => {
    const before = await rows("SELECT * FROM shipments WHERE id=70001"), events = await rows("SELECT * FROM tracking_events ORDER BY id");
    await db.query("CREATE TRIGGER fail_tpl_audit BEFORE INSERT ON activity_log FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Test audit failure'");
    await expect(api().correct3plAssignment(input)).rejects.toThrow();
    expect(await rows("SELECT * FROM shipments WHERE id=70001")).toEqual(before);
    expect(await rows("SELECT * FROM tracking_events ORDER BY id")).toEqual(events);
  });
  it("rejects a stale review and serializes duplicate corrections", async () => {
    await expect(api().correct3plAssignment({ ...input, expectedStatus: "picked_up" })).rejects.toMatchObject({ code: "CONFLICT" });
    const results = await Promise.allSettled([api().correct3plAssignment(input), api().correct3plAssignment(input)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(await rows("SELECT * FROM activity_log")).toHaveLength(1);
  });
  it("rejects an inactive or unchanged company", async () => {
    for (const correctTplId of [10030001, 10030003, 999]) await expect(api().correct3plAssignment({ ...input, correctTplId })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(await rows("SELECT * FROM activity_log")).toHaveLength(0);
  });
  it("blocks the normal assignment workflow from resetting a dropped-off shipment", async () => {
    await expect(api().assign3pl({ shipmentId: 70001, tplId: 10030002, tplPickupType: "kedi_driver_drop", assignedDriverId: 9 })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect((await rows("SELECT status,tpl_id FROM shipments WHERE id=70001"))[0]).toMatchObject({ status: "at_3pl", tpl_id: 10030001 });
    expect(await rows("SELECT * FROM tracking_events")).toHaveLength(3);
  });
  it.each(["tpl_confirmed", "in_transit_with_3pl", "partially_delivered", "delivered", "completed", "at_hub", "onward_in_transit"])("requires separate review of %s", async status => {
    await db.execute("UPDATE shipments SET status=? WHERE id=70001", [status]);
    await expect(api().correct3plAssignment({ ...input, expectedStatus: status })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
  it("rejects existing 3PL activity even if the stage was reset", async () => {
    await db.query("INSERT INTO tracking_events (shipment_id,event_type,actor_type) VALUES (70001,'note_added','tpl_user')");
    await expect(api().correct3plAssignment(input)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
  it("checks ownership after acquiring the row lock, not before waiting", async () => {
    await db.beginTransaction(); await db.query("SELECT id FROM shipments WHERE id=70001 FOR UPDATE");
    const pending = partner(10030001).tplConfirmReceipt({ shipmentId: 70001, receivedQty: 12, condition: "good" });
    const result = expect(pending).rejects.toMatchObject({ code: "FORBIDDEN" });
    await db.query("UPDATE shipments SET tpl_id=10030002 WHERE id=70001"); await db.commit(); await result;
    expect((await rows("SELECT status,tpl_confirmed_at FROM shipments WHERE id=70001"))[0]).toMatchObject({ status: "at_3pl", tpl_confirmed_at: null });
  });
});
