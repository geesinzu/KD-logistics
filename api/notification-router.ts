import { z } from "zod";
import { eq, desc, and, sql } from "drizzle-orm";
import { notifications } from "@db/schema";
import { getDb } from "./queries/connection";
import { createRouter, authedQuery } from "./middleware";

export const notificationRouter = createRouter({
  list: authedQuery
    .input(z.object({
      page: z.number().default(1),
      limit: z.number().default(20),
      unreadOnly: z.boolean().default(false),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const page = input?.page ?? 1;
      const limit = input?.limit ?? 20;
      const offset = (page - 1) * limit;

      const conditions = [];
      if (ctx.user) {
        conditions.push(eq(notifications.userId, ctx.user.id));
      } else if (ctx.tplUser) {
        conditions.push(eq(notifications.tplUserId, ctx.tplUser.id));
      }
      if (input?.unreadOnly) {
        conditions.push(eq(notifications.read, 0));
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const results = await db.select().from(notifications)
        .where(where)
        .orderBy(desc(notifications.createdAt))
        .limit(limit)
        .offset(offset);

      const countResult = await db.select({ count: sql<number>`count(*)` })
        .from(notifications)
        .where(where);

      return { notifications: results, total: countResult[0]?.count ?? 0 };
    }),

  unreadCount: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const conditions = [eq(notifications.read, 0)];
    if (ctx.user) {
      conditions.push(eq(notifications.userId, ctx.user.id));
    } else if (ctx.tplUser) {
      conditions.push(eq(notifications.tplUserId, ctx.tplUser.id));
    }
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(and(...conditions));
    return result[0]?.count ?? 0;
  }),

  markRead: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(notifications).set({ read: 1 }).where(eq(notifications.id, input.id));
      return { success: true };
    }),

  markAllRead: authedQuery
    .mutation(async ({ ctx }) => {
      const db = getDb();
      const conditions = [];
      if (ctx.user) {
        conditions.push(eq(notifications.userId, ctx.user.id));
      } else if (ctx.tplUser) {
        conditions.push(eq(notifications.tplUserId, ctx.tplUser.id));
      }
      if (conditions.length > 0) {
        await db.update(notifications).set({ read: 1 })
          .where(and(...conditions, eq(notifications.read, 0)));
      }
      return { success: true };
    }),
});
