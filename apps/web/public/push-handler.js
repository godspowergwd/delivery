self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }

  const options = {
    body: payload.body || 'Open the app to review this alert.',
    icon: '/pwa-192x192.png?v=red3',
    badge: '/pwa-64x64.png?v=red3',
    tag: `maames-alert-${payload.alertId}`,
    renotify: true,
    requireInteraction: true,
    vibrate: [500, 200, 500, 200, 900],
    data: {
      link: payload.link || '/',
      alertId: payload.alertId,
      orderId: payload.orderId,
      role: payload.role,
    },
    actions: [{ action: 'open', title: 'Open and accept' }],
  };

  event.waitUntil(self.registration.showNotification(payload.title || 'Maame’s Waakye alert', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destination = new URL(event.notification.data?.link || '/', self.location.origin).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (client.url.startsWith(self.location.origin) && 'focus' in client) {
        await client.navigate(destination);
        return client.focus();
      }
    }
    return self.clients.openWindow(destination);
  })());
});
