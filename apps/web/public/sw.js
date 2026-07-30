const BUILD_VERSION = "__DIAYAR_BUILD_VERSION__";
const CACHE_NAME = `diayar-pwa-${BUILD_VERSION}`;
const BASE_PATH = new URL(self.registration.scope).pathname.replace(/\/$/, "");
const pathFor = (path) => `${BASE_PATH}${path}`;
const APP_SHELL = ["/", "/type-2/", "/type-1/", "/pregnancy/", "/icon-192.png", "/icon-512.png"].map(pathFor);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || !event.request.url.startsWith(self.location.origin)) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match(pathFor("/"))))
  );
});
