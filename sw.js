const CACHE_NAME = 'seannylog-v3.13';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/state.js',
  './js/logic.js',
  './js/render-today.js',
  './js/render-progress.js',
  './js/render-split.js',
  './js/settings.js',
  './js/ui.js',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  // Retire this app's old push subscription without contacting its backend.
  // Unsupported browsers or offline cleanup failures must not break the PWA.
  const retirePush = (async () => {
    try{
      const subscription = await self.registration.pushManager?.getSubscription();
      if(subscription) await subscription.unsubscribe();
    }catch(e){}
  })();
  event.waitUntil(
    Promise.all([retirePush, caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('seannylog-') && k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())])
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return; // let fonts/CDN go straight to network

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached || (event.request.mode === 'navigate' ? caches.match('./index.html') : Response.error()));
      return cached || networkFetch;
    })
  );
});
