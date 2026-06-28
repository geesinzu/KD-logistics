import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { thirdPartyLogistics, tplUsers } from "@db/schema";
import { getDb } from "./queries/connection";
import { createRouter, publicQuery, adminQuery } from "./middleware";
import bcrypt from "bcryptjs";
import { createToken } from "./lib/auth";

export const tplRouter = createRouter({
  list: publicQuery.query(async () => {
    const db = getDb();
    return db.select().from(thirdPartyLogistics).where(eq(thirdPartyLogistics.status, "active")).orderBy(desc(thirdPartyLogistics.createdAt));
  }),

  create: adminQuery
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
      const token = await createToken(user.id);
      return { token, user: { id: user.id, name: user.name, role: user.role, tplId: user.tplId } };
    }),
});
