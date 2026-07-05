import { z } from "zod";
import { eq } from "drizzle-orm";
import { pushSubscriptions } from "@db/schema";
import { getDb } from "./queries/connection";
import { createRouter, authedQuery, tplQuery, publicQuery } from "./middleware";
import { getVapidPublicKey, isPushConfigured, sendPushToUser, sendPushToTplUser } from "./lib/push";

export const pushRouter = createRouter({
  vapidKey: publicQuery.query(() => {
    return { key: getVapidPublicKey(), configured: isPushConfigured() };
  }),

  // KEDI users subscribe
  subscribe: authedQuery
    .input(z.object({
      endpoint: z.string(),
      p256dh: z.string(),
      auth: z.string(),
      userAgent: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const userId = ctx.user!.id;
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, input.endpoint));
      await db.insert(pushSubscriptions).values({
        userId,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent,
      });
      await sendPushToUser(userId, {
        title: "KEDI Logistics Notifications",
        body: "Push notifications are now enabled. You'll receive alerts for shipment events.",
        tag: "welcome",
      });
      return { success: true };
    }),

  // 3PL users subscribe
  subscribeTpl: tplQuery
    .input(z.object({
      endpoint: z.string(),
      p256dh: z.string(),
      auth: z.string(),
      userAgent: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const tplUserId = ctx.tplUser!.id;
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, input.endpoint));
      await db.insert(pushSubscriptions).values({
        tplUserId,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent,
      });
      await sendPushToTplUser(tplUserId, {
        title: "KEDI Logistics Notifications",
        body: "Push notifications enabled. You'll get alerts when shipments are assigned to your company.",
        tag: "welcome",
      });
      return { success: true };
    }),

  unsubscribe: authedQuery
    .input(z.object({ endpoint: z.string() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, input.endpoint));
      return { success: true };
    }),

  unsubscribeAll: authedQuery
    .mutation(async ({ ctx }) => {
      const db = getDb();
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, ctx.user!.id));
      return { success: true };
    }),

  unsubscribeAllTpl: tplQuery
    .mutation(async ({ ctx }) => {
      const db = getDb();
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.tplUserId, ctx.tplUser!.id));
      return { success: true };
    }),

  // Diagnostic: send a test push to the current user
  sendTest: authedQuery
    .mutation(async ({ ctx }) => {
      const userId = ctx.user!.id;
      await sendPushToUser(userId, {
        title: "🔔 Test Notification",
        body: `Hello ${ctx.user!.name}! If you see this, push notifications are working correctly on this device.`,
        tag: "test",
        url: "/profile",
      });
      return { success: true, message: "Test notification sent. Check your device." };
    }),

  // Diagnostic: list my subscriptions
  mySubscriptions: authedQuery
    .query(async ({ ctx }) => {
      const db = getDb();
      const subs = await db.select({
        id: pushSubscriptions.id,
        endpoint: pushSubscriptions.endpoint,
        userAgent: pushSubscriptions.userAgent,
        createdAt: pushSubscriptions.createdAt,
      }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, ctx.user!.id));
      return { count: subs.length, subscriptions: subs };
    }),
});
