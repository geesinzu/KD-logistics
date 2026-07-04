import webPush from "web-push";
import { getDb } from "../queries/connection";
import { pushSubscriptions, users, branches } from "@db/schema";
import { eq, and, or, isNotNull } from "drizzle-orm";

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

// ── LOW-LEVEL SENDERS ──

export async function sendPushToUser(userId: number, payload: PushPayload): Promise<void> {
  if (!isPushConfigured()) return;
  const db = getDb();
  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  console.log(`[Push] User ${userId}: ${subs.length} subscription(s). Sending: "${payload.title}"`);
  for (const sub of subs) {
    try {
      await webPush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload)
      );
      console.log(`[Push] ✅ Sent to ${sub.endpoint.substring(0, 40)}...`);
    } catch (err: any) {
      console.error(`[Push] ❌ Failed (${err.statusCode}): ${sub.endpoint.substring(0, 40)}...`);
      if (err.statusCode === 410 || err.statusCode === 404) {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
      }
    }
  }
}

export async function sendPushToTplUser(tplUserId: number, payload: PushPayload): Promise<void> {
  if (!isPushConfigured()) return;
  const db = getDb();
  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.tplUserId, tplUserId));
  console.log(`[Push] TPL User ${tplUserId}: ${subs.length} subscription(s). Sending: "${payload.title}"`);
  for (const sub of subs) {
    try {
      await webPush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload)
      );
      console.log(`[Push] ✅ Sent to ${sub.endpoint.substring(0, 40)}...`);
    } catch (err: any) {
      console.error(`[Push] ❌ Failed (${err.statusCode}): ${sub.endpoint.substring(0, 40)}...`);
      if (err.statusCode === 410 || err.statusCode === 404) {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
      }
    }
  }
}

// Send to ALL users with specified KEDI roles
async function sendPushToRoles(roles: string[], payload: PushPayload): Promise<void> {
  const db = getDb();
  const allUsers = await db.select().from(users).where(and(...roles.map(r => eq(users.role, r as any))));
  // If multiple roles, use OR logic - for simplicity query each role separately
  const uniqueUserIds = new Set<number>();
  for (const role of roles) {
    const roleUsers = await db.select().from(users).where(eq(users.role, role as any));
    for (const u of roleUsers) uniqueUserIds.add(u.id);
  }
  for (const uid of uniqueUserIds) {
    await sendPushToUser(uid, payload);
  }
}

// Send to all admins and logistics officers
async function notifyOpsTeam(payload: PushPayload): Promise<void> {
  await sendPushToRoles(["super_admin", "admin", "logistics_officer"], payload);
}

// Send to all 3PL staff of a specific company
async function sendPushTo3plCompany(tplId: number, payload: PushPayload): Promise<void> {
  if (!isPushConfigured()) return;
  const db = getDb();
  const { tplUsers } = await import("@db/schema");
  const staff = await db.select().from(tplUsers).where(eq(tplUsers.tplId, tplId));
  for (const s of staff) {
    await sendPushToTplUser(s.id, payload);
  }
}

// ── EVENT-BASED NOTIFICATIONS ──

// When a shipment is CREATED (Step 1)
export async function notifyShipmentCreated(shipmentId: number, destBranchId: number, trackingId: string, createdBy: number): Promise<void> {
  const db = getDb();
  const branch = await db.select().from(branches).where(eq(branches.id, destBranchId)).limit(1);
  const branchName = branch[0]?.name || "your branch";

  // 1. Notify the creator
  await sendPushToUser(createdBy, {
    title: "Shipment Created",
    body: `Your shipment (${trackingId}) to ${branchName} has been logged.`,
    tag: `shipment-${shipmentId}`,
    url: `/shipments/${shipmentId}`,
  });

  // 2. Notify ops team (admin, super_admin, LO)
  await notifyOpsTeam({
    title: "New Shipment Created",
    body: `Shipment ${trackingId} heading to ${branchName}. Waiting for warehouse processing.`,
    tag: `shipment-${shipmentId}`,
    url: `/shipments/${shipmentId}`,
  });

  // 3. Notify warehouse supply team
  await sendPushToRoles(["warehouse_supply"], {
    title: "Warehouse: New Shipment",
    body: `Shipment ${trackingId} to ${branchName} needs items input and labeling.`,
    tag: `shipment-${shipmentId}`,
    url: `/shipments/${shipmentId}`,
  });

  // 4. Notify destination branch managers
  const managers = await db.select().from(users)
    .where(and(eq(users.role, "branch_manager"), eq(users.branchId, destBranchId)));
  for (const m of managers) {
    await sendPushToUser(m.id, {
      title: "Incoming Shipment",
      body: `A shipment (${trackingId}) is heading to your branch (${branchName}).`,
      tag: `shipment-${shipmentId}`,
      url: `/shipments/${shipmentId}`,
    });
  }
}

// When warehouse processes items and generates label
export async function notifyWarehouseProcessed(shipmentId: number, destBranchId: number, trackingId: string): Promise<void> {
  const db = getDb();
  const branch = await db.select().from(branches).where(eq(branches.id, destBranchId)).limit(1);
  const branchName = branch[0]?.name || "branch";

  await notifyOpsTeam({
    title: "Warehouse Processed",
    body: `Shipment ${trackingId} to ${branchName} is labeled and ready for 3PL assignment.`,
    tag: `shipment-${shipmentId}`,
    url: `/shipments/${shipmentId}`,
  });
}

// When a 3PL is ASSIGNED (Step 4)
export async function notify3plAssigned(shipmentId: number, tplId: number, trackingId: string, destBranchId: number): Promise<void> {
  const db = getDb();
  const { thirdPartyLogistics } = await import("@db/schema");
  const tpl = await db.select().from(thirdPartyLogistics).where(eq(thirdPartyLogistics.id, tplId)).limit(1);
  const tplName = tpl[0]?.name || "3PL";
  const branch = await db.select().from(branches).where(eq(branches.id, destBranchId)).limit(1);
  const branchName = branch[0]?.name || "branch";

  // 1. Notify the 3PL company staff
  await sendPushTo3plCompany(tplId, {
    title: "New Job Assigned",
    body: `Pickup shipment ${trackingId} from Lagos HQ for delivery to ${branchName}.`,
    tag: `shipment-${shipmentId}`,
    url: `/shipments/${shipmentId}`,
  });

  // 2. Notify ops team
  await notifyOpsTeam({
    title: "3PL Assigned",
    body: `${tplName} assigned to shipment ${trackingId} → ${branchName}.`,
    tag: `shipment-${shipmentId}`,
    url: `/shipments/${shipmentId}`,
  });
}

// When 3PL updates status (pickup, in transit, location update, partial delivery, delay)
export async function notify3plStatusUpdate(shipmentId: number, tplId: number, trackingId: string, updateType: string, location?: string): Promise<void> {
  const db = getDb();
  const { thirdPartyLogistics } = await import("@db/schema");
  const tpl = await db.select().from(thirdPartyLogistics).where(eq(thirdPartyLogistics.id, tplId)).limit(1);
  const tplName = tpl[0]?.name || "3PL";

  const updateLabels: Record<string, string> = {
    tpl_pickup_from_warehouse: `picked up from warehouse`,
    tpl_receipt_confirmed: `confirmed receipt`,
    tpl_location_update: `updated location: ${location || "in transit"}`,
    tpl_partial_delivery: `reported partial delivery`,
    tpl_full_delivery: `completed delivery`,
    delay_reported: `reported a delay`,
  };
  const actionText = updateLabels[updateType] || `updated status`;

  await notifyOpsTeam({
    title: "3PL Update",
    body: `${tplName} ${actionText} for shipment ${trackingId}.`,
    tag: `shipment-${shipmentId}`,
    url: `/shipments/${shipmentId}`,
  });
}

// When 3PL DELIVERS (full delivery)
export async function notifyShipmentDelivered(shipmentId: number, destBranchId: number, trackingId: string): Promise<void> {
  const db = getDb();
  const branch = await db.select().from(branches).where(eq(branches.id, destBranchId)).limit(1);
  const branchName = branch[0]?.name || "branch";

  // 1. Notify destination branch managers
  const managers = await db.select().from(users)
    .where(and(eq(users.role, "branch_manager"), eq(users.branchId, destBranchId)));
  for (const m of managers) {
    await sendPushToUser(m.id, {
      title: "Shipment Delivered",
      body: `Shipment ${trackingId} has been delivered to ${branchName}. Please acknowledge receipt.`,
      tag: `shipment-${shipmentId}`,
      url: `/shipments/${shipmentId}`,
    });
  }

  // 2. Notify ops team
  await notifyOpsTeam({
    title: "Shipment Delivered",
    body: `Shipment ${trackingId} delivered to ${branchName}. Waiting for BM acknowledgement.`,
    tag: `shipment-${shipmentId}`,
    url: `/shipments/${shipmentId}`,
  });
}

// When shipment is COMPLETED
export async function notifyShipmentCompleted(shipmentId: number, destBranchId: number, trackingId: string): Promise<void> {
  const db = getDb();
  const branch = await db.select().from(branches).where(eq(branches.id, destBranchId)).limit(1);
  const branchName = branch[0]?.name || "branch";

  // Notify destination branch managers
  const managers = await db.select().from(users)
    .where(and(eq(users.role, "branch_manager"), eq(users.branchId, destBranchId)));
  for (const m of managers) {
    await sendPushToUser(m.id, {
      title: "Shipment Completed",
      body: `Shipment ${trackingId} to ${branchName} is fully completed.`,
      tag: `shipment-${shipmentId}`,
      url: `/shipments/${shipmentId}`,
    });
  }

  await notifyOpsTeam({
    title: "Shipment Completed",
    body: `Shipment ${trackingId} to ${branchName} is fully completed.`,
    tag: `shipment-${shipmentId}`,
    url: `/shipments/${shipmentId}`,
  });
}

// When shipment goes OVERDUE
export async function notifyShipmentOverdue(shipmentId: number, destBranchId: number, trackingId: string, daysOverdue: number): Promise<void> {
  const db = getDb();
  const branch = await db.select().from(branches).where(eq(branches.id, destBranchId)).limit(1);
  const branchName = branch[0]?.name || "branch";

  await notifyOpsTeam({
    title: "⚠️ Shipment Overdue",
    body: `Shipment ${trackingId} to ${branchName} is ${daysOverdue} day(s) overdue!`,
    tag: `shipment-${shipmentId}`,
    url: `/shipments/${shipmentId}`,
  });
}
