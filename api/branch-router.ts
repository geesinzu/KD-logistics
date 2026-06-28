import { z } from "zod";
import { eq, desc } from "drizzle-orm";
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
      name: z.string().min(2),
      code: z.string().min(2).max(10),
      city: z.string().optional(),
      address: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.insert(branches).values({
        name: input.name,
        code: input.code.toUpperCase(),
        city: input.city,
        address: input.address,
      });
      return { success: true };
    }),
});
