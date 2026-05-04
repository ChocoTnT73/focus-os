/* FOCUS_OS service worker — offline-first cache for the shell.
   Strategy: cache-first for static shell, network-first for any
   third-party CDN (chart.js, supabase). Bump CACHE_VER to invalidate. */
const CACHE_VER = "focus-os-v3";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_VER).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VER).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Don't cache Supabase / auth / API calls — always go to network.
  if (url.hostname.includes("supabase.co") || url.hostname.includes("supabase.in")) {
    return;
  }
  // Cache-first for same-origin shell + CDN libs.
  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        // opportunistically cache successful GETs
        if (res.ok && (url.origin === self.location.origin || url.hostname.includes("jsdelivr") || url.hostname.includes("unpkg") || url.hostname.includes("cdnjs"))) {
          const copy = res.clone();
          caches.open(CACHE_VER).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => cached);
    })
  );
});
