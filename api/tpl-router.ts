import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { thirdPartyLogistics, tplUsers } from "@db/schema";
import { getDb } from "./queries/connection";
import { createRouter, publicQuery, tplQuery, superAdminQuery } from "./middleware";
import bcrypt from "bcryptjs";
import { createTplToken } from "./lib/auth";

export const tplRouter = createRouter({
  list: publicQuery.query(async () => {
    const db = getDb();
    return db.select().from(thirdPartyLogistics).where(eq(thirdPartyLogistics.status, "active")).orderBy(desc(thirdPartyLogistics.createdAt));
  }),

  create: publicQuery
    .input(z.object({
      name: z.string().min(2),
      code: z.string().min(2).max(10),
      phone: z.string().optional(),
      email: z.string().optional(),
      address: z.string().optional(),
      pickupOptions: z.enum(["both", "pickup_only", "dropoff_only"]).default("both"),
      contactPerson: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.insert(thirdPartyLogistics).values({
        name: input.name,
        code: input.code.toUpperCase(),
        phone: input.phone,
        email: input.email,
        address: input.address,
        pickupOptions: input.pickupOptions,
        contactPerson: input.contactPerson,
      });
      return { success: true };
    }),

  // TPL user login
  login: publicQuery
    .input(z.object({
      phone: z.string(),
      password: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const results = await db.select().from(tplUsers).where(eq(tplUsers.phone, input.phone)).limit(1);
      const user = results[0];
      if (!user) throw new Error("Invalid credentials");
      const valid = await bcrypt.compare(input.password, user.passwordHash);
      if (!valid) throw new Error("Invalid credentials");
      const token = await createTplToken(user.id);
      return { token, user: { id: user.id, name: user.name, role: user.role, tplId: user.tplId } };
    }),

  // Admin: Create TPL user account (for 3PL portal login)
  createUser: superAdminQuery
    .input(z.object({
      name: z.string().min(2),
      phone: z.string().min(10),
      password: z.string().min(4),
      tplId: z.number(),
      role: z.string().default("tpl_staff"),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const passwordHash = await bcrypt.hash(input.password, 10);
      await db.insert(tplUsers).values({
        name: input.name,
        phone: input.phone,
        passwordHash,
        tplId: input.tplId,
        role: input.role as any,
        status: "active",
      });
      return { success: true };
    }),

  // Admin: List all TPL users
  deleteUser: superAdminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.delete(tplUsers).where(eq(tplUsers.id, input.id));
      return { success: true };
    }),

  listUsers: superAdminQuery.query(async () => {
    const db = getDb();
    const users = await db.select().from(tplUsers).orderBy(desc(tplUsers.createdAt));
    const tpls = await db.select().from(thirdPartyLogistics);
    return users.map(u => ({
      ...u,
      tplName: tpls.find(t => t.id === u.tplId)?.name || "Unknown",
      passwordHash: undefined,
    }));
  }),

  // TPL me - current user info
  me: tplQuery.query(async ({ ctx }) => {
    const db = getDb();
    const user = await db.select().from(tplUsers).where(eq(tplUsers.id, ctx.tplUser!.id)).limit(1);
    const tpl = user[0]?.tplId
      ? await db.select().from(thirdPartyLogistics).where(eq(thirdPartyLogistics.id, user[0].tplId)).limit(1)
      : [];
    return {
      id: user[0]?.id,
      name: user[0]?.name,
      phone: user[0]?.phone,
      tplId: user[0]?.tplId,
      tplName: tpl[0]?.name || null,
      role: user[0]?.role,
    };
  }),
});
