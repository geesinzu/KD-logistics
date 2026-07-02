import { useState } from "react";
import { useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bell, ArrowLeft, Package, Truck, CheckCircle2, MapPin, AlertTriangle } from "lucide-react";

const TYPE_ICONS: Record<string, any> = {
  driver_assigned: Truck,
  tpl_pickup_request: Truck,
  driver_pickup: CheckCircle2,
  shipment_at_3pl: Package,
  tpl_confirmed: CheckCircle2,
  delivery_complete: MapPin,
  delay_reported: AlertTriangle,
  default: Bell,
};

const TYPE_COLORS: Record<string, string> = {
  driver_assigned: "bg-blue-100 text-blue-700",
  tpl_pickup_request: "bg-indigo-100 text-indigo-700",
  driver_pickup: "bg-green-100 text-green-700",
  shipment_at_3pl: "bg-orange-100 text-orange-700",
  tpl_confirmed: "bg-green-100 text-green-700",
  delivery_complete: "bg-purple-100 text-purple-700",
  delay_reported: "bg-red-100 text-red-700",
  default: "bg-gray-100 text-gray-700",
};

export default function Notifications() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.notification.list.useQuery(
    { page: 1, limit: 50, unreadOnly: filter === "unread" }
  );
  const { data: unreadCount } = trpc.notification.unreadCount.useQuery();

  const markReadMutation = trpc.notification.markRead.useMutation({
    onSuccess: () => { utils.notification.list.invalidate(); utils.notification.unreadCount.invalidate(); },
  });
  const markAllReadMutation = trpc.notification.markAllRead.useMutation({
    onSuccess: () => { utils.notification.list.invalidate(); utils.notification.unreadCount.invalidate(); },
  });

  const notifications = data?.notifications || [];

  const timeAgo = (date: Date | string | null) => {
    if (!date) return "";
    const d = new Date(date);
    const now = new Date();
    const diffMins = Math.floor((now.getTime() - d.getTime()) / 60000);
    if (diffMins < 1) return "now";
    if (diffMins < 60) return `${diffMins}m`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h`;
    return `${Math.floor(diffHours / 24)}d`;
  };

  return (
    <div className="max-w-lg mx-auto">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-[#0F172A] text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1"><ArrowLeft size={20} /></button>
          <div className="flex items-center gap-2">
            <Bell size={18} />
            <h1 className="text-sm font-bold">Notifications</h1>
            {unreadCount ? <Badge className="bg-red-500 text-white text-[10px]">{unreadCount}</Badge> : null}
          </div>
        </div>
        {unreadCount ? (
          <button onClick={() => markAllReadMutation.mutate()} className="text-[11px] text-white/70 hover:text-white">
            Mark all read
          </button>
        ) : null}
      </div>

      {/* Filter */}
      <div className="flex gap-2 p-3">
        <button
          onClick={() => setFilter("all")}
          className={`px-4 py-1.5 rounded-full text-xs font-medium ${filter === "all" ? "bg-[#003B7A] text-white" : "bg-gray-100 text-gray-600"}`}
        >
          All
        </button>
        <button
          onClick={() => setFilter("unread")}
          className={`px-4 py-1.5 rounded-full text-xs font-medium ${filter === "unread" ? "bg-[#003B7A] text-white" : "bg-gray-100 text-gray-600"}`}
        >
          Unread {unreadCount ? `(${unreadCount})` : ""}
        </button>
      </div>

      {/* Notifications list */}
      {isLoading && <p className="text-center py-8 text-gray-400">Loading...</p>}
      {!isLoading && notifications.length === 0 && (
        <div className="text-center py-12">
          <Bell size={48} className="mx-auto text-gray-200 mb-3" />
          <p className="text-gray-400 text-sm">No notifications</p>
        </div>
      )}
      <div className="px-3 pb-4 space-y-2">
        {notifications.map((n: any) => {
          const Icon = TYPE_ICONS[n.type] || TYPE_ICONS.default;
          const colorClass = TYPE_COLORS[n.type] || TYPE_COLORS.default;
          const isUnread = !n.read;
          return (
            <Card
              key={n.id}
              className={`border-0 shadow-sm cursor-pointer transition-colors ${isUnread ? "bg-blue-50/50" : "bg-white"}`}
              onClick={() => { if (isUnread) markReadMutation.mutate({ id: n.id }); }}
            >
              <CardContent className="p-3 flex gap-3">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                  <Icon size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm ${isUnread ? "font-semibold" : "font-medium"}`}>{n.title}</p>
                    <span className="text-[10px] text-gray-400 flex-shrink-0">{timeAgo(n.createdAt)}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{n.message}</p>
                  {n.trackingId && (
                    <p className="text-[10px] text-[#003B7A] font-medium mt-1">{n.trackingId}</p>
                  )}
                </div>
                {isUnread && <div className="w-2 h-2 bg-[#003B7A] rounded-full flex-shrink-0 mt-1.5" />}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
