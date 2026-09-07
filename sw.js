const CACHE_NAME = 'hw-checker-v2';
const urlsToCache = [
  './index.html',
  './manifest.json',
  './icon.png' // 注意：請確保您的 GitHub 裡有一張名為 icon.png 的圖片
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fetch(event.request);
      })
  );
});
