import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, desc, or, and, ne } from "drizzle-orm";
import { branches } from "@db/schema";
import { getDb } from "./queries/connection";
import { createRouter, publicQuery, adminQuery, superAdminQuery } from "./middleware";

const branchInput = z.object({
      name: z.string().trim().min(2).max(100),
      code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,5}$/, "Use 2–5 letters or numbers for the branch code"),
      city: z.string().trim().max(50).optional(),
      address: z.string().trim().max(2000).optional(),
      hubBranchId: z.number().int().positive().nullable().optional(),
    });

export const branchRouter = createRouter({
  list: publicQuery.query(async () => {
    const db = getDb();
    return db.select().from(branches).where(eq(branches.status, "active")).orderBy(desc(branches.createdAt));
  }),
  create: adminQuery
    .input(branchInput)
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
  update: superAdminQuery
    .input(branchInput.extend({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, ...details } = input;
      const [current] = await db.select().from(branches).where(eq(branches.id, id)).limit(1);
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Branch office not found" });
      // Existing shipment creation identifies HQ by both its seeded ID and name.
      if ((id === 19 || current.code === "LHQ" || current.name === "Lagos HQ") &&
          (details.name !== current.name || details.code !== current.code || details.hubBranchId)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Lagos HQ must retain its name, code, and direct route" });
      }
      const duplicate = await db.select({ id: branches.id }).from(branches)
        .where(and(ne(branches.id, id), or(eq(branches.code, details.code), eq(branches.name, details.name)))).limit(1);
      if (duplicate.length) throw new TRPCError({ code: "CONFLICT", message: "A branch with this name or code already exists" });
      if (details.hubBranchId) {
        if (details.hubBranchId === id) throw new TRPCError({ code: "BAD_REQUEST", message: "An office cannot route through itself" });
        const [hub] = await db.select().from(branches).where(eq(branches.id, details.hubBranchId)).limit(1);
        if (!hub || hub.status !== "active" || hub.hubBranchId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an active branch that is not already routed through another hub" });
        }
        const dependent = await db.select({ id: branches.id }).from(branches).where(eq(branches.hubBranchId, id)).limit(1);
        if (dependent.length) throw new TRPCError({ code: "BAD_REQUEST", message: "This office serves as a hub. Reroute its dependent offices before assigning it to another hub" });
      }
      try {
        await db.update(branches).set({ ...details, hubBranchId: details.hubBranchId ?? null }).where(eq(branches.id, id));
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
