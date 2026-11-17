import { beforeEach, describe, expect, it, vi } from "vitest";
import { tplCorrectionBlockReason } from "@contracts/tpl-correction";
import type { TrpcContext } from "./context";
const { getDb, correct } = vi.hoisted(() => ({ getDb: vi.fn(), correct: vi.fn() }));
vi.mock("./queries/connection", () => ({ getDb }));
vi.mock("./lib/tpl-assignment", async original => ({ ...await original<object>(), correctTplAssignment: correct }));
import { shipmentRouter } from "./shipment-router";
const base = { tplId: 10030001, status: "at_3pl", tplConfirmedAt: null, tplConfirmedQty: null };
const input = { shipmentId: 70001, expectedTplId: 10030001, expectedStatus: "at_3pl", correctTplId: 10030002, reason: "Driver dropped at Knightpride; initial company was selected incorrectly." };
function caller(role = "super_admin", status = "active") { return shipmentRouter.createCaller({ req: new Request("http://localhost"), resHeaders: new Headers(), user: { id: 1, role, status } } as TrpcContext); }
beforeEach(() => { vi.clearAllMocks(); getDb.mockReturnValue({}); correct.mockResolvedValue({ success: true }); });
describe("correction eligibility", () => {
  it.each(["waiting_driver_pickup", "picked_up", "at_3pl", "waiting_3pl_pickup"])("preserves eligible driver stage %s", status => expect(tplCorrectionBlockReason({ ...base, status })).toBeNull());
  it.each(["created", "labeled", "picked_up_by_3pl", "tpl_confirmed", "in_transit_with_3pl", "partially_delivered", "at_hub", "onward_in_transit", "delivered", "completed", "cancelled"])("requires review at %s", status => expect(tplCorrectionBlockReason({ ...base, status })).not.toBeNull());
  it("does not treat invalid legacy timestamps as receipt evidence", () => {
    expect(tplCorrectionBlockReason({ ...base, tplConfirmedAt: new Date("invalid"), deliveredAt: "0000-00-00 00:00:00" })).toBeNull();
  });
  it.each([{ tplConfirmedQty: 0 }, { tplConfirmedAt: new Date() }, { deliveredAt: new Date() }, { completedAt: new Date() }, { hubArrivedAt: new Date() }, { onwardDispatchedAt: new Date() }, { deliveredQty: 1 }])("requires review for existing confirmation evidence %j", evidence => expect(tplCorrectionBlockReason({ ...base, ...evidence })).not.toBeNull());
});
describe("correction access", () => {
  it.each(["admin", "logistics_officer", "warehouse_supply", "branch_manager", "driver", "viewer"])("blocks %s before database access", async role => {
    await expect(caller(role).correct3plAssignment(input)).rejects.toMatchObject({ code: "FORBIDDEN" }); expect(getDb).not.toHaveBeenCalled();
  });
  it.each(["pending", "suspended"])("blocks a %s Super Admin", async status => {
    await expect(caller("super_admin", status).correct3plAssignment(input)).rejects.toMatchObject({ code: "FORBIDDEN" }); expect(getDb).not.toHaveBeenCalled();
  });
  it("requires authentication and excludes 3PL accounts", async () => {
    for (const identity of [{}, { tplUser: { id: 1, tplId: 10030001, status: "active" } }]) {
      const api = shipmentRouter.createCaller({ req: new Request("http://localhost"), resHeaders: new Headers(), ...identity } as TrpcContext);
      await expect(api.correct3plAssignment(input)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    }
    expect(getDb).not.toHaveBeenCalled();
  });
  it("requires a meaningful reason", async () => {
    await expect(caller().correct3plAssignment({ ...input, reason: "   " })).rejects.toMatchObject({ code: "BAD_REQUEST" }); expect(getDb).not.toHaveBeenCalled();
  });
  it("passes the reviewed assignment and actor to the atomic correction", async () => {
    await caller().correct3plAssignment(input); expect(correct).toHaveBeenCalledWith(expect.anything(), input, 1);
  });
});
