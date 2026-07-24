// sw-signals.js — deploy at your site root (e.g. /sw-signals.js) so its
// scope covers the whole app. Registered from signals.js's
// `_sigRequestPush()` via `navigator.serviceWorker.register('/sw-signals.js')`.
// Displays whatever payload the notify-subscribers Edge Function pushes.

self.addEventListener('push', (event) => {
  let payload = { title: 'NxTGen Signals', body: 'You have a new signal notification', data: {} };
  try { if (event.data) payload = { ...payload, ...event.data.json() }; } catch (e) { /* non-JSON payload — use defaults */ }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: 'nxt-signal',
      data: payload.data || {}
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const signalId = event.notification.data && event.notification.data.signal_id;
  const url = signalId ? `/?signal=${signalId}#signals` : '/#signals';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
