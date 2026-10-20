/*
 * Mocter service worker — deliberately lightweight (Turbopack-friendly):
 * 1. Precache the two locale shells so a repeat visit works offline.
 * 2. Navigations: network-first, fall back to the cache (shell) when offline.
 * 3. Static assets (`/_next/static`, `/_next/image`, icons, fonts, .svg, .txt):
 *    stale-while-revalidate.
 */
const VERSION = "m1";
const SHELL_CACHE = `mocter-shell-${VERSION}`;
const ASSET_CACHE = `mocter-assets-${VERSION}`;
const SHELL_URLS = ["/es", "/en"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== ASSET_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches
              .open(SHELL_CACHE)
              .then((cache) => cache.put(request, copy))
              .catch(() => {});
          }
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then(
              (cached) =>
                cached ||
                caches.match(url.pathname.startsWith("/en") ? SHELL_URLS[1] : SHELL_URLS[0]),
            ),
        ),
    );
    return;
  }

  const isAsset =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/_next/image") ||
    url.pathname === "/icon.svg" ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".txt") ||
    url.pathname.endsWith(".woff2");

  if (!isAsset && !["localhost", "mocter.co"].includes(url.hostname)) return;
  if (!isAsset) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches
              .open(ASSET_CACHE)
              .then((cache) => cache.put(request, copy))
              .catch(() => {});
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
