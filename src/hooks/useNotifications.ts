import { useSyncExternalStore } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";

const SEEN_EVENT = "kedi:notifications-seen";

function keyFor(userId?: number | null) {
  return `kedi_notifications_seen_at_${userId ?? "anon"}`;
}

function getLastSeenAt(userId?: number | null): number {
  try {
    const raw = localStorage.getItem(keyFor(userId));
    return raw ? Number(raw) : 0;
  } catch {
    return 0;
  }
}

export function markNotificationsSeen(userId?: number | null) {
  try {
    localStorage.setItem(keyFor(userId), String(Date.now()));
  } catch {
    // localStorage unavailable (private mode, etc.) — badge just won't clear
  }
  window.dispatchEvent(new Event(SEEN_EVENT));
}

export function useRecentActivity(limit = 30) {
  const { user } = useAuth();
  return trpc.shipment.recentActivity.useQuery(
    { limit },
    { enabled: !!user, refetchInterval: 20_000 },
  );
}

function subscribeToSeenEvent(callback: () => void) {
  window.addEventListener(SEEN_EVENT, callback);
  return () => window.removeEventListener(SEEN_EVENT, callback);
}

export function useUnreadNotificationCount() {
  const { user } = useAuth();
  const { data } = useRecentActivity(30);
  const lastSeenAt = useSyncExternalStore(subscribeToSeenEvent, () => getLastSeenAt(user?.id));

  const events = data?.events ?? [];
  return events.filter(e => new Date(e.createdAt as unknown as string).getTime() > lastSeenAt).length;
}
