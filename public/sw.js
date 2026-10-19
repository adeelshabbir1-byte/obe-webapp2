// OBEHUB service worker: makes the app installable on phones and shows a simple page when offline.
// Pages are always fetched fresh (data changes constantly); only the offline page is cached.
const OFFLINE = "/offline.html";
self.addEventListener("install", (e) => { e.waitUntil(caches.open("obehub-v1").then((c) => c.addAll([OFFLINE]))); self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return;
  e.respondWith(fetch(e.request).catch(() => caches.match(OFFLINE)));
});
