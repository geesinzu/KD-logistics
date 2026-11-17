// Destructive tests use only a separately designated localhost _test schema.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createConnection } from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";
import bcrypt from "bcryptjs";
import { shipmentRouter } from "./shipment-router";
import { userRouter } from "./user-router";
import { tplRouter } from "./tpl-router";
import { authRouter } from "./auth-router";
import { createToken, createTplToken, authenticateRequest, authenticateTplRequest } from "./lib/auth";
import type { TrpcContext } from "./context";
const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("web-push", () => ({ default: { setVapidDetails: vi.fn(), sendNotification: send } }));
const url = process.env.KEDI_SECURITY_TEST_URL;
const staff = (role = "super_admin", id = 1, branchId: number | null = null) => ({ req: new Request("http://localhost"), resHeaders: new Headers(), user: { id, name: "Local test user", role, status: "active", branchId } }) as TrpcContext;
const partner = (tplId = 10) => ({ req: new Request("http://localhost"), resHeaders: new Headers(), tplUser: { id: 10, tplId, role: "tpl_admin", status: "active" } }) as TrpcContext;
const anonymous = () => ({ req: new Request("http://localhost"), resHeaders: new Headers() }) as TrpcContext;
const shipmentApi = (ctx = staff()) => shipmentRouter.createCaller(ctx);
describe.skipIf(!url)("high-priority security on MySQL", () => {
  let db: Connection;
  const rows = async (query: string) => { const [result] = await db.query<RowDataPacket[]>(query); return result; };
  beforeAll(async () => {
    const target = new URL(url!);
    if (!["localhost", "127.0.0.1"].includes(target.hostname) || !target.pathname.endsWith("_test") || process.env.DATABASE_URL !== url) throw Error("Matching isolated localhost _test URLs required");
    db = await createConnection({ uri: url, dateStrings: true });
  });
  afterAll(async () => { if (db) { await db.query("DROP TRIGGER IF EXISTS fail_security_history"); await db.end(); } });
  beforeEach(async () => {
    await db.query("DROP TRIGGER IF EXISTS fail_security_history");
    for (const table of ["tracking_events", "activity_log", "shipments", "users", "tpl_users", "third_party_logistics", "branches"]) await db.query(`DELETE FROM ${table}`);
    const hash = await bcrypt.hash("OnlyForLocalTests123", 4);
    await db.query("INSERT INTO users(id,name,phone,password_hash,role,status,branch_id) VALUES(1,'Local super','08000000001',?,'super_admin','active',NULL),(2,'Local admin','08000000002',?,'admin','active',NULL),(3,'Pending','08000000003',?,'viewer','pending',NULL),(9,'Assigned driver','08000000009',?,'driver','active',NULL)", [hash, hash, hash, hash]);
    await db.query("INSERT INTO third_party_logistics(id,name,code,status) VALUES(10,'Local partner','LOCAL','active'),(11,'Other partner','OTHER','active')");
    await db.query("INSERT INTO tpl_users(id,tpl_id,name,phone,password_hash,status) VALUES(10,10,'Local partner staff','08000000010',?,'active')", [hash]);
    await db.query("INSERT INTO branches(id,name,code,status) VALUES(2,'Destination','DEST','active'),(3,'Hub','HUB','active'),(4,'Other branch','OTHER','active')");
    await db.query("INSERT INTO shipments(id,tracking_id,qr_code_token,created_by,origin_branch_id,dest_branch_id,status,actual_item_count,delivered_qty,remaining_qty,tpl_id,tpl_pickup_type,assigned_driver_id) VALUES(90001,'TEST-SECURITY','test-security-qr',1,4,2,'waiting_driver_pickup',50,0,50,10,'kedi_driver_drop',9)");
    await db.query("INSERT INTO tracking_events(shipment_id,event_type,old_status,new_status,notes) VALUES(90001,'created',NULL,'created','Private warehouse history'),(90001,'assigned_to_3pl','labeled','waiting_driver_pickup','Assigned')");
    send.mockClear();
  });
  it.each(["super_admin", "admin"] as const)("blocks admin granting %s through creation and approval", async role => {
    const api = userRouter.createCaller(staff("admin", 2));
    await expect(api.create({ name: "Unauthorised admin", phone: "08000000055", role })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(api.approveUser({ id: 3, role, branchId: null })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await rows("SELECT role,status FROM users WHERE id=3"))[0]).toMatchObject({ role: "viewer", status: "pending" });
  });
  it("allows normal operational approval and reserves privileged approval for Super Admin", async () => {
    await userRouter.createCaller(staff("admin", 2)).approveUser({ id: 3, role: "branch_manager", branchId: 2 });
    expect((await rows("SELECT role,status,branch_id FROM users WHERE id=3"))[0]).toMatchObject({ role: "branch_manager", status: "active", branch_id: 2 });
    await db.query("UPDATE users SET status='pending',role='viewer' WHERE id=3");
    await userRouter.createCaller(staff()).approveUser({ id: 3, role: "super_admin", branchId: null });
    expect((await rows("SELECT role FROM users WHERE id=3"))[0].role).toBe("super_admin");
    await expect(userRouter.createCaller(staff("admin", 2)).approveUser({ id: 3, role: "viewer", branchId: null })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(userRouter.createCaller(staff("admin", 2)).delete({ id: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(userRouter.createCaller(staff("admin", 2)).updateStatus({ id: 1, status: "suspended" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("revokes existing staff and 3PL sessions as soon as their accounts become inactive", async () => {
    const headers = new Headers({ authorization: `Bearer ${await createToken(9)}` });
    expect((await authenticateRequest(headers))?.id).toBe(9);
    await db.query("UPDATE users SET status='suspended' WHERE id=9");
    expect(await authenticateRequest(headers)).toBeUndefined();
    const tplHeaders = new Headers({ authorization: `Bearer ${await createTplToken(10)}` });
    expect((await authenticateTplRequest(tplHeaders))?.id).toBe(10);
    await db.query("UPDATE tpl_users SET status='inactive' WHERE id=10");
    expect(await authenticateTplRequest(tplHeaders)).toBeUndefined();
    await expect(tplRouter.createCaller(anonymous()).login({ phone: "08000000010", password: "OnlyForLocalTests123" })).rejects.toThrow("inactive");
  });
  it("prevents a 3PL identity resolving to a staff profile with the same numeric ID", async () => {
    await expect(authRouter.createCaller(partner()).me()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("requires an administrator to create a logistics company", async () => {
    const input = { name: "New company", code: "NEW" };
    await expect(tplRouter.createCaller(anonymous()).create(input)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(tplRouter.createCaller(staff("viewer")).create(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await tplRouter.createCaller(staff("admin", 2)).create(input);
    expect(await rows("SELECT * FROM third_party_logistics WHERE code='NEW'")).toHaveLength(1);
  });
  it.each(["viewer", "branch_manager", "driver", "warehouse_supply", "shipment_creator"])("blocks every 3PL mutation for unrelated KEDI role %s", async role => {
    const api = shipmentApi(staff(role));
    const calls = [() => api.tplPickupFromWarehouse({ shipmentId: 90001, receivedQty: 50 }), () => api.tplConfirmReceipt({ shipmentId: 90001, receivedQty: 50, condition: "good" }), () => api.tplReceiveRemainingItems({ shipmentId: 90001, additionalQty: 1 }), () => api.tplUpdateLocation({ shipmentId: 90001, location: "Test", updateType: "full_delivery" }), () => api.tplUpdateDeliveryDate({ shipmentId: 90001, estimatedDeliveryDate: "2026-11-20" })];
    for (const call of calls) await expect(call()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await rows("SELECT status FROM shipments WHERE id=90001"))[0].status).toBe("waiting_driver_pickup");
  });
  it("enforces identical shipment scope on details, history and QR/manual lookup", async () => {
    for (const ctx of [staff("driver", 8), staff("branch_manager", 5, 4), staff("branch_manager", 5, null), partner(11)]) {
      const api = shipmentApi(ctx);
      await expect(api.getById({ id: 90001 })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(api.getTrackingHistory({ shipmentId: 90001 })).rejects.toMatchObject({ code: "FORBIDDEN" });
      for (const token of ["TEST-SECURITY", "test-security-qr"]) await expect(api.qrValidate({ token })).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    for (const ctx of [staff("driver", 9), staff("branch_manager", 5, 2), partner()]) expect((await shipmentApi(ctx).qrValidate({ token: "TEST-SECURITY" }))?.id).toBe(90001);
    await db.query("UPDATE shipments SET hub_branch_id=3 WHERE id=90001");
    expect((await shipmentApi(staff("branch_manager", 5, 3)).getById({ id: 90001 }))?.id).toBe(90001);
    const detail = await shipmentApi(partner()).getById({ id: 90001 });
    expect(detail?.trackingEvents.some(e => e.eventType === "created")).toBe(false);
  });
  it("allows the assigned driver's normal pickup/drop-off and rejects another driver and duplicate pickup", async () => {
    await expect(shipmentApi(staff("driver", 8)).driverPickup({ shipmentId: 90001, qtyMatch: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const api = shipmentApi(staff("driver", 9));
    const concurrent = await Promise.allSettled([api.driverPickup({ shipmentId: 90001, qtyMatch: true }), api.driverPickup({ shipmentId: 90001, qtyMatch: true })]);
    expect(concurrent.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(await rows("SELECT * FROM tracking_events WHERE event_type='driver_pickup_confirmed'")).toHaveLength(1);
    await api.driverDropAt3pl({ shipmentId: 90001 });
    expect((await rows("SELECT status FROM shipments WHERE id=90001"))[0].status).toBe("at_3pl");
    await shipmentApi(partner()).tplConfirmReceipt({ shipmentId: 90001, receivedQty: 50, condition: "good" });
    await expect(shipmentApi(partner()).tplConfirmReceipt({ shipmentId: 90001, receivedQty: 50, condition: "good" })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
  it.each(["completed", "cancelled", "delivered", "onward_in_transit", "at_hub"])("prevents late actions reopening %s shipments", async status => {
    await db.query("UPDATE shipments SET status=? WHERE id=90001", [status]);
    const before = await rows("SELECT * FROM shipments WHERE id=90001");
    await expect(shipmentApi(staff("driver", 9)).driverPickup({ shipmentId: 90001, qtyMatch: true })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    await expect(shipmentApi(staff("driver", 9)).driverDropAt3pl({ shipmentId: 90001 })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    await expect(shipmentApi(staff("warehouse_supply")).warehouseProcess({ shipmentId: 90001, actualItemCount: 50, itemDetails: "Cartons", storageLocation: "Test", weightKg: 10 })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    await expect(shipmentApi(partner()).tplUpdateLocation({ shipmentId: 90001, location: "Test", updateType: "location_update" })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    await expect(shipmentApi(partner()).tplConfirmReceipt({ shipmentId: 90001, receivedQty: 50, condition: "good" })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(await rows("SELECT * FROM shipments WHERE id=90001")).toEqual(before);
  });
  it("keeps a partial shipment partial after a movement update and completes its final branch quantities", async () => {
    await db.query("UPDATE shipments SET status='partially_delivered',delivered_qty=38,remaining_qty=12 WHERE id=90001");
    await shipmentApi(partner()).tplUpdateLocation({ shipmentId: 90001, location: "Test", updateType: "sorting_update" });
    expect((await rows("SELECT status FROM shipments WHERE id=90001"))[0].status).toBe("partially_delivered");
    await shipmentApi(staff("branch_manager", 5, 2)).acknowledgeDelivery({ shipmentId: 90001, receivedQty: 50 });
    expect((await rows("SELECT status,delivered_qty,remaining_qty FROM shipments WHERE id=90001"))[0]).toMatchObject({ status: "completed", delivered_qty: 50, remaining_qty: 0 });
  });
  it("preserves warehouse labels on repeated processing and rolls state back if history fails", async () => {
    await db.query("UPDATE shipments SET status='created',tracking_id=NULL,qr_code_token=NULL WHERE id=90001");
    const input = { shipmentId: 90001, actualItemCount: 50, itemDetails: "Cartons", storageLocation: "Test", weightKg: 10 };
    const api = shipmentApi(staff("warehouse_supply"));
    await api.warehouseProcess(input);
    const labelled = await rows("SELECT tracking_id,qr_code_token FROM shipments WHERE id=90001");
    await expect(api.warehouseProcess(input)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(await rows("SELECT tracking_id,qr_code_token FROM shipments WHERE id=90001")).toEqual(labelled);
    await db.query("UPDATE shipments SET status='waiting_driver_pickup' WHERE id=90001");
    await db.query("CREATE TRIGGER fail_security_history BEFORE INSERT ON tracking_events FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Local history failure'");
    await expect(shipmentApi(staff("driver", 9)).driverPickup({ shipmentId: 90001, qtyMatch: true })).rejects.toThrow();
    expect((await rows("SELECT status FROM shipments WHERE id=90001"))[0].status).toBe("waiting_driver_pickup");
    expect(send).not.toHaveBeenCalled();
  });
  it("retains the direct pickup, remaining receipt and hub-delivery workflow", async () => {
    await db.query("UPDATE shipments SET status='waiting_3pl_pickup',tpl_pickup_type='tpl_pickup_direct',hub_branch_id=3 WHERE id=90001");
    const api = shipmentApi(partner());
    await api.tplPickupFromWarehouse({ shipmentId: 90001, receivedQty: 38 });
    await api.tplConfirmReceipt({ shipmentId: 90001, receivedQty: 38, condition: "partial" });
    await api.tplReceiveRemainingItems({ shipmentId: 90001, additionalQty: 12 });
    await api.tplUpdateLocation({ shipmentId: 90001, location: "Hub", updateType: "full_delivery" });
    expect((await rows("SELECT status,delivered_qty,remaining_qty,tpl_confirmed_qty FROM shipments WHERE id=90001"))[0]).toMatchObject({ status: "at_hub", delivered_qty: 50, remaining_qty: 0, tpl_confirmed_qty: 50 });
    await shipmentApi(staff("branch_manager", 5, 3)).acknowledgeAtHub({ shipmentId: 90001, receivedQty: 50 });
    await shipmentApi(staff("branch_manager", 5, 3)).dispatchOnward({ shipmentId: 90001, vehicle: "Local test transport", waybill: "TEST-ONLY", expectedDate: "2026-11-20" });
    await shipmentApi(staff("branch_manager", 6, 2)).acknowledgeDelivery({ shipmentId: 90001, receivedQty: 50 });
    expect((await rows("SELECT status,delivered_qty,remaining_qty FROM shipments WHERE id=90001"))[0]).toMatchObject({ status: "completed", delivered_qty: 50, remaining_qty: 0 });
  });
  it("retains normal assignment and the operations override, while rejecting impossible quantities", async () => {
    await db.query("UPDATE shipments SET status='labeled' WHERE id=90001");
    await shipmentApi(staff("logistics_officer")).assign3pl({ shipmentId: 90001, tplId: 10, tplPickupType: "kedi_driver_drop", assignedDriverId: 9 });
    await shipmentApi(staff("driver", 9)).driverPickup({ shipmentId: 90001, qtyMatch: true });
    await shipmentApi(staff("driver", 9)).driverDropAt3pl({ shipmentId: 90001 });
    await expect(shipmentApi(partner()).tplConfirmReceipt({ shipmentId: 90001, receivedQty: 51, condition: "good" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(shipmentApi(partner()).tplConfirmReceipt({ shipmentId: 90001, receivedQty: 1.5, condition: "good" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await shipmentApi(staff("logistics_officer")).tplConfirmReceipt({ shipmentId: 90001, receivedQty: 50, condition: "good" });
    await shipmentApi(staff("logistics_officer")).tplUpdateLocation({ shipmentId: 90001, location: "Destination", updateType: "full_delivery" });
    await expect(shipmentApi(staff("branch_manager", 5, 2)).acknowledgeDelivery({ shipmentId: 90001, receivedQty: 51 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await shipmentApi(staff("branch_manager", 5, 2)).acknowledgeDelivery({ shipmentId: 90001, receivedQty: 50 });
    expect((await rows("SELECT status FROM shipments WHERE id=90001"))[0].status).toBe("completed");
  });
  it("rolls back final acknowledgement when its history insert fails", async () => {
    await db.query("UPDATE shipments SET status='partially_delivered',delivered_qty=38,remaining_qty=12 WHERE id=90001");
    await db.query("CREATE TRIGGER fail_security_history BEFORE INSERT ON tracking_events FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Local history failure'");
    await expect(shipmentApi(staff("branch_manager", 5, 2)).acknowledgeDelivery({ shipmentId: 90001, receivedQty: 50 })).rejects.toThrow();
    expect((await rows("SELECT status,delivered_qty,remaining_qty FROM shipments WHERE id=90001"))[0]).toMatchObject({ status: "partially_delivered", delivered_qty: 38, remaining_qty: 12 });
  });
});
