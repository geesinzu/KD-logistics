import webPush from "web-push";
import { getDb } from "../queries/connection";
import { pushSubscriptions, users, branches, shipments, tplUsers, thirdPartyLogistics } from "@db/schema";
import type { Shipment } from "@db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { PUSH_AUDIENCES, resolveKediRecipients } from "./push-audiences";
import type { PushAudience, PushPayload, ShipmentPushEvent } from "./push-audiences";

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

type UserRole = (typeof users.$inferSelect)["role"];

// ── LOW-LEVEL SENDERS ──

export interface DeliveryResult {
  ok: boolean;
  // The push service's HTTP status when it refused: 404/410 = subscription
  // expired (removed here), 401/403 = the server's VAPID identity was
  // rejected or doesn't match the one the phone subscribed with.
  statusCode?: number;
}

// The one place a push actually leaves the server. Reports the outcome
// instead of swallowing it, so callers that care (the "enable" test message)
// can tell the user it didn't arrive. The push service's own reason text
// (e.g. Apple's "BadJwtToken") is logged, since that's what identifies why.
export async function deliverPush(
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: PushPayload,
): Promise<DeliveryResult> {
  if (!isPushConfigured()) return { ok: false };
  try {
    await webPush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload)
    );
    console.log(`[Push] ✅ Sent to ${sub.endpoint.substring(0, 40)}...`);
    return { ok: true };
  } catch (err: any) {
    const reason = typeof err.body === "string" ? err.body.slice(0, 120) : "";
    console.error(`[Push] ❌ Failed (${err.statusCode}): ${sub.endpoint.substring(0, 40)}... ${reason}`);
    if (err.statusCode === 410 || err.statusCode === 404) {
      await getDb().delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, sub.endpoint));
    }
    return { ok: false, statusCode: err.statusCode };
  }
}

export async function sendPushToUser(userId: number, payload: PushPayload): Promise<void> {
  if (!isPushConfigured()) return;
  const subs = await getDb().select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  console.log(`[Push] User ${userId}: ${subs.length} subscription(s). Sending: "${payload.title}"`);
  for (const sub of subs) await deliverPush(sub, payload);
}

export async function sendPushToTplUser(tplUserId: number, payload: PushPayload): Promise<void> {
  if (!isPushConfigured()) return;
  const subs = await getDb().select().from(pushSubscriptions).where(eq(pushSubscriptions.tplUserId, tplUserId));
  console.log(`[Push] TPL User ${tplUserId}: ${subs.length} subscription(s). Sending: "${payload.title}"`);
  for (const sub of subs) await deliverPush(sub, payload);
}

// Send to ALL active users with any of the given roles
async function sendPushToRoles(roles: UserRole[], payload: PushPayload): Promise<void> {
  for (const uid of await activeUserIdsWithRole(roles)) {
    await sendPushToUser(uid, payload);
  }
}

// Send to all admins and logistics officers
async function notifyOpsTeam(payload: PushPayload): Promise<void> {
  await sendPushToRoles(["super_admin", "admin", "logistics_officer"], payload);
}

// ── AUDIENCE DISPATCH ──
// Every shipment event goes through here: PUSH_AUDIENCES says who is told,
// this resolves those groups to actual people and sends one push each.
// Suspended and pending accounts are skipped -- they shouldn't get
// operational alerts even if their phone still has a subscription.

async function activeUserIdsWithRole(roles: UserRole[]): Promise<number[]> {
  const rows = await getDb().select({ id: users.id }).from(users)
    .where(and(inArray(users.role, roles), eq(users.status, "active")));
  return rows.map(r => r.id);
}

async function loadShipment(shipmentId: number): Promise<Shipment | undefined> {
  const rows = await getDb().select().from(shipments).where(eq(shipments.id, shipmentId)).limit(1);
  return rows[0];
}

async function getBranchName(branchId: number): Promise<string> {
  const rows = await getDb().select().from(branches).where(eq(branches.id, branchId)).limit(1);
  return rows[0]?.name || "branch";
}

async function getTplCompanyName(tplId: number): Promise<string> {
  const rows = await getDb().select().from(thirdPartyLogistics).where(eq(thirdPartyLogistics.id, tplId)).limit(1);
  return rows[0]?.name || "3PL";
}

async function notifyShipmentAudiences(
  shipment: Shipment,
  event: ShipmentPushEvent,
  payload: PushPayload,
  overrides: Partial<Record<PushAudience, PushPayload>> = {},
  exceptUserId?: number,
): Promise<void> {
  if (!isPushConfigured()) return;
  const db = getDb();
  const audiences = new Set(PUSH_AUDIENCES[event]);

  const idsByAudience: Partial<Record<PushAudience, (number | null | undefined)[]>> = {};
  if (audiences.has("branch")) {
    const managers = await db.select({ id: users.id }).from(users).where(and(
      eq(users.role, "branch_manager"),
      eq(users.branchId, shipment.destBranchId),
      eq(users.status, "active"),
    ));
    idsByAudience.branch = managers.map(m => m.id);
  }
  if (audiences.has("driver")) idsByAudience.driver = [shipment.assignedDriverId];
  if (audiences.has("warehouse")) idsByAudience.warehouse = await activeUserIdsWithRole(["warehouse_supply"]);
  if (audiences.has("creator")) idsByAudience.creator = [shipment.createdBy];
  if (audiences.has("ops")) idsByAudience.ops = await activeUserIdsWithRole(["super_admin", "admin", "logistics_officer"]);
  if (audiences.has("viewers")) idsByAudience.viewers = await activeUserIdsWithRole(["viewer"]);

  const kediRecipients = resolveKediRecipients(event, idsByAudience, payload, overrides, exceptUserId);

  // 3PL staff only ever hear about shipments assigned to their own company.
  let tplStaffIds: number[] = [];
  if (audiences.has("tpl") && shipment.tplId) {
    const staff = await db.select({ id: tplUsers.id }).from(tplUsers).where(eq(tplUsers.tplId, shipment.tplId));
    tplStaffIds = staff.map(s => s.id);
  }
  const tplPayload = overrides.tpl ?? payload;

  await Promise.allSettled([
    ...[...kediRecipients].map(([userId, p]) => sendPushToUser(userId, p)),
    ...tplStaffIds.map(id => sendPushToTplUser(id, tplPayload)),
  ]);
}

// ── EVENT-BASED NOTIFICATIONS ──

const tagFor = (shipmentId: number) => `shipment-${shipmentId}`;
const urlFor = (shipmentId: number) => `/shipments/${shipmentId}`;

// When a shipment is CREATED (Step 1)
export async function notifyShipmentCreated(shipmentId: number, destBranchId: number, trackingId: string): Promise<void> {
  const shipment = await loadShipment(shipmentId);
  if (!shipment) return;
  const branchName = await getBranchName(destBranchId);
  const base = { tag: tagFor(shipmentId), url: urlFor(shipmentId) };

  await notifyShipmentAudiences(shipment, "created",
    { ...base, title: "New Shipment Created", body: `Shipment ${trackingId} heading to ${branchName}. Waiting for warehouse processing.` },
    {
      creator: { ...base, title: "Shipment Created", body: `Your shipment (${trackingId}) to ${branchName} has been logged.` },
      warehouse: { ...base, title: "Warehouse: New Shipment", body: `Shipment ${trackingId} to ${branchName} needs items input and labeling.` },
      branch: { ...base, title: "Incoming Shipment", body: `A shipment (${trackingId}) is heading to your branch (${branchName}).` },
    },
  );
}

// When warehouse processes items and generates label
export async function notifyWarehouseProcessed(shipmentId: number, destBranchId: number, trackingId: string): Promise<void> {
  const shipment = await loadShipment(shipmentId);
  if (!shipment) return;
  const branchName = await getBranchName(destBranchId);

  await notifyShipmentAudiences(shipment, "warehouse_processed", {
    title: "Warehouse Processed",
    body: `Shipment ${trackingId} to ${branchName} is labeled and ready for 3PL assignment.`,
    tag: tagFor(shipmentId),
    url: urlFor(shipmentId),
  });
}

// When a driver is assigned to pick up and drop a shipment at a 3PL
export async function notifyDriverAssigned(shipmentId: number, driverId: number, trackingId: string, tplName: string): Promise<void> {
  await sendPushToUser(driverId, {
    title: "New Pickup Assigned",
    body: `Pick up shipment ${trackingId} and drop it at ${tplName}.`,
    tag: tagFor(shipmentId),
    url: urlFor(shipmentId),
  });
}

// When a 3PL is ASSIGNED (Step 4)
export async function notify3plAssigned(shipmentId: number, tplId: number, trackingId: string, destBranchId: number): Promise<void> {
  const shipment = await loadShipment(shipmentId);
  if (!shipment) return;
  const tplName = await getTplCompanyName(tplId);
  const branchName = await getBranchName(destBranchId);
  const base = { tag: tagFor(shipmentId), url: urlFor(shipmentId) };

  await notifyShipmentAudiences(shipment, "assigned_3pl",
    { ...base, title: "3PL Assigned", body: `${tplName} assigned to shipment ${trackingId} → ${branchName}.` },
    { tpl: { ...base, title: "New Job Assigned", body: `Pickup shipment ${trackingId} from Lagos HQ for delivery to ${branchName}.` } },
  );
}

// When the KEDI driver picks the shipment up from the warehouse
export async function notifyDriverPickedUp(shipmentId: number, driverName: string): Promise<void> {
  const shipment = await loadShipment(shipmentId);
  if (!shipment) return;
  await notifyShipmentAudiences(shipment, "driver_picked_up", {
    title: "Picked Up from Warehouse",
    body: `Driver ${driverName} picked up shipment ${shipment.trackingId || "N/A"} from the warehouse.`,
    tag: tagFor(shipmentId),
    url: urlFor(shipmentId),
  });
}

// When the KEDI driver drops the shipment at the 3PL. The 3PL is the one
// party who has to act next (confirm receipt), so their push says so.
export async function notifyDriverDroppedAtTpl(shipmentId: number, driverName: string, tplName: string): Promise<void> {
  const shipment = await loadShipment(shipmentId);
  if (!shipment) return;
  const trackingId = shipment.trackingId || "N/A";
  const base = { tag: tagFor(shipmentId), url: urlFor(shipmentId) };

  await notifyShipmentAudiences(shipment, "driver_dropped_at_3pl",
    { ...base, title: "Dropped at 3PL", body: `Driver ${driverName} dropped shipment ${trackingId} at ${tplName}. Waiting for the 3PL to confirm receipt.` },
    { tpl: { ...base, title: "Shipment Dropped Off", body: `Shipment ${trackingId} has been dropped at your office. Please confirm receipt.` } },
  );
}

// When 3PL updates status (pickup, receipt, location update, partial delivery, delay)
export async function notify3plStatusUpdate(shipmentId: number, tplId: number, trackingId: string, updateType: string, location?: string): Promise<void> {
  const shipment = await loadShipment(shipmentId);
  if (!shipment) return;
  const tplName = await getTplCompanyName(tplId);

  const updateLabels: Record<string, string> = {
    tpl_pickup_from_warehouse: `picked up from warehouse`,
    tpl_receipt_confirmed: `confirmed receipt`,
    tpl_location_update: `updated location: ${location || "in transit"}`,
    tpl_partial_delivery: `reported partial delivery`,
    tpl_full_delivery: `completed delivery`,
    delay_reported: `reported a delay`,
  };
  const actionText = updateLabels[updateType] || `updated status`;
  const event: ShipmentPushEvent =
    updateType === "tpl_pickup_from_warehouse" ? "tpl_picked_up"
    : updateType === "tpl_receipt_confirmed" ? "tpl_receipt_confirmed"
    : "tpl_progress";
  const base = { tag: tagFor(shipmentId), url: urlFor(shipmentId) };

  await notifyShipmentAudiences(shipment, event,
    { ...base, title: "3PL Update", body: `${tplName} ${actionText} for shipment ${trackingId}.` },
    { driver: { ...base, title: "Drop-off Confirmed", body: `${tplName} confirmed receipt of shipment ${trackingId}. Your delivery is complete.` } },
  );
}

// When the estimated delivery date is changed (by the 3PL or by KEDI staff)
export async function notifyDeliveryDateChanged(shipmentId: number, newDate: string, changedBy: string, exceptUserId?: number): Promise<void> {
  const shipment = await loadShipment(shipmentId);
  if (!shipment) return;
  const dateText = new Date(newDate).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });

  await notifyShipmentAudiences(shipment, "delivery_date_changed", {
    title: "Delivery Date Changed",
    body: `${changedBy} changed the estimated delivery date for shipment ${shipment.trackingId || "N/A"} to ${dateText}.`,
    tag: tagFor(shipmentId),
    url: urlFor(shipmentId),
  }, {}, exceptUserId);
}

// When 3PL DELIVERS (full delivery)
export async function notifyShipmentDelivered(shipmentId: number, destBranchId: number, trackingId: string): Promise<void> {
  const shipment = await loadShipment(shipmentId);
  if (!shipment) return;
  const branchName = await getBranchName(destBranchId);
  const base = { tag: tagFor(shipmentId), url: urlFor(shipmentId) };

  await notifyShipmentAudiences(shipment, "delivered",
    { ...base, title: "Shipment Delivered", body: `Shipment ${trackingId} delivered to ${branchName}. Waiting for BM acknowledgement.` },
    { branch: { ...base, title: "Shipment Delivered", body: `Shipment ${trackingId} has been delivered to ${branchName}. Please acknowledge receipt.` } },
  );
}

// When shipment is COMPLETED
export async function notifyShipmentCompleted(shipmentId: number, destBranchId: number, trackingId: string): Promise<void> {
  const shipment = await loadShipment(shipmentId);
  if (!shipment) return;
  const branchName = await getBranchName(destBranchId);
  const base = { tag: tagFor(shipmentId), url: urlFor(shipmentId) };

  await notifyShipmentAudiences(shipment, "completed",
    { ...base, title: "Shipment Completed", body: `Shipment ${trackingId} to ${branchName} is fully completed.` },
    { tpl: { ...base, title: "Delivery Confirmed", body: `${branchName} confirmed receipt of shipment ${trackingId}.` } },
  );
}

// When a shipment is CANCELLED
export async function notifyShipmentCancelled(shipmentId: number, cancelledBy: string, reason: string, exceptUserId?: number): Promise<void> {
  const shipment = await loadShipment(shipmentId);
  if (!shipment) return;

  await notifyShipmentAudiences(shipment, "cancelled", {
    title: "Shipment Cancelled",
    body: `Shipment ${shipment.trackingId || "N/A"} was cancelled by ${cancelledBy}. Reason: ${reason}`,
    tag: tagFor(shipmentId),
    url: urlFor(shipmentId),
  }, {}, exceptUserId);
}

// When shipment goes OVERDUE
export async function notifyShipmentOverdue(shipmentId: number, destBranchId: number, trackingId: string, daysOverdue: number): Promise<void> {
  const branchName = await getBranchName(destBranchId);

  await notifyOpsTeam({
    title: "⚠️ Shipment Overdue",
    body: `Shipment ${trackingId} to ${branchName} is ${daysOverdue} day(s) overdue!`,
    tag: tagFor(shipmentId),
    url: urlFor(shipmentId),
  });
}
