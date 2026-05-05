/* FOCUS_OS service worker.
   Strategy:
     - HTML (index.html, "/", any navigation) → NETWORK-FIRST.
       We never want a stale shell. Cache is only a fallback for offline.
     - Same-origin static assets (icons, manifest) → cache-first with revalidation.
     - Third-party CDN (jsdelivr/unpkg/cdnjs) → cache-first.
     - Supabase/API → bypass SW entirely.
   Bump CACHE_VER on every release to invalidate everything. */
const CACHE_VER = "focus-os-v6";
const SHELL = [
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_VER)
      .then((c) => c.addAll(SHELL).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VER).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("message", (e) => {
  if (e.data === "SKIP_WAITING") self.skipWaiting();
});

function isHtmlRequest(req){
  if (req.mode === "navigate") return true;
  const accept = req.headers.get("accept") || "";
  return accept.includes("text/html");
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Bypass Supabase / auth / API
  if (url.hostname.includes("supabase.co") || url.hostname.includes("supabase.in")) {
    return;
  }

  // Network-first for HTML (index.html and any navigation request).
  if (isHtmlRequest(req)) {
    e.respondWith(
      fetch(req).then((res) => {
        // Cache the latest copy for offline fallback.
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_VER).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() =>
        caches.match(req).then((cached) => cached || caches.match("./index.html"))
      )
    );
    return;
  }

  // Cache-first for static assets (icons/manifest/CDN libs).
  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res.ok && (
          url.origin === self.location.origin ||
          url.hostname.includes("jsdelivr") ||
          url.hostname.includes("unpkg") ||
          url.hostname.includes("cdnjs")
        )) {
          const copy = res.clone();
          caches.open(CACHE_VER).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => cached);
    })
  );
});
