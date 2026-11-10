/* CRK PID Dashboard service worker: app shell + last-known data for offline use. */
const SHELL = 'pid-shell-v1'
const DATA = 'pid-data-v1'
const FILES = 'pid-files-v1'
const SHELL_URLS = ['/', '/index.html', '/favicon.svg', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_URLS)).then(() => self.skipWaiting()))
})
self.addEventListener('activate', (e) => {
  const keep = [SHELL, DATA, FILES]
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => !keep.includes(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})
self.addEventListener('message', (e) => {
  if (e.data === 'clear-data') caches.delete(DATA)
})

const networkFirst = async (req, cacheName) => {
  const cache = await caches.open(cacheName)
  try {
    const res = await fetch(req)
    if (res.ok) cache.put(req, res.clone())
    return res
  } catch (err) {
    const hit = await cache.match(req)
    if (hit) {
      const headers = new Headers(hit.headers)
      headers.set('X-From-Cache', '1')
      return new Response(await hit.blob(), { status: hit.status, headers })
    }
    throw err
  }
}
const cacheFirst = async (req, cacheName) => {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(req)
  if (hit) return hit
  const res = await fetch(req)
  if (res.ok) cache.put(req, res.clone())
  return res
}

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => { caches.open(SHELL).then((c) => c.put('/index.html', res.clone())); return res })
      .catch(() => caches.match('/index.html')))
    return
  }
  if (url.pathname.startsWith('/assets/') || SHELL_URLS.includes(url.pathname)) { e.respondWith(cacheFirst(req, SHELL)); return }
  if (url.pathname.startsWith('/api/files/')) { e.respondWith(cacheFirst(req, FILES)); return }
  if (/^\/api\/(state|projects\/[^/]+$|vendors|launchboard|report|survey\/)/.test(url.pathname)) { e.respondWith(networkFirst(req, DATA)); return }
})
