const CACHE_NAME = 'seannylog-v3.11';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/state.js',
  './js/reminder-rules.js',
  './js/reminder-config.js',
  './js/reminders.js',
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
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('seannylog-') && k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
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

self.addEventListener('push', event => {
  // Always show a visible notification (required by iOS). The server owns
  // eligibility; service workers cannot read the app's localStorage.
  let tag = 'seannylog-reminder';
  try{
    const data = event.data?.json();
    if(/^(workout-\d{4}-\d{2}-\d{2}|seannylog-test)$/.test(data?.tag)) tag = data.tag;
  }catch(e){}
  const base = self.registration.scope;
  event.waitUntil(self.registration.showNotification('SeannyLog', {
    body:'Ready for your next workout? Open SeannyLog to get started.',
    icon:new URL('icon-192.png', base).href,
    badge:new URL('icon-192.png', base).href,
    tag, renotify:false,
    data:{url:new URL('index.html#today', base).href}
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const base = new URL(self.registration.scope);
    const url = new URL('index.html#today', base).href;
    const windows = await self.clients.matchAll({type:'window', includeUncontrolled:true});
    for(const client of windows){
      const candidate = new URL(client.url);
      if(candidate.origin === base.origin &&
        (candidate.pathname === base.pathname || candidate.pathname === `${base.pathname}index.html`)){
        // Messaging switches views without navigating away from a workout draft.
        client.postMessage({type:'SEANNYLOG_OPEN_TODAY'});
        try{ await client.focus(); return; }catch(e){}
      }
    }
    await self.clients.openWindow(url);
  })());
});
