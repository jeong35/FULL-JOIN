self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  const title = typeof payload.title === 'string' ? payload.title : '오늘은 어떤 코디로 입을까요?';
  const body = typeof payload.body === 'string' ? payload.body : '오딧에서 오늘의 코디를 골라보세요.';
  const url = typeof payload.url === 'string' && payload.url.startsWith('/') ? payload.url : '/recommend?notification=1';
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'odit-next-look',
    renotify: false,
    data: { url },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/recommend?notification=1', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows[0];
    if (existing) {
      await existing.navigate(target);
      return existing.focus();
    }
    return self.clients.openWindow(target);
  })());
});
