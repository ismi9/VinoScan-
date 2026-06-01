const CACHE = 'vinoscan-v1';
const FILES = ['/','index.html','css/style.css','js/app.js','js/data.js','manifest.json'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(clients.claim()));
self.addEventListener('fetch', e => e.respondWith(caches.match(e.request).then(r => r || fetch(e.request))));