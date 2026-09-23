import {
  Bell, Package, ClipboardList, Tag, Truck, MapPin, CheckCircle2, AlertTriangle,
} from "lucide-react";

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
};
