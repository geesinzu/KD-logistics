import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, desc, or } from "drizzle-orm";
import { branches } from "@db/schema";
import { getDb } from "./queries/connection";
import { createRouter, publicQuery, adminQuery } from "./middleware";

export const branchRouter = createRouter({
  list: publicQuery.query(async () => {
    const db = getDb();
    return db.select().from(branches).where(eq(branches.status, "active")).orderBy(desc(branches.createdAt));
  }),
  create: adminQuery
    .input(z.object({
      name: z.string().trim().min(2).max(100),
      code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,5}$/, "Use 2–5 letters or numbers for the branch code"),
      city: z.string().trim().max(50).optional(),
      address: z.string().trim().max(2000).optional(),
      hubBranchId: z.number().int().positive().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const existing = await db.select({ id: branches.id }).from(branches)
        .where(or(eq(branches.code, input.code), eq(branches.name, input.name))).limit(1);
      if (existing.length) throw new TRPCError({ code: "CONFLICT", message: "A branch with this name or code already exists" });
      if (input.hubBranchId) {
        const hub = await db.select().from(branches).where(eq(branches.id, input.hubBranchId)).limit(1);
        if (!hub[0] || hub[0].status !== "active" || hub[0].hubBranchId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an active branch that is not already routed through another hub" });
        }
      }
      try {
        await db.insert(branches).values({ ...input, hubBranchId: input.hubBranchId ?? null });
      } catch (error) {
        const cause = error as { code?: string; cause?: { code?: string } };
        if (cause.code === "ER_DUP_ENTRY" || cause.cause?.code === "ER_DUP_ENTRY") {
          throw new TRPCError({ code: "CONFLICT", message: "This branch code is already in use" });
        }
        throw error;
      }
      return { success: true };
    }),
});
