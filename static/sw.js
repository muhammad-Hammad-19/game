// Offline support. Hashed build files never change, so they are served from the cache;
// everything else is refreshed in the background.
const CACHE = 'boundary-bash-v2'
const FONT_HOST = /(^|\.)fonts\.(googleapis|gstatic)\.com$/

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key)
    await self.clients.claim()
  })())
})

// The page sends the files it has already loaded, so the first visit is enough to go offline.
self.addEventListener('message', event => {
  if (event.data?.type !== 'cache') return
  event.waitUntil(caches.open(CACHE).then(cache => Promise.all(event.data.urls.map(async url => {
    if (!(await cache.match(url))) await cache.add(url).catch(() => {})
  }))))
})

async function store(request, response) {
  if (response.ok || response.type === 'opaque') (await caches.open(CACHE)).put(request, response.clone()).catch(() => {})
  return response
}

// Module scripts are requested with an Origin header; ignore `Vary` so the copies
// saved on the first visit still match.
const cached = request => caches.match(request, { ignoreVary: true })

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  const sameOrigin = url.origin === self.location.origin
  if (!sameOrigin && !FONT_HOST.test(url.hostname)) return

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => store(request, response))
      .catch(async () => (await caches.match(request, { ignoreSearch: true })) || (await caches.match(self.registration.scope)) || Response.error()))
    return
  }
  if (!sameOrigin || url.pathname.includes('/assets/')) {
    event.respondWith(cached(request).then(hit => hit || fetch(request).then(response => store(request, response))))
    return
  }
  event.respondWith(cached(request).then(hit => {
    const fresh = fetch(request).then(response => store(request, response))
    if (!hit) return fresh
    fresh.catch(() => {})
    return hit
  }))
})
