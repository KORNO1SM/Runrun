/* RunLog 서비스 워커 — 오프라인 실행 + 다른 앱에서 GPX 공유 받기 */
const CACHE = 'runlog-v5';
const FONT_CACHE = 'runlog-fonts';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== 'runlog-share' && k !== FONT_CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method === 'POST' && url.origin === location.origin && url.pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      try {
        const fd = await req.formData();
        const files = fd.getAll('files');
        const c = await caches.open('runlog-share');
        let i = 0;
        for (const f of files) {
          if (!f || typeof f === 'string') continue;
          await c.put(new Request(`./shared/${Date.now()}-${i++}-${encodeURIComponent(f.name || 'shared.gpx')}`), new Response(f));
        }
      } catch (err) { /* noop */ }
      return Response.redirect('./?shared=1#runs', 303);
    })());
    return;
  }
  if (req.method === 'GET' && /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.open(FONT_CACHE).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    }));
    return;
  }
  if (req.method !== 'GET' || url.origin !== location.origin) return; // 지도 타일 등은 네트워크 그대로
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (req.mode === 'navigate') {
      try {
        const fresh = await fetch(req);
        if (fresh.ok) cache.put('./index.html', fresh.clone());
        return fresh;
      } catch (err) {
        return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
      }
    }
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try { const res = await fetch(req); if (res.ok) cache.put(req, res.clone()); return res; } catch (err) { return Response.error(); }
  })());
});
