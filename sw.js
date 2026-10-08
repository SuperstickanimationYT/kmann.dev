const CACHE_NAME = `offline:${self.registration.scope}`;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(networkThenSavedCopy(request));
});

async function networkThenSavedCopy(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.status === 200) await cache.put(request, response.clone());
    return response;
  } catch (offline) {
    const saved = await cache.match(request, { ignoreSearch: true });
    if (saved) return saved;
    throw offline;
  }
}
