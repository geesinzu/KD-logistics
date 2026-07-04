import { z } from "zod";
import { eq } from "drizzle-orm";
import { pushSubscriptions } from "@db/schema";
import { getDb } from "./queries/connection";
import { createRouter, authedQuery, publicQuery } from "./middleware";
import { getVapidPublicKey, isPushConfigured, sendPushToUser } from "./lib/push";

export const pushRouter = createRouter({
  // Get VAPID public key for frontend subscription
  vapidKey: publicQuery.query(() => {
    return { key: getVapidPublicKey(), configured: isPushConfigured() };
  }),

  // Subscribe to push notifications
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

      // Delete existing subscriptions with same endpoint to avoid duplicates
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, input.endpoint));

      await db.insert(pushSubscriptions).values({
        userId,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent,
      });

      // Send a welcome/test notification
      await sendPushToUser(userId, {
        title: "KEDI Logistics Notifications",
        body: "Push notifications are now enabled. You'll receive alerts for shipment events.",
        tag: "welcome",
      });

      return { success: true };
    }),

  // Unsubscribe from push notifications
  unsubscribe: authedQuery
    .input(z.object({ endpoint: z.string() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, input.endpoint));
      return { success: true };
    }),

  // Delete all subscriptions for current user
  unsubscribeAll: authedQuery
    .mutation(async ({ ctx }) => {
      const db = getDb();
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, ctx.user!.id));
      return { success: true };
    }),
});
