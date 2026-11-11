import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./context";
const { select, insert, values, results, update, set, where } = vi.hoisted(() => ({
  update: vi.fn(), set: vi.fn(), where: vi.fn(), select: vi.fn(), insert: vi.fn(), values: vi.fn(), results: [] as unknown[][],
}));
vi.mock("./queries/connection", () => ({ getDb: () => ({ select, insert, update }) }));
import { branchRouter } from "./branch-router";
import { branchTrackingCode } from "./lib/branch-tracking";

function caller(role = "admin") {
  return branchRouter.createCaller({ req: new Request("http://localhost"), resHeaders: new Headers(), user: { id: 1, role } } as TrpcContext);
}
beforeEach(() => {
  vi.resetAllMocks(); results.length = 0;
  select.mockImplementation(() => ({ from: () => ({ where: () => ({ limit: async () => results.shift() ?? [] }) }) }));
  update.mockReturnValue({ set }); set.mockReturnValue({ where }); where.mockResolvedValue({});
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

describe("super admin branch editing", () => {
  const details = { id: 20, name: "Calabar", code: "CAL", city: "Calabar", address: "New office", hubBranchId: null };
  const current = { id: 20, name: "Calabar", code: "CAL", hubBranchId: null };
  it.each(["admin", "branch_manager", "viewer"])("blocks editing by %s", async role => {
    await expect(caller(role).update(details)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(update).not.toHaveBeenCalled();
  });
  it("updates office details and clears a previous hub", async () => {
    results.push([{ ...current, hubBranchId: 7 }], []);
    await caller("super_admin").update(details);
    const expected = { name: details.name, code: details.code, city: details.city, address: details.address, hubBranchId: null };
    expect(set).toHaveBeenCalledWith(expected);
    expect(where).toHaveBeenCalledOnce();
  });
  it("sets a valid hub for future shipments", async () => {
    results.push([current], [], [{ id: 7, status: "active", hubBranchId: null }], []);
    await caller("super_admin").update({ ...details, hubBranchId: 7 });
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ hubBranchId: 7 }));
  });
  it("rejects missing offices", async () => {
    await expect(caller("super_admin").update(details)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("rejects duplicate names or codes on another office", async () => {
    results.push([current], [{ id: 3 }]);
    await expect(caller("super_admin").update(details)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(update).not.toHaveBeenCalled();
  });
  it("rejects self routing", async () => {
    results.push([current], []);
    await expect(caller("super_admin").update({ ...details, hubBranchId: 20 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it.each([{ hub: [] }, { hub: [{ status: "inactive" }] }, { hub: [{ status: "active", hubBranchId: 9 }] }])("rejects invalid target hubs (%j)", async ({ hub }) => {
    results.push([current], [], hub);
    await expect(caller("super_admin").update({ ...details, hubBranchId: 7 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("prevents creating a nested hub by rerouting an office with dependents", async () => {
    results.push([current], [], [{ id: 7, status: "active", hubBranchId: null }], [{ id: 21 }]);
    await expect(caller("super_admin").update({ ...details, hubBranchId: 7 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(update).not.toHaveBeenCalled();
  });
  it("protects HQ identity", async () => {
    results.push([{ id: 19, name: "Lagos HQ", code: "LHQ" }]);
    await expect(caller("super_admin").update({ ...details, id: 19 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("handles a concurrent duplicate code", async () => {
    results.push([current], []); where.mockRejectedValue({ cause: { code: "ER_DUP_ENTRY" } });
    await expect(caller("super_admin").update(details)).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
