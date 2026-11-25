import { describe, expect, it } from "vitest";
import { assertIncludable } from "./lib/department-packages";
import { createRouter, staffQuery, kediQuery, authedQuery } from "./middleware";
import { assertShipmentReadAccess } from "./lib/shipment-access";
import type { TrpcContext } from "./context";
const ctx = {
  user: { id: 2, role: "department_staff", status: "active", branchId: null },
} as TrpcContext;
describe("department boundaries", () => {
  it("allows identity access but denies generic KEDI and cross-identity APIs", async () => {
    const api = createRouter({
      identity: staffQuery.query(() => true),
      staff: kediQuery.query(() => true),
      general: authedQuery.query(() => true),
    }).createCaller(ctx);
    expect(await api.identity()).toBe(true);
    await expect(api.staff()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(api.general()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(() =>
      assertShipmentReadAccess(ctx, {
        destBranchId: 2,
        hubBranchId: null,
        tplId: null,
        assignedDriverId: null,
      })
    ).toThrow();
  });
  it("checks physical office receipt, destination, previous inclusion and cancellation", () => {
    const ready = {
      shipmentId: null,
      receivedOfficeAt: new Date(),
      receivedBranchAt: null,
    };
    expect(() => assertIncludable(ready, 2, 2, null)).not.toThrow();
    for (const [p, dest, cancel] of [
      [{ ...ready, receivedOfficeAt: null }, 2, null],
      [ready, 3, null],
      [{ ...ready, shipmentId: 8 }, 2, null],
      [ready, 2, new Date()],
      [{ ...ready, receivedBranchAt: new Date() }, 2, null],
    ] as const)
      expect(() => assertIncludable(p, 2, dest, cancel)).toThrow();
  });
});
