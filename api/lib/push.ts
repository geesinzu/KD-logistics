import webPush from "web-push";
import { getDb } from "../queries/connection";
import { pushSubscriptions } from "@db/schema";
import { eq } from "drizzle-orm";

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:kedi@example.com";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

export function getVapidPublicKey(): string {
  return VAPID_PUBLIC_KEY;
}

export function isPushConfigured(): boolean {
  return !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
}

interface PushPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
}

export async function sendPushToUser(userId: number, payload: PushPayload): Promise<void> {
  if (!isPushConfigured()) return;
  const db = getDb();
  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  for (const sub of subs) {
    try {
      await webPush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload)
      );
    } catch (err: any) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
      }
    }
  }
}

export async function sendPushToBranchManagers(branchId: number, payload: PushPayload): Promise<void> {
  if (!isPushConfigured()) return;
  const db = getDb();
  const { users } = await import("@db/schema");
  const { eq, and } = await import("drizzle-orm");
  const managers = await db.select().from(users)
    .where(and(eq(users.role, "branch_manager"), eq(users.branchId, branchId)));
  for (const m of managers) {
    await sendPushToUser(m.id, payload);
  }
}

// Shipment event notifications
export async function notifyShipmentCreated(shipmentId: number, destBranchId: number, trackingId: string): Promise<void> {
  const db = getDb();
  const { branches } = await import("@db/schema");
  const { eq } = await import("drizzle-orm");
  const branch = await db.select().from(branches).where(eq(branches.id, destBranchId)).limit(1);
  const branchName = branch[0]?.name || "your branch";
  await sendPushToBranchManagers(destBranchId, {
    title: "New Shipment Created",
    body: `A shipment (${trackingId}) is heading to ${branchName}.`,
    tag: `shipment-${shipmentId}`,
    url: `/shipments/${shipmentId}`,
  });
}

export async function notifyShipmentDelivered(shipmentId: number, destBranchId: number, trackingId: string): Promise<void> {
  await sendPushToBranchManagers(destBranchId, {
    title: "Shipment Delivered",
    body: `Shipment ${trackingId} has been delivered. Please acknowledge receipt.`,
    tag: `shipment-${shipmentId}`,
    url: `/shipments/${shipmentId}`,
  });
}

export async function notifyShipmentCompleted(shipmentId: number, destBranchId: number, trackingId: string): Promise<void> {
  await sendPushToBranchManagers(destBranchId, {
    title: "Shipment Completed",
    body: `Shipment ${trackingId} has been completed.`,
    tag: `shipment-${shipmentId}`,
    url: `/shipments/${shipmentId}`,
  });
}
