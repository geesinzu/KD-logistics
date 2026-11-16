// Optional integration suite; clears only the designated disposable local schema.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createConnection } from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";
import type { TrpcContext } from "./context";
import { shipmentRouter } from "./shipment-router";
const url = process.env.KEDI_PARTIAL_TEST_URL;
const repair = { shipmentId: 80001, expectedDeliveredQty: 70, expectedRemainingQty: 0, expectedStatus: "partially_delivered", expectedTotal: 50, deliveredQty: 38, reason: "Deleted the incorrect 32-item entry; the valid re-entry was 38. Actual delivered total is 38 of 50." };
describe.skipIf(!url)("partial quantity correction on MySQL", () => {
  let db: Connection;
  const admin = (role = "super_admin", status = "active") => shipmentRouter.createCaller({ req: new Request("http://localhost"), resHeaders: new Headers(), user: { id: 1, name: "Local test admin", role, status } } as TrpcContext);
  const partner = () => shipmentRouter.createCaller({ req: new Request("http://localhost"), resHeaders: new Headers(), tplUser: { id: 10, tplId: 10, role: "tpl_admin" } } as TrpcContext);
  async function rows(sql: string) { const [result] = await db.query<RowDataPacket[]>(sql); return result; }
  async function seedStale() {
    await db.query("DELETE FROM tracking_events WHERE event_type='tpl_partial_delivery'");
    await db.query("UPDATE shipments SET delivered_qty=70,remaining_qty=0,status='partially_delivered' WHERE id=80001");
    await db.query("INSERT INTO activity_log (user_id,action,entity_type,entity_id,details) VALUES (1,'delete_tracking_event','tracking_event',99,JSON_OBJECT('shipmentId',80001,'eventType','tpl_partial_delivery','notes','Partial delivery: 32 items. Remaining: 18','revertedStatusTo','in_transit_with_3pl'))");
    await db.query("INSERT INTO tracking_events (id,shipment_id,event_type,old_status,new_status,qty_delivered,notes) VALUES (4,80001,'tpl_partial_delivery','in_transit_with_3pl','partially_delivered',38,'Valid re-entered 38. Old code incorrectly reported -20 remaining.')");
  }
  beforeAll(async () => {
    const target = new URL(url!);
    if (!["127.0.0.1", "localhost"].includes(target.hostname) || !target.pathname.endsWith("_test") || process.env.DATABASE_URL !== url) throw Error("Use matching isolated localhost _test URLs only");
    db = await createConnection({ uri: url, dateStrings: true });
  });
  afterAll(async () => { if (db) await db.end(); });
  beforeEach(async () => {
    await db.query("DROP TRIGGER IF EXISTS fail_quantity_audit");
    for (const table of ["activity_log", "tracking_events", "shipments"]) await db.query(`DELETE FROM ${table}`);
    await db.query("INSERT INTO shipments (id,tracking_id,created_by,dest_branch_id,status,tpl_id,assigned_driver_id,actual_item_count,delivered_qty,remaining_qty,assigned_at,estimated_delivery_date) VALUES (80001,'TEST-PARTIAL',1,2,'partially_delivered',10,9,50,32,18,'2026-11-10 09:00:00','2026-11-20')");
    await db.query("INSERT INTO tracking_events (id,shipment_id,event_type,old_status,new_status,qty_delivered,notes) VALUES (1,80001,'driver_dropoff_at_3pl','picked_up','at_3pl',NULL,'Original driver history'),(2,80001,'tpl_location_update','tpl_confirmed','in_transit_with_3pl',NULL,'Earlier movement'),(3,80001,'tpl_partial_delivery','in_transit_with_3pl','partially_delivered',32,'Wrong 32 entered')");
  });
  it("deletes 32 from the shipment total before the 3PL re-enters 38", async () => {
    const deleted = await admin().deleteTrackingEvent({ eventId: 3 });
    expect(deleted.quantityChange).toEqual({ deliveredQty: 0, remainingQty: 50 });
    expect((await rows("SELECT status FROM shipments WHERE id=80001"))[0].status).toBe("in_transit_with_3pl");
    await partner().tplUpdateLocation({ shipmentId: 80001, updateType: "partial_delivery", deliveredQty: 38, location: "Sample branch" });
    expect((await rows("SELECT delivered_qty,remaining_qty FROM shipments WHERE id=80001"))[0]).toMatchObject({ delivered_qty: 38, remaining_qty: 12 });
    expect(await rows("SELECT * FROM tracking_events WHERE event_type='driver_dropoff_at_3pl'")).toHaveLength(1);
  });
  it("deletes a second partial with no status transition and keeps earlier deliveries", async () => {
    await partner().tplUpdateLocation({ shipmentId: 80001, updateType: "partial_delivery", deliveredQty: 6, location: "Sample branch" });
    const [last] = await rows("SELECT id FROM tracking_events ORDER BY id DESC LIMIT 1");
    expect((await admin().deleteTrackingEvent({ eventId: last.id })).quantityChange).toEqual({ deliveredQty: 32, remainingQty: 18 });
    expect((await rows("SELECT status FROM shipments WHERE id=80001"))[0].status).toBe("partially_delivered");
  });
  it("removes an older partial, preserves the later quantity, then restores the prior stage at zero", async () => {
    await partner().tplUpdateLocation({ shipmentId: 80001, updateType: "partial_delivery", deliveredQty: 6, location: "Sample branch" });
    const [last] = await rows("SELECT id FROM tracking_events ORDER BY id DESC LIMIT 1");
    expect((await admin().deleteTrackingEvent({ eventId: 3 })).quantityChange).toEqual({ deliveredQty: 6, remainingQty: 44 });
    const result = await admin().deleteTrackingEvent({ eventId: last.id });
    expect(result.quantityChange).toEqual({ deliveredQty: 0, remainingQty: 50 });
    expect(result.revertedStatus).toBe("in_transit_with_3pl");
  });
  it("serializes concurrent deletes so the quantity is rolled back only once", async () => {
    const results = await Promise.allSettled([admin().deleteTrackingEvent({ eventId: 3 }), admin().deleteTrackingEvent({ eventId: 3 })]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect((await rows("SELECT delivered_qty,remaining_qty FROM shipments WHERE id=80001"))[0]).toMatchObject({ delivered_qty: 0, remaining_qty: 50 });
    expect(await rows("SELECT * FROM activity_log WHERE action='delete_tracking_event'")).toHaveLength(1);
  });
  it("repairs the already-deleted 32 plus re-entered 38 case without touching valid history", async () => {
    await seedStale(); const [before] = await rows("SELECT * FROM shipments WHERE id=80001");
    const original = await rows("SELECT * FROM tracking_events ORDER BY id");
    expect(await admin().correctPartialDeliveryTotal(repair)).toMatchObject({ deliveredQty: 38, remainingQty: 12, status: "partially_delivered" });
    const [after] = await rows("SELECT * FROM shipments WHERE id=80001");
    for (const key of Object.keys(before)) if (!["delivered_qty", "remaining_qty", "updated_at"].includes(key)) expect(after[key]).toEqual(before[key]);
    expect(after.delivered_qty).toBe(38); expect(after.remaining_qty).toBe(12);
    expect((await rows("SELECT * FROM tracking_events ORDER BY id")).slice(0, original.length)).toEqual(original);
    expect(await rows("SELECT * FROM activity_log WHERE action='correct_delivery_quantity'")).toHaveLength(1);
    await expect(admin().deleteTrackingEvent({ eventId: 4 })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    await partner().tplUpdateLocation({ shipmentId: 80001, updateType: "partial_delivery", deliveredQty: 5, location: "Sample branch" });
    const [last] = await rows("SELECT id FROM tracking_events WHERE event_type='tpl_partial_delivery' ORDER BY id DESC LIMIT 1");
    expect((await admin().deleteTrackingEvent({ eventId: last.id })).quantityChange).toEqual({ deliveredQty: 38, remainingQty: 12 });
  });
  it("repairs a historical overcount without an audit only when surviving entries verify the total", async () => {
    await seedStale(); await db.query("DELETE FROM activity_log");
    await expect(admin().correctPartialDeliveryTotal({ ...repair, deliveredQty: 37 })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(await admin().correctPartialDeliveryTotal(repair)).toMatchObject({ deliveredQty: 38, remainingQty: 12 });
    const [audit] = await rows("SELECT details FROM activity_log WHERE action='correct_delivery_quantity'");
    const details = typeof audit.details === "string" ? JSON.parse(audit.details) : audit.details;
    expect(details.evidenceSource).toBe("surviving_partial_entries_overcount");
    expect(details.verifiedPartialEventIds).toEqual([4]);
    expect(await rows("SELECT * FROM tracking_events WHERE id=4 AND qty_delivered=38")).toHaveLength(1);
  });
  it("rejects auditless repair with missing quantities or an existing correction baseline", async () => {
    await seedStale(); await db.query("DELETE FROM activity_log");
    await db.query("UPDATE tracking_events SET qty_delivered=NULL WHERE id=4");
    await expect(admin().correctPartialDeliveryTotal(repair)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    await db.query("UPDATE tracking_events SET qty_delivered=38 WHERE id=4");
    await db.query("INSERT INTO activity_log(user_id,action,entity_type,entity_id,details) VALUES(1,'correct_delivery_quantity','shipment',80001,JSON_OBJECT('correctionEventId',5))");
    await expect(admin().correctPartialDeliveryTotal(repair)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
  it("rejects stale reviews, duplicate corrections and over-counting", async () => {
    await seedStale();
    await expect(admin().correctPartialDeliveryTotal({ ...repair, expectedDeliveredQty: 32 })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(partner().tplUpdateLocation({ shipmentId: 80001, updateType: "partial_delivery", deliveredQty: 38, location: "Sample" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await admin().correctPartialDeliveryTotal(repair);
    await expect(admin().correctPartialDeliveryTotal(repair)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(partner().tplUpdateLocation({ shipmentId: 80001, updateType: "partial_delivery", deliveredQty: 38, location: "Sample" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it.each(["admin", "logistics_officer", "branch_manager", "driver", "viewer"])("denies %s correction access", async role => {
    await expect(admin(role).correctPartialDeliveryTotal(repair)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(admin(role).deleteTrackingEvent({ eventId: 3 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("requires deleted-partial evidence and rejects dependent receipts", async () => {
    await expect(admin().correctPartialDeliveryTotal({ ...repair, expectedDeliveredQty: 32, expectedRemainingQty: 18 })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    await db.query("INSERT INTO tracking_events (shipment_id,event_type,old_status,new_status) VALUES (80001,'delivery_acknowledged','delivered','partially_delivered')");
    await expect(admin().deleteTrackingEvent({ eventId: 3 })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(await rows("SELECT * FROM tracking_events WHERE id=3")).toHaveLength(1);
  });
  it("rolls back deletion and quantity updates if auditing fails", async () => {
    await db.query("CREATE TRIGGER fail_quantity_audit BEFORE INSERT ON activity_log FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Test failure'");
    await expect(admin().deleteTrackingEvent({ eventId: 3 })).rejects.toThrow();
    expect(await rows("SELECT * FROM tracking_events WHERE id=3")).toHaveLength(1);
    expect((await rows("SELECT delivered_qty,remaining_qty FROM shipments WHERE id=80001"))[0]).toMatchObject({ delivered_qty: 32, remaining_qty: 18 });
  });
  it("rolls back an already-stale repair if audit storage fails", async () => {
    await seedStale(); const before = await rows("SELECT * FROM shipments WHERE id=80001"), history = await rows("SELECT * FROM tracking_events ORDER BY id");
    await db.query("CREATE TRIGGER fail_quantity_audit BEFORE INSERT ON activity_log FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Test failure'");
    await expect(admin().correctPartialDeliveryTotal(repair)).rejects.toThrow();
    expect(await rows("SELECT * FROM shipments WHERE id=80001")).toEqual(before); expect(await rows("SELECT * FROM tracking_events ORDER BY id")).toEqual(history);
  });
  it("does not alter quantities when an ordinary note is deleted", async () => {
    await db.query("INSERT INTO tracking_events (id,shipment_id,event_type,old_status,new_status,notes) VALUES (4,80001,'note_added','partially_delivered','partially_delivered','Ordinary note')");
    expect((await admin().deleteTrackingEvent({ eventId: 4 })).quantityChange).toBeNull();
    expect((await rows("SELECT delivered_qty,remaining_qty FROM shipments WHERE id=80001"))[0]).toMatchObject({ delivered_qty: 32, remaining_qty: 18 });
  });
});
