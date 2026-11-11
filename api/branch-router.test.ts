import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./context";
const { select, insert, values, results } = vi.hoisted(() => ({
  select: vi.fn(), insert: vi.fn(), values: vi.fn(), results: [] as unknown[][],
}));
vi.mock("./queries/connection", () => ({ getDb: () => ({ select, insert }) }));
import { branchRouter } from "./branch-router";
import { branchTrackingCode } from "./lib/branch-tracking";

function caller(role = "admin") {
  return branchRouter.createCaller({ req: new Request("http://localhost"), resHeaders: new Headers(), user: { id: 1, role } } as TrpcContext);
}
beforeEach(() => {
  vi.resetAllMocks(); results.length = 0;
  select.mockImplementation(() => ({ from: () => ({ where: () => ({ limit: async () => results.shift() ?? [] }) }) }));
  insert.mockReturnValue({ values }); values.mockResolvedValue({});
});
describe("branch offices", () => {
  it("restricts creation to admins", async () => {
    await expect(caller("branch_manager").create({ name: "Calabar", code: "CAL" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(insert).not.toHaveBeenCalled();
  });
  it("creates an office with normalized code and chosen hub", async () => {
    results.push([], [{ id: 7, status: "active", hubBranchId: null }]);
    await caller().create({ name: " Calabar ", code: "cal", hubBranchId: 7 });
    expect(values).toHaveBeenCalledWith({ name: "Calabar", code: "CAL", hubBranchId: 7 });
  });
  it("rejects duplicate names or codes", async () => {
    results.push([{ id: 1 }]);
    await expect(caller().create({ name: "Calabar", code: "CAL" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(insert).not.toHaveBeenCalled();
  });
  it.each([{ hub: [] }, { hub: [{ status: "inactive" }] }, { hub: [{ status: "active", hubBranchId: 9 }] }])("rejects unavailable or nested hubs (%j)", async ({ hub }) => {
    results.push([], hub);
    await expect(caller().create({ name: "Calabar", code: "CAL", hubBranchId: 7 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(insert).not.toHaveBeenCalled();
  });
  it("handles a concurrent duplicate-code insert", async () => {
    values.mockRejectedValue({ cause: { code: "ER_DUP_ENTRY" } });
    await expect(caller().create({ name: "Calabar", code: "CAL" })).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("rejects codes that cannot fit tracking IDs", async () => {
    await expect(caller().create({ name: "Calabar", code: "TOO-LONG" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("preserves legacy tracking prefixes and uses new database codes", () => {
    expect(branchTrackingCode("PHC")).toBe("PH");
    expect(branchTrackingCode("ABJ")).toBe("AB");
    expect(branchTrackingCode("CAL")).toBe("CAL");
  });
});
