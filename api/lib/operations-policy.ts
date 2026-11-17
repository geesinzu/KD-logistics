import { TRPCError } from "@trpc/server";
import type { User } from "@db/schema";
import type { TransferActionInput } from "@contracts/operations";
export const approver = (user: Pick<User, "role">) =>
  ["super_admin", "admin", "logistics_officer"].includes(user.role);
export type TransferScope = {
  sourceBranchId: number;
  destinationBranchId: number;
  requestedBy: number;
  status: string;
  quantity: number;
  receivedQty: number;
  dispatchedBy: number | null;
};
export function canReadTransfer(
  user: Pick<User, "role" | "branchId">,
  transfer: Pick<TransferScope, "sourceBranchId" | "destinationBranchId">
) {
  return (
    approver(user) ||
    user.role === "viewer" ||
    (user.role === "branch_manager" &&
      !!user.branchId &&
      [transfer.sourceBranchId, transfer.destinationBranchId].includes(
        user.branchId
      ))
  );
}
export function requireTransferRead(user: User, transfer: TransferScope) {
  if (!canReadTransfer(user, transfer))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This transfer is not assigned to your branch.",
    });
}
export function requireOrigin(user: User, sourceBranchId: number) {
  if (user.role !== "branch_manager" || user.branchId !== sourceBranchId)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "The sending branch manager must confirm this action.",
    });
}
export function transferPlan(
  user: User,
  t: TransferScope,
  action: TransferActionInput
) {
  requireTransferRead(user, t);
  const denied = (message: string): never => {
    throw new TRPCError({ code: "FORBIDDEN", message });
  };
  const stage = (states: string[]) => {
    if (!states.includes(t.status))
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "This transfer has moved to another stage. Refresh to continue.",
      });
  };
  switch (action.action) {
    case "approve":
    case "reject":
      if (!approver(user)) denied("KEDI operations approval is required.");
      if (t.requestedBy === user.id)
        denied("Another authorised staff member must review your request.");
      stage(["requested"]);
      return {
        status:
          action.action === "approve"
            ? ("approved" as const)
            : ("rejected" as const),
      };
    case "cancel":
      if (!approver(user)) requireOrigin(user, t.sourceBranchId);
      stage(["requested", "approved"]);
      return { status: "cancelled" as const };
    case "dispatch":
      requireOrigin(user, t.sourceBranchId);
      stage(["approved"]);
      return { status: "dispatched" as const };
    case "receive": {
      if (
        user.role !== "branch_manager" ||
        user.branchId !== t.destinationBranchId
      )
        denied("Only the receiving branch manager can confirm arrival.");
      if (t.dispatchedBy === user.id)
        denied(
          "The receiving branch must independently confirm the items sent."
        );
      stage(["dispatched", "partially_received"]);
      if (action.quantity > t.quantity - t.receivedQty)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Only ${t.quantity - t.receivedQty} items remain. Enter the additional quantity received in this update.`,
        });
      const receivedQty = t.receivedQty + action.quantity;
      if (receivedQty < t.quantity && action.note.length < 5)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Describe the outstanding items or any damage for a partial receipt.",
        });
      return {
        status:
          receivedQty === t.quantity
            ? ("received" as const)
            : ("partially_received" as const),
        receivedQty,
      };
    }
  }
}
export const transferReference = (id: number) =>
  `KBT-${String(id).padStart(6, "0")}`;
