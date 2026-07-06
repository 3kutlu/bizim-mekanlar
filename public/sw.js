const NOTIFICATION_ICON = "/icons/icon-192.png";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function getPushPayload(event) {
  try {
    const payload = event.data?.json?.();

    if (payload && typeof payload === "object") {
      return payload;
    }
  } catch {
    // Fall through to the safe default notification payload.
  }

  return {};
}

self.addEventListener("push", (event) => {
  const payload = getPushPayload(event);
  const title = String(payload.title || "Bizim Mekanlar");
  const targetUrl = String(payload.url || "/");

  event.waitUntil(
    self.registration.showNotification(title, {
      body: String(payload.body || "Yeni bir gelişmen var."),
      icon: NOTIFICATION_ICON,
      badge: NOTIFICATION_ICON,
      tag: String(payload.tag || `bizim-mekanlar-${Date.now()}`),
      renotify: false,
      data: {
        url: targetUrl,
      },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = new URL(
    String(event.notification.data?.url || "/"),
    self.location.origin
  ).href;

  event.waitUntil(
    (async () => {
      const clientWindows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const existingClient = clientWindows.find(
        (client) => new URL(client.url).origin === self.location.origin
      );

      if (existingClient) {
        if (typeof existingClient.navigate === "function") {
          try {
            await existingClient.navigate(targetUrl);
          } catch {
            // Focusing the existing app is still more useful than failing the click.
          }
        }

        return existingClient.focus();
      }

      return self.clients.openWindow(targetUrl);
    })()
  );
});

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      let subscription = await self.registration.pushManager.getSubscription();

      if (!subscription && event.oldSubscription?.options) {
        subscription = await self.registration.pushManager.subscribe(
          event.oldSubscription.options
        );
      }

      const clientWindows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      clientWindows.forEach((client) => {
        client.postMessage({
          type: "PUSH_SUBSCRIPTION_CHANGED",
          subscription: subscription?.toJSON?.() ?? null,
        });
      });
    })()
  );
});
