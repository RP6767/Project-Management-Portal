// sw.js — PMP Portal Service Worker
// Handles background push notifications

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim());
});

// Handle incoming push events (from Firebase Cloud Messaging or manual push)
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch { data = { title: 'PMP Notification', body: event.data.text() }; }

  const options = {
    body: data.body || '',
    icon: data.icon || '/icon-192.png',
    badge: '/badge-72.png',
    tag: data.tag || 'pmp-notif',
    renotify: true,
    vibrate: [200, 100, 200],
    data: { url: data.url || '/', chatId: data.chatId },
    actions: [
      { action: 'open', title: '💬 Open Chat' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };

  event.waitUntil(self.registration.showNotification(data.title || 'PMP Portal', options));
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const chatId = event.notification.data?.chatId;
  const urlToOpen = self.location.origin + (chatId ? `/?chat=${chatId}` : '/');

  if (event.action === 'dismiss') return;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.postMessage({ type: 'OPEN_CHAT', chatId });
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(urlToOpen);
    })
  );
});

// Handle messages from the main app (for local/foreground-triggered system notifs)
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SHOW_NOTIFICATION') {
    const { title, body, chatId, fromName } = event.data;
    self.registration.showNotification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      tag: 'pmp-mention-' + Date.now(),
      renotify: true,
      vibrate: [150, 50, 150],
      data: { chatId },
      actions: [
        { action: 'open', title: '💬 Reply' },
        { action: 'dismiss', title: 'Dismiss' }
      ]
    });
  }
});
