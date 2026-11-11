/* Offline application shell for the GitHub Pages web app. */
const CACHE_NAME = 'padel-toss-americano-v239';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png', './visual-theme.css', './assets/mode-toss.svg', './assets/mode-koc.svg', './assets/mode-americano.svg', './assets/mode-split.svg'];
const SHELL_URLS = SHELL.map(file => new URL(file, self.registration.scope).href);
const INDEX_URL = new URL('./index.html', self.registration.scope).href;

async function ensureShell(){
  const cache = await caches.open(CACHE_NAME);
  const missing = (await Promise.all(SHELL_URLS.map(async url =>
    await cache.match(url) ? null : url))).filter(Boolean);
  if (missing.length) await cache.addAll(missing);
}

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME)
    .then(cache => cache.addAll(SHELL_URLS))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    // Do not take over clients or remove their fallback until the complete
    // current shell (including every illustration) is available offline.
    ensureShell().then(() => caches.keys()).then(keys => Promise.all(
      keys.filter(key => key.startsWith('padel-toss-americano-') && key !== CACHE_NAME)
        .map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  event.respondWith(
    fetch(event.request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)));
      }
      return response;
    }).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(event.request);
      if (cached) return cached;
      if (event.request.mode === 'navigate') return await cache.match(INDEX_URL) || Response.error();
      return Response.error();
    })
  );
});

