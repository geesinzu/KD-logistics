import { z } from "zod";
import bcrypt from "bcryptjs";
import { eq, like, desc, sql, and, or } from "drizzle-orm";
import { users } from "@db/schema";
import { getDb } from "./queries/connection";
import { createRouter, authedQuery } from "./middleware";
import { TRPCError } from "@trpc/server";
import type { KediRole } from "@contracts/constants";

export const userRouter = createRouter({
  list: authedQuery
    .input(
      z.object({
        page: z.number().default(1),
        limit: z.number().default(20),
        role: z.string().optional(),
        status: z.string().optional(),
        search: z.string().optional(),
      }).optional()
    )
    .query(async ({ input, ctx }) => {
      // Only Super Admin can list all users
      if (ctx.user?.role !== "super_admin") {
        return { users: [] as any[], total: 0 };
      }
      const db = getDb();
      const page = input?.page ?? 1;
      const limit = input?.limit ?? 20;
      const offset = (page - 1) * limit;

      const conditions = [];
      if (input?.role) conditions.push(eq(users.role, input.role as KediRole));
      if (input?.status) conditions.push(eq(users.status, input.status as "pending" | "active" | "suspended"));
      if (input?.search) {
        conditions.push(or(
          like(users.name, `%${input.search}%`),
          like(users.phone, `%${input.search}%`)
        ));
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const results = await db.select({
        id: users.id,
        name: users.name,
        phone: users.phone,
        email: users.email,
        role: users.role,
        status: users.status,
        branchId: users.branchId,
        createdAt: users.createdAt,
        lastLoginAt: users.lastLoginAt,
      })
        .from(users)
        .where(where)
        .orderBy(desc(users.createdAt))
        .limit(limit)
        .offset(offset);

      const countResult = await db.select({ count: sql<number>`count(*)` }).from(users).where(where);
      return { users: results, total: countResult[0]?.count ?? 0 };
    }),

  getById: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      if (ctx.user?.role !== "super_admin") throw new TRPCError({ code: "FORBIDDEN", message: "Super Admin only" });
      const db = getDb();
      const results = await db.select({
        id: users.id,
        name: users.name,
        phone: users.phone,
        email: users.email,
        role: users.role,
        status: users.status,
        branchId: users.branchId,
        createdAt: users.createdAt,
        lastLoginAt: users.lastLoginAt,
      }).from(users).where(eq(users.id, input.id)).limit(1);
      return results[0] ?? null;
    }),

  updateRole: authedQuery
    .input(z.object({ id: z.number(), role: z.string() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(users).set({ role: input.role as KediRole }).where(eq(users.id, input.id));
      return { success: true };
    }),

  updateStatus: authedQuery
    .input(z.object({ id: z.number(), status: z.enum(["pending", "active", "suspended"]) }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(users).set({ status: input.status }).where(eq(users.id, input.id));
      return { success: true };
    }),

  updateBranch: authedQuery
    .input(z.object({ id: z.number(), branchId: z.number().nullable() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(users).set({ branchId: input.branchId }).where(eq(users.id, input.id));
      return { success: true };
    }),

  delete: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.delete(users).where(eq(users.id, input.id));
      return { success: true };
    }),

  create: authedQuery
    .input(z.object({
      name: z.string().min(2),
      phone: z.string().min(10),
      role: z.string(),
      branchId: z.number().optional(),
      password: z.string().min(6).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user?.role !== "super_admin") throw new TRPCError({ code: "FORBIDDEN", message: "Super Admin only" });
      const db = getDb();
      const existing = await db.select().from(users).where(eq(users.phone, input.phone)).limit(1);
      if (existing.length > 0) throw new Error("Phone number already exists");

      const passwordHash = await bcrypt.hash(input.password || "kedi1234", 10);
      await db.insert(users).values({
        name: input.name,
        phone: input.phone,
        passwordHash,
        role: input.role as KediRole,
        status: "active",
        branchId: input.branchId,
        createdBy: ctx.user!.id,
      });
      return { success: true };
    }),

  stats: authedQuery.query(async ({ ctx }) => {
      if (ctx.user?.role !== "super_admin") return { total: 0, active: 0, pending: 0, suspended: 0, byRole: {} };
    const db = getDb();
    const allUsers = await db.select().from(users);
    return {
      total: allUsers.length,
      active: allUsers.filter(u => u.status === "active").length,
      pending: allUsers.filter(u => u.status === "pending").length,
      suspended: allUsers.filter(u => u.status === "suspended").length,
      byRole: allUsers.reduce((acc, u) => {
        acc[u.role] = (acc[u.role] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    };
  }),

  updateProfile: authedQuery
    .input(z.object({
      name: z.string().min(2).optional(),
      email: z.string().email().optional().or(z.literal("")),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const userId = ctx.user?.id ?? 0;
      const updates: any = {};
      if (input.name) updates.name = input.name;
      if (input.email !== undefined) updates.email = input.email || null;
      await db.update(users).set(updates).where(eq(users.id, userId));
      return { success: true };
    }),

  uploadProfilePicture: authedQuery
    .input(z.object({
      imageBase64: z.string().min(100),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const userId = ctx.user?.id ?? 0;

      // Validate it's a real image (check base64 header)
      if (!input.imageBase64.startsWith("data:image/")) {
        throw new Error("Invalid image format. Must be a valid image.");
      }

      // Limit size check (rough estimate: base64 is ~4/3 of actual size)
      if (input.imageBase64.length > 4 * 1024 * 1024) {
        throw new Error("Image too large. Max 3MB.");
      }

      await db.update(users)
        .set({ profilePicture: input.imageBase64 })
        .where(eq(users.id, userId));

      return { success: true, profilePicture: input.imageBase64 };
    }),
});
