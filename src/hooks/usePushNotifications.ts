import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/providers/trpc";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications() {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isChecking, setIsChecking] = useState(true);

  const { data: vapidData } = trpc.push.vapidKey.useQuery();
  const subscribeMutation = trpc.push.subscribe.useMutation();
  const unsubscribeAllMutation = trpc.push.unsubscribeAll.useMutation();

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
    if (!isSupported || !vapidData?.key) return false;
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") return false;
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidData.key),
      });
      const json = subscription.toJSON();
      console.log("[Push] Subscribed:", json.endpoint?.substring(0, 40) + "...");
      await subscribeMutation.mutateAsync({
        endpoint: json.endpoint!,
        p256dh: json.keys?.p256dh!,
        auth: json.keys?.auth!,
        userAgent: navigator.userAgent,
      });
      setIsSubscribed(true);
      return true;
    } catch (err) {
      console.error("[Push] Subscription failed:", err);
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
  };
}
