const CACHE_NAME = 'hw-checker-v3.8.1';
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
  );
});

self.addEventListener('fetch', event => {
  // 只攔截同源 GET 請求，第三方 CDN 與 Firebase 不強制快取干預
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // 網路優先策略 (Network First, Cache Fallback)，確保最新代碼即時生效
  event.respondWith(
    fetch(event.request)
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
