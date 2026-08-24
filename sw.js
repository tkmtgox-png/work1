const CACHE_NAME = "course-map-shell-v12";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./manifest.webmanifest",
  "./js/app.js",
  "./js/map.js",
  "./js/points.js",
  "./js/routing.js",
  "./js/storage.js",
  "./js/geocode.js",
  "./js/route-search.js",
  "./js/nearby-search.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // 外部CDN・地図タイルはキャッシュ対象外
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
