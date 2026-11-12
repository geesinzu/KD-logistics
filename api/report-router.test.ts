import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./context";
const { select } = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock("./queries/connection", () => ({ getDb: () => ({ select }) }));
import { reportRouter } from "./report-router";
import { shipments, branches, thirdPartyLogistics } from "@db/schema";
function caller(role?: string) {
  return reportRouter.createCaller({
    req: new Request("http://localhost"),
    resHeaders: new Headers(),
    ...(role ? { user: { id: 1, role } } : {}),
  } as TrpcContext);
}
beforeEach(() => {
  vi.resetAllMocks();
  select.mockReturnValue({
    from: (table: unknown) =>
      table === shipments
        ? { where: async () => [] }
        : table === branches
          ? [{ id: 8090001, name: "Makurdi" }]
          : table === thirdPartyLogistics
            ? [{ id: 2, name: "Partner" }]
            : { where: async () => [] },
  });
});
describe("read-only report access", () => {
  it.each(["branch_manager", "driver", "warehouse_supply", "shipment_creator"])(
    "blocks %s before reading rows",
    async role => {
      await expect(
        caller(role).brief({ from: "2026-11-01", to: "2026-11-11" })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(select).not.toHaveBeenCalled();
    }
  );
  it("requires authentication", async () => {
    await expect(
      caller().brief({ from: "2026-11-01", to: "2026-11-11" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it.each(["super_admin", "admin", "logistics_officer", "viewer"])(
    "supports existing report role %s",
    async role => {
      const r = await caller(role).brief({
        from: "2026-11-01",
        to: "2026-11-11",
      });
      expect(r.current).toEqual([]);
      expect(r.offices[0].name).toBe("Makurdi");
      expect(r.previousFrom).toBe("2026-10-21");
    }
  );
  it("rejects invalid range before database access", async () => {
    await expect(
      caller("admin").brief({ from: "2026-02-30", to: "2026-11-11" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(select).not.toHaveBeenCalled();
  });
});
