// Service worker disabled for development — ensures fresh files on every load.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  // Clear all old caches
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))));
  self.clients.claim();
});
// Pass all requests straight to network — no caching.
self.addEventListener('fetch', () => {});
