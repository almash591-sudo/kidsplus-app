/* global self, fetch */
// Push-уведомления кабинета (подключается в service worker через importScripts).
// Имени ребёнка в уведомлении нет — вместо него {child}; имя берём у своего сервера.
self.addEventListener('push', (event) => {
  let msg;
  try {
    msg = event.data ? event.data.json() : null;
  } catch {
    msg = null;
  }
  if (!msg) return;
  event.waitUntil(
    (async () => {
      let child = 'Ребёнок';
      if (msg.childId) {
        try {
          const res = await fetch('/api/parent/children', { credentials: 'same-origin' });
          if (res.ok) {
            const found = (await res.json()).find((c) => c.id === msg.childId);
            if (found) child = found.nickname;
          }
        } catch {
          // нет связи — без имени
        }
      }
      const fill = (s) => String(s || '').replaceAll('{child}', child);
      await self.registration.showNotification(fill(msg.title), {
        body: fill(msg.body),
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: msg.kind + (msg.childId ? `-${msg.childId}` : ''),
        data: { url: msg.url || '/' },
        // Звонок не пропадает сам и вибрирует, пока не ответят.
        ...(msg.kind === 'call'
          ? { requireInteraction: true, renotify: true, vibrate: [400, 200, 400, 200, 400] }
          : {}),
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of all) {
        if ('focus' in c) {
          await c.focus();
          if ('navigate' in c) await c.navigate(url);
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
