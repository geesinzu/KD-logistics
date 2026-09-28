// Who gets a push for each kind of shipment event. Kept as one table, with no
// database or web-push imports, so adding a role or an event is a one-line
// change here instead of a hunt through every mutation, and so the rules can
// be tested on their own.

export type PushAudience =
  | "ops"        // super_admin, admin, logistics_officer
  | "viewers"    // management staff with the viewer role
  | "branch"     // branch managers of the destination branch
  | "hub"        // branch managers of the hub the shipment is routed through
  | "creator"    // whoever created the shipment
  | "warehouse"  // warehouse_supply staff
  | "driver"     // the driver assigned to the shipment
  | "tpl";       // staff of the 3PL company assigned to the shipment

export type ShipmentPushEvent =
  | "created"
  | "warehouse_processed"
  | "assigned_3pl"
  | "driver_picked_up"
  | "driver_dropped_at_3pl"
  | "tpl_picked_up"
  | "tpl_receipt_confirmed"
  | "tpl_progress" // location update, partial delivery, delay reported
  | "delivery_date_changed"
  | "delivered"
  | "delivered_to_hub"
  | "hub_acknowledged"
  | "onward_dispatched"
  | "branch_marked_delivered" // a branch recorded receipt because the 3PL never did
  | "completed"
  | "cancelled";

// On a direct route the "hub" audience is simply empty.
const FOLLOWERS: PushAudience[] = ["ops", "viewers", "branch", "hub", "creator"];

export const PUSH_AUDIENCES: Record<ShipmentPushEvent, PushAudience[]> = {
  created: [...FOLLOWERS, "warehouse"],
  warehouse_processed: FOLLOWERS,
  assigned_3pl: [...FOLLOWERS, "tpl"],
  driver_picked_up: [...FOLLOWERS, "warehouse"],
  driver_dropped_at_3pl: [...FOLLOWERS, "tpl"],
  tpl_picked_up: FOLLOWERS,
  tpl_receipt_confirmed: [...FOLLOWERS, "driver"],
  tpl_progress: FOLLOWERS,
  delivery_date_changed: FOLLOWERS,
  delivered: FOLLOWERS,
  delivered_to_hub: FOLLOWERS,
  hub_acknowledged: FOLLOWERS,
  onward_dispatched: FOLLOWERS,
  branch_marked_delivered: [...FOLLOWERS, "tpl"],
  completed: [...FOLLOWERS, "tpl"],
  cancelled: [...FOLLOWERS, "warehouse", "driver", "tpl"],
};

export interface PushPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
}

// Most specific first: when one person fits several audiences (a branch
// manager who also created the shipment) they get ONE push, worded for the
// audience that most needs to act. "tpl" is resolved separately because 3PL
// staff live in a different id space from KEDI users.
const KEDI_AUDIENCE_PRIORITY: PushAudience[] = ["hub", "branch", "driver", "warehouse", "creator", "ops", "viewers"];

export function resolveKediRecipients(
  event: ShipmentPushEvent,
  idsByAudience: Partial<Record<PushAudience, (number | null | undefined)[]>>,
  payload: PushPayload,
  overrides: Partial<Record<PushAudience, PushPayload>> = {},
  exceptUserId?: number,
): Map<number, PushPayload> {
  const audiences = new Set(PUSH_AUDIENCES[event]);
  const recipients = new Map<number, PushPayload>();
  for (const audience of KEDI_AUDIENCE_PRIORITY) {
    if (!audiences.has(audience)) continue;
    for (const id of idsByAudience[audience] ?? []) {
      if (id == null || id === exceptUserId || recipients.has(id)) continue;
      recipients.set(id, overrides[audience] ?? payload);
    }
  }
  return recipients;
}
