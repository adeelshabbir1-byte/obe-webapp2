// OBEHUB service worker: installable app, a simple page when offline, and push notifications (Adeel prompt §4).
// Pages are always fetched fresh (data changes constantly); only the offline page is cached.
const OFFLINE = "/offline.html";
self.addEventListener("install", (e) => { e.waitUntil(caches.open("obehub-v2").then((c) => c.addAll([OFFLINE]))); self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return;
  e.respondWith(fetch(e.request).catch(() => caches.match(OFFLINE)));
});
self.addEventListener("push", (e) => {
  let d = { title: "OBEHUB", body: "", url: "/" };
  try { d = Object.assign(d, e.data ? e.data.json() : {}); } catch (_) { /* text */ }
  e.waitUntil(self.registration.showNotification(d.title, { body: d.body, icon: "/icon-192.png", badge: "/icon-192.png", data: { url: d.url } }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(self.clients.matchAll({ type: "window" }).then((list) => { for (const c of list) { if ("focus" in c) { c.navigate(url); return c.focus(); } } return self.clients.openWindow(url); }));
});
