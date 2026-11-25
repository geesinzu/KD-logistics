import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { createConnection } from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";
import { departmentRouter } from "./department-router";
import { shipmentRouter } from "./shipment-router";
import { pushRouter } from "./push-router";
import { userRouter } from "./user-router";
import type { TrpcContext } from "./context";
vi.mock("./lib/push", async importOriginal => ({
  ...(await importOriginal<object>()),
  notifyShipmentCreated: vi.fn(async () => {}),
  notifyShipmentCancelled: vi.fn(async () => {}),
}));
const url = process.env.KEDI_DEPARTMENT_TEST_URL;
const context = (
  role = "super_admin",
  id = 1,
  branchId: number | null = null
) =>
  ({
    req: new Request("http://localhost"),
    resHeaders: new Headers(),
    user: { id, role, status: "active", branchId, name: "Test actor" },
  }) as TrpcContext;
const api = (role = "super_admin", id = 1, branchId: number | null = null) =>
  departmentRouter.createCaller(context(role, id, branchId));
describe.skipIf(!url)("department package workflow on isolated MySQL", () => {
  let db: Connection;
  const rows = async (query: string) =>
    (await db.query<RowDataPacket[]>(query))[0];
  beforeAll(async () => {
    const u = new URL(url!);
    if (
      !["127.0.0.1", "localhost"].includes(u.hostname) ||
      !u.pathname.endsWith("_test") ||
      process.env.DATABASE_URL !== url
    )
      throw Error("Matching isolated localhost _test URLs required");
    db = await createConnection(url!);
    // Ensure the explicit activation upgrades an old installation, not just db:push.
    for (const t of [
      "department_package_events",
      "department_packages",
      "department_requests",
      "department_staff",
      "departments",
    ])
      await db.query(`DROP TABLE IF EXISTS ${t}`);
    await db.query("DELETE FROM users");
    await db.query(
      "ALTER TABLE users MODIFY role ENUM('super_admin','admin','shipment_creator','branch_manager','logistics_officer','driver','warehouse_supply','viewer') NOT NULL DEFAULT 'viewer'"
    );
    expect((await api().status()).ready).toBe(false);
    await api().enable();
    await api().enable();
    expect((await api().status()).ready).toBe(true);
  });
  afterAll(async () => {
    await db?.query("DROP TRIGGER IF EXISTS fail_department_event");
    await db?.end();
  });
  beforeEach(async () => {
    await db.query("DROP TRIGGER IF EXISTS fail_department_event");
    for (const t of [
      "department_package_events",
      "department_packages",
      "department_requests",
      "department_staff",
      "departments",
      "tracking_events",
      "shipments",
      "users",
      "branches",
    ])
      await db.query(`DELETE FROM ${t}`);
    await db.query(
      "INSERT INTO branches(id,name,code,status) VALUES(2,'Makurdi','MKD','active'),(3,'Enugu','ENU','active'),(19,'Lagos HQ','LHQ','active')"
    );
    await db.query(
      "INSERT INTO users(id,name,phone,password_hash,role,status,branch_id) VALUES(1,'Super','08000000001','unused','super_admin','active',NULL),(2,'HR','08000000002','unused','department_staff','active',NULL),(3,'Finance','08000000003','unused','department_staff','active',NULL),(4,'Logistics','08000000004','unused','logistics_officer','active',NULL),(5,'Creator','08000000005','unused','shipment_creator','active',NULL),(6,'Warehouse','08000000006','unused','warehouse_supply','active',NULL),(7,'Makurdi','08000000007','unused','branch_manager','active',2),(8,'Enugu','08000000008','unused','branch_manager','active',3),(9,'Admin','08000000009','unused','admin','active',NULL),(10,'Unassigned','08000000010','unused','viewer','pending',NULL)"
    );
    await db.query(
      "INSERT INTO departments(id,name) VALUES(1,'HR'),(2,'Finance')"
    );
    await db.query(
      "INSERT INTO department_staff(user_id,department_id) VALUES(2,1),(3,2)"
    );
  });
  const request = async (count = 2, branch = 2) => {
    const { requestId } = await api("department_staff", 2).create({
      destBranchId: branch,
      description: "Confidential HR envelope",
      packageCount: count,
    });
    return api("department_staff", 2).detail({ requestId });
  };
  const include = async (ids: number[], branch = 2) =>
    shipmentRouter
      .createCaller(context("shipment_creator", 5))
      .create({ destBranchId: branch, departmentPackageIds: ids });
  it("denies other departments, unrelated branches, 3PL and generic APIs", async () => {
    const r = await request();
    expect(await api("department_staff", 3).list()).toHaveLength(0);
    await expect(
      api("department_staff", 3).detail({ requestId: r.id })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      api("branch_manager", 8, 3).detail({ requestId: r.id })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      departmentRouter
        .createCaller({ tplUser: { id: 1, status: "active" } } as TrpcContext)
        .list()
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      userRouter.createCaller(context("department_staff", 2)).list()
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      shipmentRouter.createCaller(context("department_staff", 2)).list()
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(
      await api("department_staff", 2).detail({ requestId: r.id })
    ).not.toHaveProperty("shipments");
  });
  it("lets department staff remove only their own device subscriptions", async () => {
    await db.query("DELETE FROM push_subscriptions");
    await db.query(
      "INSERT INTO push_subscriptions(user_id,endpoint,p256dh,auth_key) VALUES(2,'https://local.test/own','test','test'),(3,'https://local.test/other','test','test')"
    );
    const push = pushRouter.createCaller(context("department_staff", 2));
    await push.unsubscribe({ endpoint: "https://local.test/other" });
    expect(
      await rows("SELECT id FROM push_subscriptions WHERE user_id=3")
    ).toHaveLength(1);
    await push.unsubscribe({ endpoint: "https://local.test/own" });
    expect(
      await rows("SELECT id FROM push_subscriptions WHERE user_id=2")
    ).toHaveLength(0);
  });
  it("allows operations to cancel a wrong-destination request after office receipt without erasing the handover", async () => {
    const r = await request(1);
    await api("logistics_officer", 4).receiveOffice({
      packageId: r.packages[0].id,
    });
    await expect(
      api("department_staff", 2).cancel({ requestId: r.id })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await api("logistics_officer", 4).cancel({
      requestId: r.id,
      reason: "Returned to HR to correct destination",
    });
    const detail = await api("department_staff", 2).detail({ requestId: r.id });
    expect(detail.cancelledAt).not.toBeNull();
    expect(detail.packages[0].receivedOfficeAt).not.toBeNull();
    expect(
      detail.history.some(
        e => e.action === "cancelled" && e.note?.includes("Returned to HR")
      )
    ).toBe(true);
    await expect(include([r.packages[0].id])).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
  it("changes department scope immediately when Super Admin reassigns the account", async () => {
    const r = await request(1);
    await api().assignStaff({ userId: 2, departmentId: 2 });
    await expect(
      api("department_staff", 2).detail({ requestId: r.id })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await api("department_staff", 2).list()).toHaveLength(0);
  });
  it("includes branch packages during bulk creation and rolls back the entire batch on an unavailable selection", async () => {
    const r = await request(1),
      id = r.packages[0].id;
    const creator = shipmentRouter.createCaller(context("shipment_creator", 5));
    await expect(
      creator.createBulk({
        branches: [
          { destBranchId: 3 },
          { destBranchId: 2, departmentPackageIds: [id] },
        ],
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await rows("SELECT id FROM shipments")).toHaveLength(0);
    await api("logistics_officer", 4).receiveOffice({ packageId: id });
    const batch = await creator.createBulk({
      branches: [
        { destBranchId: 3 },
        { destBranchId: 2, departmentPackageIds: [id] },
      ],
    });
    expect(batch.shipmentIds).toHaveLength(2);
    expect(
      (
        await rows(`SELECT shipment_id FROM department_packages WHERE id=${id}`)
      )[0].shipment_id
    ).toBe(batch.shipmentIds[1]);
  });
  it("uses unique QR tokens per package and returns the same ones on reprint", async () => {
    const r = await request();
    expect(new Set(r.packages.map(p => p.token)).size).toBe(2);
    expect(
      (
        await api("department_staff", 2).detail({ requestId: r.id })
      ).packages.map(p => p.token)
    ).toEqual(r.packages.map(p => p.token));
    expect(
      await api("warehouse_supply", 6).scan({
        code: "KEDI-PKG:" + r.packages[0].token,
      })
    ).toEqual({ requestId: r.id, packageId: r.packages[0].id });
    expect(
      await api("warehouse_supply", 6).scan({ code: `DP-${r.id}/1` })
    ).toEqual({ requestId: r.id, packageId: r.packages[0].id });
    await expect(
      api("branch_manager", 8, 3).scan({
        code: "KEDI-PKG:" + r.packages[0].token,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it.each([
    ["logistics_officer", 4],
    ["admin", 9],
    ["super_admin", 1],
    ["warehouse_supply", 6],
  ] as const)(
    "allows %s optional scanning and office receipt, without warehouse marking",
    async (role, id) => {
      const r = await request(1);
      await api(role, id).receiveOffice({ packageId: r.packages[0].id });
      const result = await include([r.packages[0].id]);
      expect(result.shipmentId).toBeGreaterThan(0);
    }
  );
  it("requires office receipt and rejects wrong branch or duplicate package selections atomically", async () => {
    const r = await request(1),
      id = r.packages[0].id;
    await expect(include([id])).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await rows("SELECT id FROM shipments")).toHaveLength(0);
    await api("logistics_officer", 4).receiveOffice({ packageId: id });
    await expect(include([id], 3)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(include([id, id])).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await rows("SELECT id FROM shipments")).toHaveLength(0);
  });
  it("prevents two creators claiming the same package, with one shipment committed", async () => {
    const r = await request(1),
      id = r.packages[0].id;
    await api("logistics_officer", 4).receiveOffice({ packageId: id });
    const result = await Promise.allSettled([include([id]), include([id])]);
    expect(result.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(await rows("SELECT id FROM shipments")).toHaveLength(1);
    expect(
      await rows(
        `SELECT action FROM department_package_events WHERE package_id=${id} AND action='included'`
      )
    ).toHaveLength(1);
  });
  it("keeps office scans idempotent and supports partial branch acknowledgement without changing stock", async () => {
    const r = await request(),
      ids = r.packages.map(p => p.id);
    await Promise.all([
      api("logistics_officer", 4).receiveOffice({ packageId: ids[0] }),
      api("admin", 9).receiveOffice({ packageId: ids[0] }),
    ]);
    await api("logistics_officer", 4).receiveOffice({ packageId: ids[1] });
    expect(
      await rows(
        `SELECT id FROM department_package_events WHERE package_id=${ids[0]} AND action='received_office'`
      )
    ).toHaveLength(1);
    const s = await include(ids);
    await expect(
      api("branch_manager", 8, 3).acknowledge({ packageId: ids[0] })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await api("branch_manager", 7, 2).acknowledge({ packageId: ids[0] });
    await api("branch_manager", 7, 2).acknowledge({ packageId: ids[0] });
    const after = await api("department_staff", 2).detail({ requestId: r.id });
    expect(after.packages.filter(p => p.receivedBranchAt)).toHaveLength(1);
    expect(
      (
        await rows(
          `SELECT delivered_qty,actual_item_count,status FROM shipments WHERE id=${s.shipmentId}`
        )
      )[0]
    ).toMatchObject({
      delivered_qty: null,
      actual_item_count: null,
      status: "created",
    });
    expect(
      await rows(
        `SELECT id FROM department_package_events WHERE package_id=${ids[0]} AND action='received_branch'`
      )
    ).toHaveLength(1);
  });
  it("releases unreceived packages on cancellation, but blocks cancellation after branch receipt", async () => {
    const r = await request(1),
      id = r.packages[0].id;
    await api("logistics_officer", 4).receiveOffice({ packageId: id });
    const s = await include([id]);
    await shipmentRouter
      .createCaller(context())
      .cancel({ shipmentId: s.shipmentId, reason: "Test cancellation" });
    expect(
      (await api("department_staff", 2).detail({ requestId: r.id })).packages[0]
        .shipmentId
    ).toBe(null);
    const next = await include([id]);
    await api("branch_manager", 7, 2).acknowledge({ packageId: id });
    await expect(
      shipmentRouter
        .createCaller(context())
        .cancel({ shipmentId: next.shipmentId, reason: "Unsafe cancellation" })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("rolls back shipment and inclusion when the audit insert fails", async () => {
    const r = await request(1),
      id = r.packages[0].id;
    await api("logistics_officer", 4).receiveOffice({ packageId: id });
    await db.query(
      "CREATE TRIGGER fail_department_event BEFORE INSERT ON department_package_events FOR EACH ROW BEGIN IF NEW.action='included' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='test failure'; END IF; END"
    );
    await expect(include([id])).rejects.toThrow();
    expect(await rows("SELECT id FROM shipments")).toHaveLength(0);
    expect(
      (
        await rows(`SELECT shipment_id FROM department_packages WHERE id=${id}`)
      )[0].shipment_id
    ).toBe(null);
  });
  it("reserves department assignment and creation for Super Admin and keeps pending accounts pending", async () => {
    await expect(
      api("admin", 9).assignStaff({ userId: 10, departmentId: 1 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await api().assignStaff({ userId: 10, departmentId: 1 });
    expect(
      (await rows("SELECT role,status,branch_id FROM users WHERE id=10"))[0]
    ).toMatchObject({
      role: "department_staff",
      status: "pending",
      branch_id: null,
    });
    await expect(
      api().assignStaff({ userId: 9, departmentId: 1 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await api().createStaff({
      departmentId: 1,
      name: "New HR member",
      phone: "08000000011",
      password: "PrivateLocalTest123",
    });
    expect(
      (await rows("SELECT role FROM users WHERE phone='08000000011'"))[0].role
    ).toBe("department_staff");
  });
  it("lets the creator undo inclusion before dispatch and prevents removal afterwards", async () => {
    const r = await request(1),
      id = r.packages[0].id;
    await api("logistics_officer", 4).receiveOffice({ packageId: id });
    const s = await include([id]);
    await api("shipment_creator", 5).removeFromShipment({
      packageId: id,
      shipmentId: s.shipmentId,
    });
    const next = await include([id]);
    await db.query(
      `UPDATE shipments SET status='picked_up' WHERE id=${next.shipmentId}`
    );
    await expect(
      api("shipment_creator", 5).removeFromShipment({
        packageId: id,
        shipmentId: next.shipmentId,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
