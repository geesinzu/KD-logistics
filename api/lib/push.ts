import webPush from "web-push";
import { getDb } from "../queries/connection";
import { pushSubscriptions, users, branches } from "@db/schema";
import { eq, and, sql } from "drizzle-orm";

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:kedi@example.com";

// Configure web-push once
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
  badge?: string;
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
      // 410 Gone = subscription expired, delete it
      if (err.statusCode === 410 || err.statusCode === 404) {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
      }
    }
  }
}

// Send push to all branch managers of a specific branch
export async function sendPushToBranchManagers(branchId: number, payload: PushPayload): Promise<void> {
  if (!isPushConfigured()) return;
  const db = getDb();
  const managers = await db.select().from(users)
    .where(and(eq(users.role, "branch_manager"), eq(users.branchId, branchId)));
  for (const m of managers) {
    await sendPushToUser(m.id, payload);
  }
}

// Send push to all users at a branch (any role)
export async function sendPushToBranchUsers(branchId: number, payload: PushPayload): Promise<void> {
  if (!isPushConfigured()) return;
  const db = getDb();
  const branchUsers = await db.select().from(users).where(eq(users.branchId, branchId));
  for (const u of branchUsers) {
    await sendPushToUser(u.id, payload);
  }
}

// ── CONVENIENCE HELPERS FOR SHIPMENT EVENTS ──

export async function notifyShipmentCreated(shipmentId: number, destBranchId: number, trackingId: string): Promise<void> {
  const db = getDb();
  const branch = await db.select().from(branches).where(eq(branches.id, destBranchId)).limit(1);
  const branchName = branch[0]?.name || "your branch";
  await sendPushToBranchManagers(destBranchId, {
    title: "New Shipment Created",
    body: `A shipment (${trackingId}) is heading to ${branchName}.`,
    tag: `shipment-${shipmentId}`,
    url: `/shipments/${shipmentId}`,
  });
}

export async function notifyDeliveredToHub(shipmentId: number, hubBranchId: number, finalBranchName: string, trackingId: string): Promise<void> {
  await sendPushToBranchManagers(hubBranchId, {
    title: "Shipment Arrived at Your Hub",
    body: `A shipment (${trackingId}) for ${finalBranchName} has arrived. Please acknowledge and arrange onward transfer.`,
    tag: `shipment-${shipmentId}`,
    url: `/shipments/${shipmentId}`,
  });
}

export async function notifyOnwardTransfer(shipmentId: number, finalBranchId: number, hubName: string, trackingId: string): Promise<void> {
  await sendPushToBranchManagers(finalBranchId, {
    title: "Shipment In Transit to Your Branch",
    body: `A shipment (${trackingId}) has been dispatched from ${hubName} and is on its way to you.`,
    tag: `shipment-${shipmentId}`,
    url: `/shipments/${shipmentId}`,
  });
}

export async function notifyCompleted(shipmentId: number, destBranchId: number, trackingId: string): Promise<void> {
  await sendPushToBranchManagers(destBranchId, {
    title: "Shipment Delivered",
    body: `Shipment ${trackingId} has been successfully delivered and completed.`,
    tag: `shipment-${shipmentId}`,
    url: `/shipments/${shipmentId}`,
  });
}
