importScripts('js/store.js', 'js/sources.js', 'js/checker.js');

const CACHE = 'concert-alert-v1';
const ASSETS = ['./', 'index.html', 'styles.css', 'manifest.webmanifest', 'icon.svg',
  'js/store.js', 'js/sources.js', 'js/checker.js', 'js/app.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// 同源檔案：先用網路，失敗時用快取（離線可開）
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => {
    const copy = r.clone();
    caches.open(CACHE).then((c) => c.put(e.request, copy));
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});

const show = (n) => self.registration.showNotification(n.title, {
  body: n.body, tag: n.tag, icon: 'icon.svg', badge: 'icon.svg',
  requireInteraction: !!n.requireInteraction, data: { url: n.url || '' },
});

// 背景定期檢查（支援的瀏覽器：Android / 桌面版 Chrome、Edge，需先安裝成 App）
self.addEventListener('periodicsync', (e) => {
  if (e.tag === 'concert-check') e.waitUntil(Checker.run({ notify: show }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data && e.notification.data.url;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    if (url) return self.clients.openWindow(url);
    if (list.length) return list[0].focus();
    return self.clients.openWindow('./');
  }));
});
