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

  const { data: vapidData } = trpc.push.vapidKey.useQuery();
  const subscribeMutation = trpc.push.subscribe.useMutation();
  const unsubscribeAllMutation = trpc.push.unsubscribeAll.useMutation();

  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window) {
      setIsSupported(true);
      setPermission(Notification.permission);
    }
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
      await subscribeMutation.mutateAsync({
        endpoint: json.endpoint!,
        p256dh: json.keys?.p256dh!,
        auth: json.keys?.auth!,
        userAgent: navigator.userAgent,
      });
      setIsSubscribed(true);
      return true;
    } catch (err) {
      console.error("Push subscription failed:", err);
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
      return true;
    } catch (err) {
      console.error("Unsubscribe failed:", err);
      return false;
    }
  }, [unsubscribeAllMutation]);

  return {
    isSupported,
    isSubscribed,
    permission,
    subscribe,
    unsubscribe,
    isConfiguring: subscribeMutation.isPending || unsubscribeAllMutation.isPending,
  };
}
