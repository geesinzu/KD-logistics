import { describe, expect, it } from "vitest";
import { jwtKey } from "./lib/jwt-key";
import { assertStaffAuthority } from "./lib/staff-permissions";
import { assertShipmentReadAccess, assertTplWriteAccess, assertStage, tplVisibleHistory } from "./lib/shipment-access";
import type { TrpcContext } from "./context";
import { createRouter, authedQuery, kediQuery, tplQuery, adminQuery } from "./middleware";
const identity = (role: string, status = "active", branchId: number | null = 2) => ({ user: { id: 9, role, status, branchId } }) as TrpcContext;
const router = createRouter({ general: authedQuery.query(() => true), staff: kediQuery.query(() => true), partner: tplQuery.query(() => true), admin: adminQuery.query(() => true) });
const shipment = { tplId: 10, assignedDriverId: 9, destBranchId: 2, hubBranchId: 3 };
describe("security policies", () => {
  it.each([undefined, "", "short", "kedi-logistics-secret-key-2026"])("refuses unsafe production signing key %j", secret => expect(() => jwtKey(secret, true)).toThrow("JWT_SECRET"));
  it("uses a configured key and generates a private development key instead of a known fallback", () => {
    const configured = "test-secret-with-more-than-thirty-two-bytes";
    expect(new TextDecoder().decode(jwtKey(configured, true))).toBe(configured);
    expect(jwtKey(undefined, false)).toHaveLength(32);
    expect(jwtKey(undefined, false)).not.toEqual(jwtKey(undefined, false));
  });
  it.each(["admin", "super_admin"] as const)("prevents an admin granting %s via account creation or approval", role => expect(() => assertStaffAuthority("admin", role)).toThrow());
  it("protects existing administrator accounts as well as requested roles", () => {
    expect(() => assertStaffAuthority("admin", "viewer", "super_admin")).toThrow();
    expect(() => assertStaffAuthority("admin", undefined, "admin")).toThrow();
    expect(() => assertStaffAuthority("admin", "branch_manager", "viewer")).not.toThrow();
    expect(() => assertStaffAuthority("super_admin", "super_admin", "admin")).not.toThrow();
  });
  it.each(["viewer", "branch_manager", "driver", "warehouse_supply", "shipment_creator"])("prevents %s using 3PL mutation helpers", role => expect(() => assertTplWriteAccess(identity(role))).toThrow());
  it.each(["super_admin", "admin", "logistics_officer"])("keeps explicit operations override for %s", role => expect(() => assertTplWriteAccess(identity(role))).not.toThrow());
  it("scopes branch staff, drivers and 3PLs while retaining hub access", () => {
    expect(() => assertShipmentReadAccess(identity("driver"), shipment)).not.toThrow();
    expect(() => assertShipmentReadAccess(identity("driver"), { ...shipment, assignedDriverId: 8 })).toThrow();
    expect(() => assertShipmentReadAccess(identity("branch_manager", "active", 3), shipment)).not.toThrow();
    expect(() => assertShipmentReadAccess(identity("branch_manager", "active", null), shipment)).toThrow();
    expect(() => assertShipmentReadAccess(identity("branch_manager", "active", 4), shipment)).toThrow();
    const ctx = { tplUser: { tplId: 11 } } as TrpcContext;
    expect(() => assertShipmentReadAccess(ctx, shipment)).toThrow();
    expect(() => assertShipmentReadAccess({ tplUser: { tplId: 10 } } as TrpcContext, shipment)).not.toThrow();
  });
  it("trims 3PL history before assignment and after hub delivery", () => {
    const events = ["created", "assigned_to_3pl", "driver_dropoff_at_3pl", "tpl_full_delivery", "hub_acknowledged", "onward_dispatched"].map(eventType => ({ eventType }));
    expect(tplVisibleHistory(events, 3).map(e => e.eventType)).toEqual(["assigned_to_3pl", "driver_dropoff_at_3pl", "tpl_full_delivery"]);
    expect(tplVisibleHistory([{ eventType: "created" }], null)).toEqual([]);
  });
  it.each(["completed", "cancelled", "delivered", "onward_in_transit"])("rejects a late pickup on %s", status => expect(() => assertStage(status, ["waiting_driver_pickup"])).toThrow());
  it.each(["pending", "suspended"])("rejects existing %s staff sessions across middleware", async status => {
    const api = router.createCaller(identity("admin", status));
    await expect(api.general()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(api.staff()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(api.admin()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("rejects existing inactive 3PL sessions", async () => {
    const api = router.createCaller({ tplUser: { id: 1, status: "inactive" } } as TrpcContext);
    await expect(api.general()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(api.partner()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
