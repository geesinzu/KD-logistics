import { z } from "zod";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { users } from "@db/schema";
import { getDb } from "./queries/connection";
import { createToken } from "./lib/auth";
import { createRouter, publicQuery, authedQuery } from "./middleware";
import { ErrorMessages } from "@contracts/constants";

export const authRouter = createRouter({
  me: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const userId = ctx.user?.id ?? ctx.tplUser?.id;
    if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });
    const results = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const user = results[0];
    if (!user) throw new TRPCError({ code: "NOT_FOUND" });
    const { passwordHash: _, ...safeUser } = user;
    return safeUser;
  }),

  signup: publicQuery
    .input(
      z.object({
        name: z.string().min(2).max(100),
        phone: z.string().min(10).max(20),
        password: z.string().min(6).max(100),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      // Check if phone exists
      const existing = await db.select().from(users).where(eq(users.phone, input.phone)).limit(1);
      if (existing.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: ErrorMessages.phoneExists,
        });
      }
      const passwordHash = await bcrypt.hash(input.password, 10);
      await db.insert(users).values({
        name: input.name,
        phone: input.phone,
        passwordHash,
        role: "unassigned",
        status: "pending",
      });
      return { success: true, message: "Account created. Waiting for admin approval." };
    }),

  login: publicQuery
    .input(
      z.object({
        phone: z.string().min(10).max(20),
        password: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const results = await db.select().from(users).where(eq(users.phone, input.phone)).limit(1);
      const user = results[0];
      if (!user) {
        console.log("[LOGIN] User not found:", input.phone);
        throw new TRPCError({ code: "UNAUTHORIZED", message: ErrorMessages.invalidCredentials });
      }
      const valid = await bcrypt.compare(input.password, user.passwordHash);
      if (!valid) {
        console.log("[LOGIN] Invalid password for:", input.phone);
        throw new TRPCError({ code: "UNAUTHORIZED", message: ErrorMessages.invalidCredentials });
      }
      if (user.status === "pending") {
        throw new TRPCError({ code: "FORBIDDEN", message: ErrorMessages.accountPending });
      }
      if (user.status === "suspended") {
        throw new TRPCError({ code: "FORBIDDEN", message: ErrorMessages.accountSuspended });
      }
      await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
      const token = await createToken(user.id);
      const { passwordHash: _, ...safeUser } = user;
      console.log("[LOGIN] Success:", user.name, "role:", user.role);
      return { token, user: safeUser };
    }),

  logout: authedQuery.mutation(() => {
    return { success: true };
  }),
});
