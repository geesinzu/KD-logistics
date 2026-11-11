import { useEffect } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import { useRecentActivity, markNotificationsSeen } from "@/hooks/useNotifications";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Bell } from "lucide-react";
import { EVENT_ICONS, EVENT_LABELS, formatEventTime } from "@/lib/notificationEvents";

export default function Notifications() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, isLoading, error, refetch } = useRecentActivity(50);

  useEffect(() => {
    markNotificationsSeen(user?.id);
  }, [user?.id]);

  const events = data?.events ?? [];

  return (
    <div className="workflow-page ">
      <div className="workflow-header">
        <button onClick={() => navigate(-1)} className="workflow-back" aria-label="Go back"><ArrowLeft size={20} /></button>
        <h1 className="workflow-title">Notifications</h1>
      </div>

      <div className="p-4 space-y-2">
        {error && <p role="alert" className="operations-message">Could not load activity. <button className="underline" onClick={() => void refetch()}>Try again</button></p>}
        {isLoading && <p className="text-sm text-gray-400 text-center py-8">Loading...</p>}
        {!isLoading && !error && events.length === 0 && (
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
              role="link" tabIndex={0} onKeyDown={e => { if (e.key === "Enter") navigate(`/shipments/${ev.shipmentId}`); }}
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
                      {formatEventTime(ev.createdAt, ev.estimatedTime)}
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
