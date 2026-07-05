import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { clientsClaim } from "workbox-core";

// @ts-ignore
precacheAndRoute(self.__WB_MANIFEST);

cleanupOutdatedCaches();

self.skipWaiting();
clientsClaim();

// Push event - show notification
// CRITICAL: Must ALWAYS call showNotification(), even on error.
// Android falls back to generic Chrome card if we don't.
self.addEventListener("push", (event) => {
  let title = "KEDI Logistics";
  let body = "You have a new notification";
  let tag = "default";
  let url = "/";

  try {
    if (event.data) {
      const data = event.data.json();
      title = data.title || title;
      body = data.body || body;
      tag = data.tag || tag;
      url = data.url || url;
    }
  } catch (err) {
    console.error("[SW] Push data parse error:", err);
    // Continue with defaults — we MUST show a notification
  }

  const options = {
    body,
    icon: "/icons/icon-192x192.png",
    badge: "/icons/icon-96x96.png",
    tag,                          // Unique tag per event (shipment-id-eventType-timestamp)
    requireInteraction: false,    // Auto-dismiss after a while (better UX)
    renotify: true,              // Always play sound/vibrate
    silent: false,               // Ensure sound plays
    vibrate: [200, 100, 200],    // Vibration pattern for mobile
    data: { url },
  };

  // Always waitUntil — required for Android to not show generic fallback
  event.waitUntil(
    self.registration.showNotification(title, options).catch((err) => {
      console.error("[SW] showNotification failed:", err);
    })
  );
});

// Notification click - open the app
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(urlToOpen);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    })
  );
});
