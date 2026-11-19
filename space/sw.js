importScripts('js/store.js', 'js/data.js', 'js/api.js', 'js/checker.js');

const CACHE = 'space-radar-v1';
const ASSETS = ['./', 'index.html', 'styles.css', 'manifest.webmanifest', 'icon.svg',
  'vendor/astronomy.min.js', 'vendor/satellite.min.js',
  'js/store.js', 'js/data.js', 'js/api.js', 'js/checker.js', 'js/sky.js', 'js/app.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('space-radar') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// 同源檔案：先用網路，失敗時用快取（離線也能打開）；API 資料存在 IndexedDB，不經過這裡
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});

const show = (n) => self.registration.showNotification(n.title, {
  body: n.body, tag: n.tag, icon: 'icon.svg', badge: 'icon.svg', requireInteraction: !!n.requireInteraction,
  data: { url: n.url ? new URL(n.url, self.registration.scope).href : '' },
});

// 背景定期檢查（Android／桌面版 Chrome、Edge 安裝成 App 後才有，頻率由瀏覽器決定）
self.addEventListener('periodicsync', (e) => {
  if (e.tag === 'space-check') e.waitUntil(Checker.run({ notify: show }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  const inApp = url.startsWith(self.registration.scope);
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const win = list.find((c) => c.url.startsWith(self.registration.scope));
    if (inApp && win) {
      win.postMessage({ open: url });
      return win.focus();
    }
    return self.clients.openWindow(url);
  }));
});
