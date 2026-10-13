// Csámpázó - Service Worker Cache
const CACHE_NAME = 'csampazo-cache-v9';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './css/leaflet.css',
  './js/leaflet.js',
  './js/app.js',
  './js/store.js',
  './js/charts.js',
  './js/analytics.js',
  './js/routes.js',
  './js/gdrive.js',
  './icons/icon.svg',
  './manifest.webmanifest'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  // Pass-through for API calls
  if (e.request.url.includes('/api/')) {
    return;
  }
  e.respondWith(
    caches.match(e.request).then((res) => {
      return res || fetch(e.request).then((fetchRes) => {
        return caches.open(CACHE_NAME).then((cache) => {
          if (e.request.method === 'GET' && !e.request.url.startsWith('chrome-extension')) {
            cache.put(e.request, fetchRes.clone());
          }
          return fetchRes;
        });
      });
    }).catch(() => caches.match('./index.html'))
  );
});


