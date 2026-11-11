import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./context";
const { select, update, set, where, results } = vi.hoisted(() => ({
  select: vi.fn(), update: vi.fn(), set: vi.fn(), where: vi.fn(), results: [] as unknown[][],
}));
vi.mock("./queries/connection", () => ({ getDb: () => ({ select, update }) }));
import { userRouter } from "./user-router";
function caller(role = "super_admin") {
  return userRouter.createCaller({ req: new Request("http://localhost"), resHeaders: new Headers(), user: { id: 1, role } } as TrpcContext);
}
const details = { id: 2, name: "Branch Staff", phone: "08012345678", email: "", branchId: 8 };
beforeEach(() => {
  vi.resetAllMocks(); results.length = 0;
  select.mockImplementation(() => ({ from: () => ({ where: () => ({ limit: async () => results.shift() ?? [] }) }) }));
  update.mockReturnValue({ set }); set.mockReturnValue({ where }); where.mockResolvedValue({});
});
describe("staff transfers", () => {
  it.each(["admin", "branch_manager", "viewer"])("blocks edits and branch transfers by %s", async role => {
    await expect(caller(role).updateStaff(details)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller(role).updateBranch({ id: 2, branchId: 8 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(update).not.toHaveBeenCalled();
  });
  it("transfers a manager and updates contact details without changing their role or status", async () => {
    results.push([{ id: 2, role: "branch_manager", branchId: 7 }], [{ id: 8, status: "active" }], []);
    await caller().updateStaff(details);
    expect(set).toHaveBeenCalledWith({ name: details.name, phone: details.phone, email: null, branchId: 8 });
    expect(where).toHaveBeenCalledOnce();
  });
  it("supports the existing branch-only endpoint with validation", async () => {
    results.push([{ id: 2, role: "branch_manager" }], [{ id: 8, status: "active" }]);
    await caller().updateBranch({ id: 2, branchId: 8 });
    expect(set).toHaveBeenCalledWith({ branchId: 8 });
  });
  it("allows non-managers to have no branch", async () => {
    results.push([{ id: 2, role: "driver" }], []);
    await caller().updateStaff({ ...details, branchId: null });
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ branchId: null }));
  });
  it("requires a branch for managers", async () => {
    results.push([{ id: 2, role: "branch_manager" }]);
    await expect(caller().updateStaff({ ...details, branchId: null })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(update).not.toHaveBeenCalled();
  });
  it.each([{ branch: [] }, { branch: [{ status: "inactive" }] }])("rejects unavailable offices (%j)", async ({ branch }) => {
    results.push([{ id: 2, role: "branch_manager" }], branch);
    await expect(caller().updateStaff(details)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(update).not.toHaveBeenCalled();
  });
  it("rejects missing staff", async () => {
    await expect(caller().updateStaff(details)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("rejects another staff member's phone", async () => {
    results.push([{ id: 2, role: "driver" }], [{ status: "active" }], [{ id: 3 }]);
    await expect(caller().updateStaff(details)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(update).not.toHaveBeenCalled();
  });
  it("handles concurrent duplicate phone writes", async () => {
    results.push([{ id: 2, role: "driver" }], [{ status: "active" }], []);
    where.mockRejectedValue({ cause: { code: "ER_DUP_ENTRY" } });
    await expect(caller().updateStaff(details)).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("rejects malformed contact details", async () => {
    await expect(caller().updateStaff({ ...details, phone: "123" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller().updateStaff({ ...details, email: "invalid" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(update).not.toHaveBeenCalled();
  });
});
