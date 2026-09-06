import { useEffect } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import { useRecentActivity, markNotificationsSeen } from "@/hooks/useNotifications";
import { Card, CardContent } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowLeft, Bell, Package, ClipboardList, Tag, Truck, MapPin, CheckCircle2, AlertTriangle,
} from "lucide-react";

const EVENT_ICONS: Record<string, typeof Bell> = {
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

const EVENT_LABELS: Record<string, string> = {
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

export default function Notifications() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, isLoading } = useRecentActivity(50);

  useEffect(() => {
    markNotificationsSeen(user?.id);
  }, [user?.id]);

  const events = data?.events ?? [];

  return (
    <div className="max-w-lg mx-auto">
      <div className="sticky top-0 z-40 bg-[#0F172A] text-white px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1"><ArrowLeft size={20} /></button>
        <h1 className="text-sm font-bold">Notifications</h1>
      </div>

      <div className="p-4 space-y-2">
        {isLoading && <p className="text-sm text-gray-400 text-center py-8">Loading...</p>}
        {!isLoading && events.length === 0 && (
          <div className="text-center py-12">
            <Bell size={32} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm text-gray-400">No activity yet</p>
          </div>
        )}
        {events.map(ev => {
          const Icon = EVENT_ICONS[ev.eventType] || Bell;
          return (
            <Card
              key={ev.id}
              className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate(`/shipments/${ev.shipmentId}`)}
            >
              <CardContent className="p-3 flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                  <Icon size={16} className="text-[#003B7A]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-[#1E293B]">{EVENT_LABELS[ev.eventType] || ev.eventType}</span>
                    <span className="text-[10px] text-gray-400 shrink-0">
                      {formatDistanceToNow(new Date(ev.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{ev.notes}</p>
                  <p className="text-[10px] text-gray-400 mt-1">{ev.trackingId}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
