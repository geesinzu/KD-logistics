import {
  Bell, Package, ClipboardList, Tag, Truck, MapPin, CheckCircle2, AlertTriangle,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export const EVENT_ICONS: Record<string, typeof Bell> = {
  created: Package,
  items_input: ClipboardList,
  label_generated: Tag,
  assigned_to_3pl: Truck,
  driver_pickup_scan: Truck,
  driver_pickup_confirmed: Truck,
  driver_dropoff_at_3pl: MapPin,
  tpl_pickup_from_warehouse: Truck,
  tpl_receipt_confirmed: CheckCircle2,
  tpl_location_update: MapPin,
  tpl_partial_delivery: AlertTriangle,
  tpl_full_delivery: CheckCircle2,
  delay_reported: AlertTriangle,
  cancelled: AlertTriangle,
  note_added: ClipboardList,
  delivery_acknowledged: CheckCircle2,
};

export const EVENT_LABELS: Record<string, string> = {
  created: "Shipment Created",
  items_input: "Items Logged",
  label_generated: "Label Generated",
  assigned_to_3pl: "Assigned to 3PL",
  driver_pickup_scan: "Driver Pickup Scanned",
  driver_pickup_confirmed: "Driver Picked Up",
  driver_dropoff_at_3pl: "Dropped at 3PL",
  tpl_pickup_from_warehouse: "3PL Picked Up",
  tpl_receipt_confirmed: "3PL Confirmed Receipt",
  tpl_location_update: "Location Update",
  tpl_partial_delivery: "Partial Delivery",
  tpl_full_delivery: "Delivered",
  delay_reported: "Delay Reported",
  cancelled: "Cancelled",
  note_added: "Note Added",
  delivery_acknowledged: "Delivery Acknowledged",
};

// A handful of legacy tracking_events rows have created_at as NULL in the
// database (predates the column's NOT NULL DEFAULT CURRENT_TIMESTAMP being
// applied on the real MariaDB table). new Date(null) evaluates to the Unix
// epoch, which formatDistanceToNow then renders as a coherent-looking but
// wrong "56 years ago" — so this needs an explicit guard, not a try/catch
// around the rendering call.
export function formatEventTime(createdAt: unknown): string {
  if (!createdAt) return "Unknown time";
  const date = new Date(createdAt as string);
  if (isNaN(date.getTime()) || date.getFullYear() < 2000) return "Unknown time";
  return formatDistanceToNow(date, { addSuffix: true });
}
