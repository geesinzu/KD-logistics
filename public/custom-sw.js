import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { clientsClaim } from "workbox-core";

// This placeholder will be replaced with the actual manifest at build time
// @ts-ignore
precacheAndRoute(self.__WB_MANIFEST);

// Clean up old caches
cleanupOutdatedCaches();

// Take control of clients immediately
self.skipWaiting();
clientsClaim();

// Push event - show notification
self.addEventListener("push", (event) => {
  try {
    const data = event.data?.json() || {};
    const title = data.title || "KEDI Logistics";
    const options = {
      body: data.body || "You have a new notification",
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-96x96.png",
      tag: data.tag || "default",
      requireInteraction: true,
      data: {
        url: data.url || "/",
      },
    };
    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    console.error("Push handling error:", err);
  }
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
