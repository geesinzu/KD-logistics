import { TRPCError } from "@trpc/server";
import type { KediRole } from "@contracts/constants";
export function assertStaffAuthority(actorRole: string, requestedRole?: KediRole, targetRole?: string) {
  if (actorRole === "super_admin") return;
  if (actorRole !== "admin" || [requestedRole, targetRole].some(role => role === "super_admin" || role === "admin")) throw new TRPCError({ code: "FORBIDDEN", message: "Only Super Admin can manage administrator accounts or grant administrator roles." });
}
