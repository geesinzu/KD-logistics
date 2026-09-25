import { z } from "zod";
import { eq } from "drizzle-orm";
import { pushSubscriptions } from "@db/schema";
import { getDb } from "./queries/connection";
import { createRouter, authedQuery, tplQuery, publicQuery } from "./middleware";
import { getVapidPublicKey, isPushConfigured, deliverPush } from "./lib/push";

const subscriptionInput = z.object({
  endpoint: z.string(),
  p256dh: z.string(),
  auth: z.string(),
  userAgent: z.string().optional(),
  // Re-registering a phone the app already knows is subscribed (see `status`)
  // shouldn't buzz the person with a "notifications enabled" message again.
  silent: z.boolean().optional(),
});

// Sends the "you're enabled" message to just the device that subscribed, and
// reports whether it actually got through. Previously this went to all of the
// person's devices and any failure was swallowed, so a phone the push service
// was rejecting looked identical to a working one.
async function sendWelcome(
  input: z.infer<typeof subscriptionInput>,
  body: string,
): Promise<{ testDelivered: boolean | undefined; failureCode: number | undefined }> {
  if (input.silent) return { testDelivered: undefined, failureCode: undefined };
  const result = await deliverPush(
    { endpoint: input.endpoint, p256dh: input.p256dh, auth: input.auth },
    { title: "KEDI Logistics Notifications", body, tag: "welcome" },
  );
  return { testDelivered: result.ok, failureCode: result.statusCode };
}

export const pushRouter = createRouter({
  vapidKey: publicQuery.query(() => {
    return { key: getVapidPublicKey(), configured: isPushConfigured() };
  }),

  // Does the server have THIS phone registered to THIS person? The phone's own
  // browser can say "subscribed" while the server has no row for it (row
  // expired and was cleaned up, or the phone was last registered by someone
  // else), in which case the toggle shows "enabled" but nothing is ever sent.
  status: authedQuery
    .input(z.object({ endpoint: z.string(), kind: z.enum(["kedi", "tpl"]) }))
    .query(async ({ input, ctx }) => {
      const rows = await getDb()
        .select({ userId: pushSubscriptions.userId, tplUserId: pushSubscriptions.tplUserId })
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.endpoint, input.endpoint))
        .limit(1);
      const row = rows[0];
      const registeredToMe = !!row && (
        input.kind === "tpl"
          ? !!ctx.tplUser && row.tplUserId === ctx.tplUser.id
          : !!ctx.user && row.userId === ctx.user.id
      );
      return { registeredToMe };
    }),

  // KEDI users subscribe
  subscribe: authedQuery
    .input(subscriptionInput)
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
      const { testDelivered, failureCode } = await sendWelcome(
        input, "Push notifications are now enabled. You'll receive alerts for shipment events.",
      );
      return { success: true, testDelivered, failureCode };
    }),

  // 3PL users subscribe
  subscribeTpl: tplQuery
    .input(subscriptionInput)
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
      const { testDelivered, failureCode } = await sendWelcome(
        input, "Push notifications enabled. You'll get alerts when shipments are assigned to your company.",
      );
      return { success: true, testDelivered, failureCode };
    }),

  // Removes one device. Disabling on one phone must not switch off the same
  // person's other devices.
  unsubscribe: authedQuery
    .input(z.object({ endpoint: z.string() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, input.endpoint));
      return { success: true };
    }),
});
