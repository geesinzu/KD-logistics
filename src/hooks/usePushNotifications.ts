import { useState, useEffect, useCallback, useRef } from "react";
import { registerWithExpiryRecovery, withPushRegistrationLock } from "@/lib/pushRegistration";
import { trpc } from "@/providers/trpc";

// iOS only exposes PushManager when the page is running as an installed
// Home Screen app (Safari's "Add to Home Screen"), never in a regular
// Safari tab or a link opened from Mail/Messages -- even after installing,
// so the two most common "nothing shows up" reports are actually different
// problems: never installed, vs. installed but opened the wrong way.
function isIosDevice(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); // iPadOS reports as a Mac
}

function isStandaloneDisplay(): boolean {
  return (navigator as unknown as { standalone?: boolean }).standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches;
}

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

// A subscription is permanently bound to the server key it was created with.
// If the server's VAPID keys were set or replaced after this phone subscribed,
// the push service refuses every send (401/403) and the phone never finds out.
// When the key can't be read we assume it matches rather than tear down a
// subscription that may be perfectly fine.
function subscriptionMatchesKey(sub: PushSubscription, base64Key: string): boolean {
  const current = sub.options?.applicationServerKey;
  if (!current) return true;
  const a = new Uint8Array(current);
  const b = urlBase64ToUint8Array(base64Key);
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export interface SubscribeResult {
  ok: boolean;
  // False when the server accepted the registration but the push service
  // refused the test message (a phone that will never receive anything).
  testDelivered?: boolean;
  failureCode?: number;
}

export function usePushNotifications(variant: "kedi" | "tpl" = "kedi") {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isRepairing, setIsRepairing] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);
  // Only meaningful when isSupported is false -- explains WHY, so the UI can
  // say something actionable instead of just hiding the whole section.
  const [notSupportedReason, setNotSupportedReason] = useState<"ios_not_installed" | "unsupported_browser" | null>(null);

  const utils = trpc.useUtils();
  const { data: vapidData, isLoading: vapidLoading } = trpc.push.vapidKey.useQuery();
  // Both variants' subscribe mutations are declared unconditionally (rules of
  // hooks) — only the one matching `variant` is ever actually invoked.
  const kediSubscribeMutation = trpc.push.subscribe.useMutation();
  const tplSubscribeMutation = trpc.push.subscribeTpl.useMutation();
  const subscribeMutation = variant === "tpl" ? tplSubscribeMutation : kediSubscribeMutation;
  const unsubscribeMutation = trpc.push.unsubscribe.useMutation();

  // Check existing subscription on mount
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      if (typeof window !== "undefined") {
        setNotSupportedReason(isIosDevice() && !isStandaloneDisplay() ? "ios_not_installed" : "unsupported_browser");
      }
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

  // Registers a browser subscription with the server as the current user.
  const registerWithServer = useCallback(async (subscription: PushSubscription, silent: boolean): Promise<SubscribeResult> => {
    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      setLastError("incomplete_subscription");
      return { ok: false };
    }
    const result = await subscribeMutation.mutateAsync({
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      userAgent: navigator.userAgent,
      silent,
    });
    return { ok: true, testDelivered: result.testDelivered, failureCode: result.failureCode };
  }, [subscribeMutation]);

  // The phone's own browser can say "subscribed" while the server sends
  // nothing to it: the key changed since it subscribed, the server row was
  // cleaned up, or the phone was last registered by a different person. The
  // toggle would then read "enabled" forever. Once per mount, check the phone
  // against the server and quietly repair whichever of those it is.
  const reconciled = useRef(false);
  useEffect(() => {
    if (!isSupported || isChecking || !isSubscribed || !vapidData?.configured || !vapidData.key || reconciled.current) return;
    reconciled.current = true;
    const serverKey = vapidData.key;

    setIsRepairing(true);
    void withPushRegistrationLock(async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (!subscription) { setIsSubscribed(false); return; }
        const status = await utils.push.status.fetch({ endpoint: subscription.endpoint, kind: variant });
        if (!subscriptionMatchesKey(subscription, serverKey) || !status.registeredToMe) {
          // A 404/410 send removes its server row, but the browser can keep
          // returning the dead endpoint. Renew it instead of silently storing
          // that same endpoint again. No welcome push during background repair.
          if (!await subscription.unsubscribe()) throw new Error("Could not renew push subscription");
          setIsSubscribed(false);
          if (Notification.permission !== "granted") return;
          const fresh = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(serverKey),
          });
          const result = await registerWithServer(fresh, true);
          setIsSubscribed(result.ok);
          if (result.ok) setLastError(null);
        }
      } catch (err) {
        console.error("[Push] Reconcile failed:", err);
        setLastError(err instanceof Error ? err.message : "push_repair_failed");
      } finally {
        setIsRepairing(false);
      }
    });
  }, [isSupported, isChecking, isSubscribed, vapidData, variant, utils, registerWithServer]);

  const subscribe = useCallback(async (): Promise<SubscribeResult> => {
    setLastError(null);
    // vapidData.key is the public key alone, returned unconditionally by the
    // server even when it's missing its private counterpart. vapidData.configured
    // reflects whether the server can actually SEND anything — without checking
    // it, subscribing "succeeds" (permission granted, subscription stored) but
    // every push silently no-ops server-side forever, with no error anywhere.
    if (!isSupported) { setLastError("not_supported"); return { ok: false }; }
    if (!vapidData?.key || !vapidData?.configured) { setLastError("server_not_configured"); return { ok: false }; }
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") { setLastError(`permission_${perm}`); return { ok: false }; }
      return await withPushRegistrationLock(async () => {
        const registration = await navigator.serviceWorker.ready;
        const renew = () => registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidData.key),
        });
        const subscription = await renew();
        const result = await registerWithExpiryRecovery(subscription,
          sub => registerWithServer(sub, false), renew);
        setIsSubscribed(result.ok);
        if (result.testDelivered === false) setLastError(`test_push_failed_${result.failureCode ?? "unknown"}`);
        else if (result.ok) setLastError(null);
        return result;
      });
    } catch (err) {
      setIsSubscribed(false);
      console.error("[Push] Subscription failed:", err);
      setLastError(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
      return { ok: false };
    }
  }, [isSupported, vapidData, registerWithServer]);

  const unsubscribe = useCallback(async () => {
    try {
      return await withPushRegistrationLock(async () => {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          // Only this device: disabling on one phone must not switch off the
          // same person's other phones.
          await unsubscribeMutation.mutateAsync({ endpoint: subscription.endpoint });
          await subscription.unsubscribe();
        }
        setIsSubscribed(false);
        setLastError(null);
        console.log("[Push] Unsubscribed");
        return true;
      });
    } catch (err) {
      console.error("[Push] Unsubscribe failed:", err);
      return false;
    }
  }, [unsubscribeMutation]);

  return {
    isSupported,
    notSupportedReason,
    isSubscribed,
    permission,
    subscribe,
    unsubscribe,
    // Includes the server-key lookup, so screens don't flash "not set up on
    // the server yet" for the moment before that answer arrives.
    isConfiguring: subscribeMutation.isPending || unsubscribeMutation.isPending || isChecking || isRepairing || vapidLoading,
    // True once the vapidKey query has resolved and the server has both VAPID
    // keys set. False (not undefined) while loading, so callers that only
    // want to know "definitely not available" can check `=== false`.
    isServerConfigured: vapidData?.configured ?? false,
    // The specific reason the last subscribe() call failed, for diagnosing
    // device/browser-specific failures (permission denied vs. server not
    // configured vs. a genuine browser/PushManager error), or that the test
    // message never arrived (test_push_failed_<push service status code>).
    lastError,
  };
}

// Repairs a phone's push registration in the background for anyone who never
// opens the Profile page, which is where the toggle (and so the hook's own
// reconcile) otherwise lives.
export function usePushSelfHeal() {
  usePushNotifications();
}
