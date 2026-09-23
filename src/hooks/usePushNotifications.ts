import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/providers/trpc";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications(variant: "kedi" | "tpl" = "kedi") {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isChecking, setIsChecking] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);

  const { data: vapidData } = trpc.push.vapidKey.useQuery();
  // Both variants' mutations are declared unconditionally (rules of hooks) —
  // only the one matching `variant` is ever actually invoked.
  const kediSubscribeMutation = trpc.push.subscribe.useMutation();
  const kediUnsubscribeMutation = trpc.push.unsubscribeAll.useMutation();
  const tplSubscribeMutation = trpc.push.subscribeTpl.useMutation();
  const tplUnsubscribeMutation = trpc.push.unsubscribeAllTpl.useMutation();
  const subscribeMutation = variant === "tpl" ? tplSubscribeMutation : kediSubscribeMutation;
  const unsubscribeAllMutation = variant === "tpl" ? tplUnsubscribeMutation : kediUnsubscribeMutation;

  // Check existing subscription on mount
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setIsChecking(false);
      return;
    }

    setIsSupported(true);
    setPermission(Notification.permission);

    // Check if browser already has a push subscription
    navigator.serviceWorker.ready.then((registration) => {
      registration.pushManager.getSubscription().then((existingSub) => {
        if (existingSub) {
          console.log("[Push] Found existing subscription:", existingSub.endpoint.substring(0, 40) + "...");
          setIsSubscribed(true);
        } else {
          console.log("[Push] No existing subscription found");
        }
        setIsChecking(false);
      }).catch((err) => {
        console.error("[Push] Error checking subscription:", err);
        setIsChecking(false);
      });
    }).catch((err) => {
      console.error("[Push] Service worker not ready:", err);
      setIsChecking(false);
    });
  }, []);

  const subscribe = useCallback(async () => {
    setLastError(null);
    // vapidData.key is the public key alone, returned unconditionally by the
    // server even when it's missing its private counterpart. vapidData.configured
    // reflects whether the server can actually SEND anything — without checking
    // it, subscribing "succeeds" (permission granted, subscription stored) but
    // every push silently no-ops server-side forever, with no error anywhere.
    if (!isSupported) { setLastError("not_supported"); return false; }
    if (!vapidData?.key || !vapidData?.configured) { setLastError("server_not_configured"); return false; }
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") { setLastError(`permission_${perm}`); return false; }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidData.key),
      });
      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        setLastError("incomplete_subscription");
        return false;
      }
      console.log("[Push] Subscribed:", json.endpoint.substring(0, 40) + "...");
      await subscribeMutation.mutateAsync({
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        userAgent: navigator.userAgent,
      });
      setIsSubscribed(true);
      return true;
    } catch (err) {
      console.error("[Push] Subscription failed:", err);
      setLastError(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
      return false;
    }
  }, [isSupported, vapidData, subscribeMutation]);

  const unsubscribe = useCallback(async () => {
    try {
      await unsubscribeAllMutation.mutateAsync();
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) await subscription.unsubscribe();
      setIsSubscribed(false);
      console.log("[Push] Unsubscribed");
      return true;
    } catch (err) {
      console.error("[Push] Unsubscribe failed:", err);
      return false;
    }
  }, [unsubscribeAllMutation]);

  return {
    isSupported,
    isSubscribed,
    permission,
    subscribe,
    unsubscribe,
    isConfiguring: subscribeMutation.isPending || unsubscribeAllMutation.isPending || isChecking,
    // True once the vapidKey query has resolved and the server has both VAPID
    // keys set. False (not undefined) while loading, so callers that only
    // want to know "definitely not available" can check `=== false`.
    isServerConfigured: vapidData?.configured ?? false,
    // The specific reason the last subscribe() call failed, for diagnosing
    // device/browser-specific failures (permission denied vs. server not
    // configured vs. a genuine browser/PushManager error).
    lastError,
  };
}
