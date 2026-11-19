const CACHE_NAME = 'hw-checker-v4.3.2-sync';
const urlsToCache = [
  './index.html',
  './parent.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/constants.js',
  './js/events.js',
  './js/firebase.js',
  './js/icons.js',
  './js/navigation.js',
  './js/newVersionNotice.js',
  './js/qrLogin.js',
  './js/render.js',
  './js/state.js',
  './js/storage.js',
  './js/utils.js',
  './js/lib/qrcode.min.js',
  './js/lib/html5-qrcode.min.js',
  './icon.svg',
  './icon.png',
  './homework-checker-icon.svg',
  './homework-checker-icon.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(
        urlsToCache.map(url => cache.add(url).catch(e => console.warn('快取失敗:', url, e)))
      );
    })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(name => {
          if (name !== CACHE_NAME) {
            console.log('清除舊版本快取:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
     .then(async () => {
      try {
        const allClients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
        for (const client of allClients) {
          client.postMessage({ type: 'PALCLASS_NOTICE_REFRESH' });
        }
      } catch (e) {}
    })
  );
});

self.addEventListener('fetch', event => {
  // 只攔截同源 GET 請求，第三方 CDN 與 Firebase 不強制快取干預
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // 網路優先策略 (Network First, Cache Fallback) + 繞過 HTTP 短期快取，確保免重整即時取得新版通知與最新程式碼
  event.respondWith(
    fetch(event.request, { cache: 'no-cache' })
      .then(networkResponse => {
        if (networkResponse && networkResponse.status === 200) {
          const resClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, resClone).catch(() => {});
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (event.request.mode === 'navigate') {
          return (await caches.match('./index.html')) || (await caches.match('./parent.html'));
        }
        return new Response('離線模式，此資源未快取', { status: 503, statusText: 'Offline' });
      })
  );
});
