import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "../context";
import type { Shipment } from "@db/schema";

type Scope = Pick<Shipment, "tplId" | "assignedDriverId" | "destBranchId" | "hubBranchId">;
export function assertShipmentReadAccess(ctx: Pick<TrpcContext, "user" | "tplUser">, s: Scope) {
  if (ctx.tplUser) {
    if (ctx.tplUser.tplId !== s.tplId) throw new TRPCError({ code: "FORBIDDEN", message: "This shipment is not assigned to your 3PL company." });
    return;
  }
  const user = ctx.user;
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED" });
  if (user.role === "driver" && s.assignedDriverId !== user.id) throw new TRPCError({ code: "FORBIDDEN", message: "This shipment is not assigned to you." });
  if (user.role === "branch_manager" && (!user.branchId || (s.destBranchId !== user.branchId && s.hubBranchId !== user.branchId))) throw new TRPCError({ code: "FORBIDDEN", message: "This shipment is not routed to your branch." });
}
export function assertTplWriteAccess(ctx: Pick<TrpcContext, "user" | "tplUser">) {
  if (ctx.tplUser) return;
  if (!ctx.user || !["super_admin", "admin", "logistics_officer"].includes(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN", message: "Only the assigned 3PL or KEDI operations team can make this update." });
}
export function assertStage(status: string, allowed: readonly string[]) {
  if (!allowed.includes(status)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This action is not available at the shipment's current stage. Refresh its details." });
}
export const TPL_ACTIVE_STAGES = ["at_3pl", "picked_up_by_3pl", "tpl_confirmed", "in_transit_with_3pl", "partially_delivered"] as const;
export function tplVisibleHistory<T extends { eventType: string }>(events: T[], hubBranchId: number | null): T[] {
  const lastAssign = events.map(e => e.eventType).lastIndexOf("assigned_to_3pl");
  const visible = lastAssign >= 0 ? events.slice(lastAssign) : [];
  const end = hubBranchId ? visible.findIndex(e => e.eventType === "tpl_full_delivery" || e.eventType === "branch_marked_delivered") : -1;
  return end >= 0 ? visible.slice(0, end + 1) : visible;
}
