import { ErrorMessages } from "@contracts/constants";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const createRouter = t.router;
export const publicQuery = t.procedure;

// ── AUTH MIDDLEWARE ──
// Allows KEDI users OR TPL users
const requireAuth = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user && !ctx.tplUser) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: ErrorMessages.unauthenticated,
    });
  }
  return next({ ctx: { ...ctx, user: ctx.user, tplUser: ctx.tplUser } });
});

// KEDI users only
const requireKediUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: ErrorMessages.unauthenticated,
    });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

// TPL users only
const requireTplUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.tplUser) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "3PL authentication required",
    });
  }
  return next({ ctx: { ...ctx, tplUser: ctx.tplUser } });
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

// ── BASE PROCEDURES ──
export const authedQuery = t.procedure.use(requireAuth);

// KEDI-only procedures
export const kediQuery = t.procedure.use(requireKediUser);

// TPL-only procedures
export const tplQuery = t.procedure.use(requireTplUser);

// Role-based KEDI procedures
export const adminQuery = kediQuery.use(requireRoles(["super_admin", "admin"]));
export const superAdminQuery = kediQuery.use(requireRoles(["super_admin"]));
export const shipmentCreatorQuery = kediQuery.use(requireRoles(["super_admin", "admin", "shipment_creator", "logistics_officer"]));
export const warehouseQuery = kediQuery.use(requireRoles(["super_admin", "admin", "warehouse_supply"]));
export const logisticsQuery = kediQuery.use(requireRoles(["super_admin", "admin", "logistics_officer"]));
export const driverQuery = kediQuery.use(requireRoles(["super_admin", "admin", "driver"]));
export const branchManagerQuery = kediQuery.use(requireRoles(["super_admin", "admin", "branch_manager"]));
