import { z } from "zod";
import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import { eq, like, desc, sql, and, or, ne } from "drizzle-orm";
import { users, branches } from "@db/schema";
import { getDb } from "./queries/connection";
import { createRouter, adminQuery, superAdminQuery, authedQuery, staffQuery } from "./middleware";
import { assertStaffAuthority } from "./lib/staff-permissions";
import { KEDI_ROLES } from "@contracts/constants";
import type { KediRole } from "@contracts/constants";

const PHONE_REGEX = /^\d{11}$/;

async function validateStaffBranch(id: number, branchId: number | null) {
  const db = getDb();
  const [staff] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!staff) throw new TRPCError({ code: "NOT_FOUND", message: "Staff member not found" });
  if (staff.role === "branch_manager" && branchId === null) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "A branch manager must be assigned to a branch" });
  }
  if (branchId !== null) {
    const [branch] = await db.select().from(branches).where(eq(branches.id, branchId)).limit(1);
    if (!branch || branch.status !== "active") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Select an active branch office" });
    }
  }
}

export const userRouter = createRouter({
  list: authedQuery
    .input(
      z.object({
        page: z.number().default(1),
        limit: z.number().default(20),
        role: z.enum(KEDI_ROLES).optional(),
        status: z.string().optional(),
        search: z.string().optional(),
      }).optional()
    )
    .query(async ({ input }) => {
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

  getById: adminQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
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

  updateRole: superAdminQuery
    .input(z.object({ id: z.number(), role: z.enum(KEDI_ROLES) }))
    .mutation(async ({ input }) => {
      const db = getDb();
      if (input.role === "department_staff") throw new TRPCError({code:"BAD_REQUEST",message:"Assign department staff from Department packages → Staff access."});
      await db.update(users).set({ role: input.role as KediRole }).where(eq(users.id, input.id));
      return { success: true };
    }),

  updateStatus: adminQuery
    .input(z.object({ id: z.number().int().positive(), status: z.enum(["pending", "active", "suspended"]) }))
    .mutation(async ({ input, ctx }) => getDb().transaction(async tx => {
      const [target] = await tx.select().from(users).where(eq(users.id, input.id)).limit(1).for("update");
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Staff member not found" });
      assertStaffAuthority(ctx.user.role, undefined, target.role);
      await tx.update(users).set({ status: input.status }).where(eq(users.id, input.id));
      return { success: true };
    })),

  // Approval assigns a requested operational role; granting administrator
  // privileges or managing an existing administrator requires Super Admin.
  approveUser: adminQuery
    .input(z.object({ id: z.number().int().positive(), role: z.enum(KEDI_ROLES), branchId: z.number().int().positive().nullable() }))
    .mutation(async ({ input, ctx }) => getDb().transaction(async tx => {
      assertStaffAuthority(ctx.user.role, input.role);
      if (input.role === "department_staff") throw new TRPCError({code:"BAD_REQUEST",message:"Use Department packages → Staff access to assign a department."});
      const [target] = await tx.select().from(users).where(eq(users.id, input.id)).limit(1).for("update");
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Staff member not found" });
      assertStaffAuthority(ctx.user.role, input.role, target.role);
      if (target.status !== "pending") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Only pending signups can be approved. Use the staff editing controls for an existing account." });
      if (input.role === "branch_manager" && !input.branchId) throw new TRPCError({ code: "BAD_REQUEST", message: "A branch manager must be assigned to a branch" });
      if (input.branchId) {
        const [branch] = await tx.select().from(branches).where(eq(branches.id, input.branchId)).limit(1);
        if (!branch || branch.status !== "active") throw new TRPCError({ code: "BAD_REQUEST", message: "Select an active branch office" });
      }
      await tx.update(users).set({ role: input.role, branchId: input.branchId, status: "active" }).where(eq(users.id, input.id));
      return { success: true };
    })),

  updateStaff: superAdminQuery
    .input(z.object({
      id: z.number().int().positive(),
      name: z.string().trim().min(2).max(100),
      phone: z.string().regex(PHONE_REGEX, "Enter an 11-digit phone number"),
      email: z.string().trim().email().max(320).or(z.literal("")),
      branchId: z.number().int().positive().nullable(),
    }))
    .mutation(async ({ input }) => {
      await validateStaffBranch(input.id, input.branchId);
      const db = getDb();
      const duplicate = await db.select({ id: users.id }).from(users)
        .where(and(ne(users.id, input.id), eq(users.phone, input.phone))).limit(1);
      if (duplicate.length) throw new TRPCError({ code: "CONFLICT", message: "Phone number already belongs to another staff member" });
      const { id, ...details } = input;
      try {
        await db.update(users).set({ ...details, email: details.email || null }).where(eq(users.id, id));
      } catch (error) {
        const cause = error as { code?: string; cause?: { code?: string } };
        if (cause.code === "ER_DUP_ENTRY" || cause.cause?.code === "ER_DUP_ENTRY") {
          throw new TRPCError({ code: "CONFLICT", message: "Phone number already belongs to another staff member" });
        }
        throw error;
      }
      return { success: true };
    }),

  updateBranch: superAdminQuery
    .input(z.object({ id: z.number().int().positive(), branchId: z.number().int().positive().nullable() }))
    .mutation(async ({ input }) => {
      await validateStaffBranch(input.id, input.branchId);
      const db = getDb();
      await db.update(users).set({ branchId: input.branchId }).where(eq(users.id, input.id));
      return { success: true };
    }),

  delete: adminQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => getDb().transaction(async tx => {
      const [target] = await tx.select().from(users).where(eq(users.id, input.id)).limit(1).for("update");
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Staff member not found" });
      assertStaffAuthority(ctx.user.role, undefined, target.role);
      await tx.delete(users).where(eq(users.id, input.id));
      return { success: true };
    })),

  create: adminQuery
    .input(z.object({
      name: z.string().min(2),
      phone: z.string().regex(PHONE_REGEX, "Enter an 11-digit phone number"),
      role: z.enum(KEDI_ROLES),
      branchId: z.number().optional(),
      password: z.string().min(6).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertStaffAuthority(ctx.user.role, input.role);
      if (input.role === "department_staff") throw new TRPCError({code:"BAD_REQUEST",message:"Use Department packages → Staff access to assign a department."});
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
        createdBy: ctx.user.id,
      });
      return { success: true };
    }),

  stats: adminQuery.query(async () => {
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

  updateProfile: staffQuery
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

  uploadProfilePicture: staffQuery
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
