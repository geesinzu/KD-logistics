import { describe, expect, it, vi } from "vitest";
import { registerWithExpiryRecovery, withPushRegistrationLock } from "../src/lib/pushRegistration";
import { resolveKediRecipients } from "./lib/push-audiences";

describe("push expiry recovery", () => {
  it("keeps a healthy subscription", async () => {
    const old = { unsubscribe: vi.fn() };
    const renew = vi.fn();
    const result = await registerWithExpiryRecovery(old, async () => ({ ok: true, testDelivered: true }), renew);
    expect(result.testDelivered).toBe(true);
    expect(old.unsubscribe).not.toHaveBeenCalled(); expect(renew).not.toHaveBeenCalled();
  });
  it.each([404, 410])("renews a device rejected with %s exactly once", async failureCode => {
    const old = { unsubscribe: vi.fn().mockResolvedValue(true) };
    const fresh = { unsubscribe: vi.fn() };
    const register = vi.fn().mockResolvedValueOnce({ ok: true, testDelivered: false, failureCode }).mockResolvedValueOnce({ ok: true, testDelivered: true });
    const renew = vi.fn().mockResolvedValue(fresh);
    const result = await registerWithExpiryRecovery(old, register, renew);
    expect(old.unsubscribe).toHaveBeenCalledOnce(); expect(renew).toHaveBeenCalledOnce();
    expect(register).toHaveBeenNthCalledWith(2, fresh); expect(result.testDelivered).toBe(true);
  });
  it("reports disabled if even the replacement is expired", async () => {
    const old = { unsubscribe: vi.fn().mockResolvedValue(true) };
    const fresh = { unsubscribe: vi.fn().mockResolvedValue(true) };
    const register = vi.fn().mockResolvedValue({ ok: true, testDelivered: false, failureCode: 410 });
    const renew = vi.fn().mockResolvedValue(fresh);
    const result = await registerWithExpiryRecovery(old, register, renew);
    expect(result.ok).toBe(false); expect(fresh.unsubscribe).toHaveBeenCalledOnce();
    expect(register).toHaveBeenCalledTimes(2); expect(renew).toHaveBeenCalledOnce();
  });
  it.each([401, 403, 429, 500])("does not cycle subscriptions for provider error %s", async failureCode => {
    const old = { unsubscribe: vi.fn() }; const renew = vi.fn();
    const result = await registerWithExpiryRecovery(old, async () => ({ ok: true, testDelivered: false, failureCode }), renew);
    expect(result.failureCode).toBe(failureCode); expect(renew).not.toHaveBeenCalled(); expect(old.unsubscribe).not.toHaveBeenCalled();
  });
  it("does not renew if retiring the old device subscription fails", async () => {
    const renew = vi.fn();
    await expect(registerWithExpiryRecovery({ unsubscribe: async () => false }, async () => ({ ok: true, testDelivered: false, failureCode: 410 }), renew)).rejects.toThrow("Could not retire");
    expect(renew).not.toHaveBeenCalled();
  });
  it("surfaces browser renewal failure", async () => {
    await expect(registerWithExpiryRecovery({ unsubscribe: async () => true }, async () => ({ ok: true, testDelivered: false, failureCode: 410 }), async () => { throw new Error("Push service unavailable"); })).rejects.toThrow("Push service unavailable");
  });
  it("serializes background and profile operations and recovers after errors", async () => {
    const order: string[] = []; let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const first = withPushRegistrationLock(async () => { order.push("first"); await gate; throw new Error("offline"); });
    const second = withPushRegistrationLock(async () => { order.push("second"); return true; });
    const rejected = expect(first).rejects.toThrow("offline");
    await Promise.resolve(); await Promise.resolve(); expect(order).toEqual(["first"]);
    release(); await rejected; expect(await second).toBe(true); expect(order).toEqual(["first", "second"]);
  });
});

describe("new branch push audiences", () => {
  it("notifies an assigned manager without depending on branch names or seeded IDs", () => {
    // Recipient IDs come from active branch_manager users matching destBranchId.
    // The resolver has no branch-name list and needs no per-office setup.
    const recipients = resolveKediRecipients("created", { branch: [8090002], ops: [1], warehouse: [2], creator: [1] }, { title: "Incoming", body: "MAKURDI" });
    expect([...recipients.keys()]).toEqual([8090002, 2, 1]);
  });
});
