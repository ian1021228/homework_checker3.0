const CACHE_NAME = 'hw-checker-v3.6';
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
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache).catch(e => console.warn('Cache add error:', e)))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(name => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const resClone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, resClone));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then(cached => cached || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
          const resClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, resClone));
        }
        return networkResponse;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
