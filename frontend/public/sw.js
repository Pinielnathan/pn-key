// Deliberately a pure pass-through: exists only so the app satisfies PWA
// installability checks (which look for a registered service worker with a
// fetch handler). It never caches anything, so it can never serve stale
// audio, job data, or API responses — every request still hits the network.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", () => self.clients.claim());
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
