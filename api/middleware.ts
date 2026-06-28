import { ErrorMessages } from "@contracts/constants";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const createRouter = t.router;
export const publicQuery = t.procedure;

const requireAuth = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: ErrorMessages.unauthenticated,
    });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

function requireRoles(roles: string[]) {
  return t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || !roles.includes(ctx.user.role)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: ErrorMessages.insufficientRole,
      });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  });
}

export const authedQuery = t.procedure.use(requireAuth);
export const adminQuery = authedQuery.use(requireRoles(["super_admin", "admin"]));
export const superAdminQuery = authedQuery.use(requireRoles(["super_admin"]));

// Shipment creators
export const shipmentCreatorQuery = authedQuery.use(
  requireRoles(["super_admin", "admin", "shipment_creator"])
);

// Warehouse
export const warehouseQuery = authedQuery.use(
  requireRoles(["super_admin", "admin", "warehouse_supply"])
);

// Logistics
export const logisticsQuery = authedQuery.use(
  requireRoles(["super_admin", "admin", "logistics_officer"])
);

// Driver
export const driverQuery = authedQuery.use(
  requireRoles(["super_admin", "admin", "driver"])
);

// Branch manager
export const branchManagerQuery = authedQuery.use(
  requireRoles(["super_admin", "admin", "branch_manager"])
);
