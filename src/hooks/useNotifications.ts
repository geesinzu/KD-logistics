import { useSyncExternalStore } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";

const SEEN_EVENT = "kedi:notifications-seen";

// `key` identifies whose "last seen" timestamp this is. KEDI staff pass their
// numeric user id; TPL users pass a `tpl_<id>`-namespaced string so the two
// never collide (both are separate auto-increment id spaces).
function keyFor(key?: string | number | null) {
  return `kedi_notifications_seen_at_${key ?? "anon"}`;
}

function getLastSeenAt(key?: string | number | null): number {
  try {
    const raw = localStorage.getItem(keyFor(key));
    return raw ? Number(raw) : 0;
  } catch {
    return 0;
  }
}

export function markNotificationsSeen(key?: string | number | null) {
  try {
    localStorage.setItem(keyFor(key), String(Date.now()));
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

// A handful of legacy tracking_events rows have created_at as NULL in the
// database, which new Date(null) parses as the Unix epoch rather than an
// invalid date. Returning 0 here just means such an event never counts as
// "newer than last seen" — correct enough, since we can't know when it
// really happened. See the same guard in Notifications.tsx for the
// user-visible version of this issue.
function getEventTime(createdAt: unknown): number {
  if (!createdAt) return 0;
  const time = new Date(createdAt as string).getTime();
  return isNaN(time) ? 0 : time;
}

export function useUnreadNotificationCount() {
  const { user } = useAuth();
  const { data } = useRecentActivity(30);
  const lastSeenAt = useSyncExternalStore(subscribeToSeenEvent, () => getLastSeenAt(user?.id));

  const events = data?.events ?? [];
  return events.filter(e => getEventTime(e.createdAt) > lastSeenAt).length;
}

// ── 3PL variants ──
// TPL users authenticate separately (ctx.tplUser, not ctx.user) via their own
// tpl.me query, so these mirror the hooks above rather than sharing useAuth().

export function useTplRecentActivity(limit = 30) {
  const { data: me } = trpc.tpl.me.useQuery();
  return trpc.shipment.recentActivity.useQuery(
    { limit },
    { enabled: !!me?.id, refetchInterval: 20_000 },
  );
}

export function useTplUnreadNotificationCount() {
  const { data: me } = trpc.tpl.me.useQuery();
  const { data } = useTplRecentActivity(30);
  const seenKey = me?.id ? `tpl_${me.id}` : null;
  const lastSeenAt = useSyncExternalStore(subscribeToSeenEvent, () => getLastSeenAt(seenKey));

  const events = data?.events ?? [];
  return events.filter(e => getEventTime(e.createdAt) > lastSeenAt).length;
}

export function markTplNotificationsSeen(tplUserId?: number | null) {
  markNotificationsSeen(tplUserId ? `tpl_${tplUserId}` : null);
}
