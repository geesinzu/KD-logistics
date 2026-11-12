import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./context";
const { connect, run, end } = vi.hoisted(() => ({ connect: vi.fn(), run: vi.fn(), end: vi.fn() }));
vi.mock("mysql2/promise", () => ({ createConnection: connect }));
vi.mock("./lib/historical-acknowledgements", () => ({ runHistoricalAcknowledgements: run }));
import { maintenanceRouter } from "./maintenance-router";
function caller(role = "super_admin", status = "active") {
  return maintenanceRouter.createCaller({ req: new Request("http://localhost"), resHeaders: new Headers(), user: { id: 1, role, status } } as TrpcContext);
}
const input = { digest: "a".repeat(64), confirmation: "ACKNOWLEDGE BEFORE NOVEMBER 2026" as const };
beforeEach(() => { vi.resetAllMocks(); connect.mockResolvedValue({ end }); run.mockResolvedValue({ completed: false }); });
describe("temporary historical acknowledgement access", () => {
  it.each(["admin", "branch_manager", "viewer", "logistics_officer", "warehouse_supply", "shipment_creator", "driver"])("blocks %s before connecting", async role => {
    await expect(caller(role).historicalAckPreview()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller(role).historicalAckApply(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(connect).not.toHaveBeenCalled();
  });
  it.each(["pending", "suspended"])("blocks a %s Super Admin", async status => {
    await expect(caller("super_admin", status).historicalAckPreview()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller("super_admin", status).historicalAckApply(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(connect).not.toHaveBeenCalled();
  });
  it("blocks anonymous and 3PL callers", async () => {
    for (const extra of [{}, { tplUser: { id: 1, role: "tpl_admin" } }]) {
      const api = maintenanceRouter.createCaller({ req: new Request("http://localhost"), resHeaders: new Headers(), ...extra } as TrpcContext);
      await expect(api.historicalAckPreview()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      await expect(api.historicalAckApply(input)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    }
    expect(connect).not.toHaveBeenCalled();
  });
  it("requires an exact confirmation and preview digest", async () => {
    await expect(caller().historicalAckApply({ ...input, confirmation: "yes" } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller().historicalAckApply({ ...input, digest: "" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(connect).not.toHaveBeenCalled();
  });
  it("uses one dedicated connection and closes it", async () => {
    await caller().historicalAckApply(input);
    expect(run).toHaveBeenCalledWith(expect.anything(), 1, input.digest);
    expect(connect).toHaveBeenCalledWith(expect.objectContaining({ dateStrings: true, multipleStatements: false }));
    expect(end).toHaveBeenCalledOnce();
  });
  it("redacts database failures and closes the connection", async () => {
    run.mockRejectedValue(new Error("mysql://secret"));
    await expect(caller().historicalAckPreview()).rejects.toMatchObject({ message: "Could not confirm the correction result. Refresh the preview before trying again." });
    expect(end).toHaveBeenCalledOnce();
  });
});
