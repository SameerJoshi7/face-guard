/**
 * FaceGuard Service Worker
 * Handles: PWA offline caching + browser push notification display
 */

const CACHE_NAME = 'faceguard-v1';
const STATIC_ASSETS = ['./', './index.html', './manifest.json'];

// ── Install: pre-cache static shell ─────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

// ── Activate: clean up old caches ────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

// ── Fetch: serve from cache with network fallback ────────────────────────────
self.addEventListener('fetch', (event) => {
  // Only cache GET requests for same-origin, non-API resources
  if (
    event.request.method !== 'GET' ||
    event.request.url.includes('ntfy.sh') ||
    event.request.url.includes('mediapipe') ||
    event.request.url.includes('googleapis') ||
    event.request.url.includes('jsdelivr')
  ) {
    return; // Pass through — don't cache external resources
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request)),
  );
});

// ── Push: display notification from push event ───────────────────────────────
self.addEventListener('push', (event) => {
  let data = { title: '🚨 FaceGuard Alert', body: 'Face detected!', icon: './icons/icon-192.png' };

  try {
    if (event.data) Object.assign(data, event.data.json());
  } catch {
    // Fallback to defaults
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon ?? './icons/icon-192.png',
      badge: './icons/icon-192.png',
      tag: 'faceguard-alert',
      requireInteraction: true,
      vibrate: [200, 100, 200, 100, 400],
    }),
  );
});

// ── Notification click: focus the app ────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        const existing = clientList.find((c) => c.url.includes(self.location.origin));
        if (existing) return existing.focus();
        return clients.openWindow('./');
      }),
  );
});
