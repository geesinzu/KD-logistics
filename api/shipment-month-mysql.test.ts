// Opt-in integration tests against a disposable local schema from db/schema.ts.
// Clears shipments in that schema. Never use production credentials.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createConnection } from "mysql2/promise";
import type { Connection } from "mysql2/promise";
import type { TrpcContext } from "./context";
import { shipmentRouter } from "./shipment-router";
import { shipmentFilter } from "@contracts/shipment-navigation";

const url = process.env.KEDI_SHIPMENT_TEST_URL;
describe.skipIf(!url)("monthly shipment lists on MySQL", () => {
  let db: Connection;
  function caller(role = "super_admin", branchId?: number) {
    return shipmentRouter.createCaller({ req: new Request("http://localhost"), resHeaders: new Headers(), user: { id: 1, role, branchId } } as TrpcContext);
  }
  beforeAll(async () => {
    const target = new URL(url!);
    if (!["127.0.0.1", "localhost"].includes(target.hostname) || !target.pathname.endsWith("_test") || process.env.DATABASE_URL !== url) throw Error("Use matching isolated localhost _test database URLs only");
    db = await createConnection(url!);
    await db.query("SET SESSION time_zone = '+00:00'");
    await db.query("DELETE FROM shipments");
    await db.query(`INSERT INTO shipments (id, tracking_id, created_by, dest_branch_id, hub_branch_id, assigned_driver_id, status, created_at, completed_at) VALUES
      (1,'OCT-OLD',1,2,NULL,1,'completed','2026-10-31 22:59:59','2026-11-05 10:00:00'),
      (2,'NOV-START',1,2,NULL,1,'created','2026-10-31 23:00:00',NULL),
      (3,'NOV-HUB',1,3,2,1,'at_hub','2026-11-03 10:00:00',NULL),
      (4,'NOV-DELIVERED',1,3,NULL,2,'delivered','2026-11-04 10:00:00',NULL),
      (5,'NOV-COMPLETED',1,2,NULL,1,'completed','2026-11-30 22:59:59','2026-12-05 10:00:00'),
      (6,'DEC-START',1,2,NULL,1,'created','2026-11-30 23:00:00',NULL),
      (7,'NOV-CANCELLED',1,2,NULL,1,'cancelled','2026-11-05 10:00:00',NULL),
      (8,'NOV-PARTIAL',1,2,NULL,1,'partially_delivered','2026-11-06 10:00:00',NULL)`);
  });
  afterAll(async () => { if (db) await db.end(); });
  const month = { year: 2026, month: 11 };
  it.each([["super_admin", undefined], ["branch_manager", 2], ["driver", undefined]] as const)("matches dashboard counts to all four links for %s", async (role, branch) => {
    const api = caller(role, branch);
    const stats = await api.stats(month);
    for (const [key, expected] of [["active", stats.active], ["created", stats.created], ["in_transit_with_3pl", stats.inTransit], ["delivered_or_completed", stats.delivered]] as const) {
      const list = await api.list({ ...month, page: 1, limit: 50, status: shipmentFilter(key).statuses.join(",") });
      expect(list.total).toBe(expected);
      expect(list.shipments).toHaveLength(expected);
    }
  });
  it("filters by creation month even when completion is in another month", async () => {
    const api = caller();
    const nov = await api.list({ ...month, status: "completed", page: 1, limit: 50 });
    expect(nov.shipments.map(s => s.trackingId)).toEqual(["NOV-COMPLETED"]);
    const all = await api.list({ status: "completed", page: 1, limit: 50 });
    expect(all.total).toBe(2);
    expect((await api.list({ ...month, page: 1, limit: 50 })).total).toBe(6);
  });
  it("uses identical month and role scope for pagination totals and search", async () => {
    const api = caller("branch_manager", 2);
    const first = await api.list({ ...month, page: 1, limit: 2 });
    const second = await api.list({ ...month, page: 2, limit: 2 });
    expect(first.total).toBe(5); expect(second.total).toBe(5);
    expect(first.shipments.some(a => second.shipments.some(b => a.id === b.id))).toBe(false);
    expect((await api.list({ ...month, search: "HUB", page: 1, limit: 50 })).shipments.map(s => s.id)).toEqual([3]);
    expect((await api.list({ ...month, search: "NOV-DELIVERED", page: 1, limit: 50 })).total).toBe(0);
  });
  it("does not expose the network to a branch manager without a branch", async () => {
    expect((await caller("branch_manager").list(month)).total).toBe(0);
    expect((await caller("branch_manager").stats(month)).total).toBe(0);
  });
  it("rejects partial or invalid month inputs", async () => {
    for (const input of [{ year: 2026 }, { month: 11 }, { year: 2026, month: 13 }]) {
      await expect(caller().list(input)).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(caller().stats(input)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
  });
  it("keeps separate 3PL accounts out of staff queries", async () => {
    const api = shipmentRouter.createCaller({ req: new Request("http://localhost"), resHeaders: new Headers(), tplUser: { id: 1, tplId: 1 } } as TrpcContext);
    await expect(api.list(month)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(api.stats(month)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
