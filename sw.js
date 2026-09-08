/* -------------------------------------------------
   Service Worker for RIPPLE PWA
   - Version: ripple-static-v2
   - Network‑first for core assets (HTML, CSS, JS) so updates deploy instantly
   - Cache‑fallback for offline functionality
   - Bypasses dynamic Google Apps Script API calls completely
   - Cleans up older caches on activate
   ------------------------------------------------- */

const CACHE_NAME = 'ripple-static-v2';

const STATIC_ASSETS = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'manifest.json',
  'icons/icon-72x72.png',
  'icons/icon-96x96.png',
  'icons/icon-128x128.png',
  'icons/icon-144x144.png',
  'icons/icon-152x152.png',
  'icons/icon-192x192.png',
  'icons/icon-384x384.png',
  'icons/icon-512x512.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('[SW] Pre-caching warning:', err);
      });
    })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => {
          console.log('[SW] Deleting old cache:', key);
          return caches.delete(key);
        })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;

  // 1. Never intercept non-GET requests (e.g. POST to Google Apps Script)
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // 2. Never cache dynamic Google Apps Script / Google Sheets API requests in Service Worker
  if (url.hostname.includes('script.google.com') || url.hostname.includes('script.googleusercontent.com')) {
    return;
  }

  // 3. For core app files (HTML, JS, CSS, and root navigation): Network-First
  const isCoreAsset = request.mode === 'navigate' ||
    url.pathname.endsWith('index.html') ||
    url.pathname.endsWith('styles.css') ||
    url.pathname.endsWith('app.js') ||
    url.pathname === '/' ||
    url.pathname.endsWith('/RIPPLE/');

  if (isCoreAsset) {
    event.respondWith(
      fetch(request)
        .then(networkRes => {
          if (networkRes && networkRes.status === 200) {
            const resClone = networkRes.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, resClone));
          }
          return networkRes;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          if (request.mode === 'navigate') {
            return caches.match('index.html');
          }
          return null;
        })
    );
    return;
  }

  // 4. For other assets (icons, images, fonts, CDN scripts): Cache-First with network fallback
  event.respondWith(
    caches.match(request).then(cachedRes => {
      if (cachedRes) return cachedRes;
      return fetch(request).then(networkRes => {
        if (networkRes && networkRes.status === 200) {
          const resClone = networkRes.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, resClone));
        }
        return networkRes;
      });
    })
  );
});
