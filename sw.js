// ============================================================
//  PAELLAND — Service Worker  (Network First)
//  v1.0.0
// ============================================================

const CACHE_NAME = 'paelland-shell-v1';

// Archivos del "shell" de la app que se pre-cachean al instalar
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/cotizador',
  '/admin',
  '/estadisticas',
  '/finanzas',
  '/produccion',
  '/style.css',
  '/visor_ticket.js',
  '/logoPaelland.png',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/favicon-32.png',
  '/manifest.json'
];

// ── INSTALL: pre-cachear el shell ─────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Instalando y cacheando shell...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // addAll falla si algún recurso da error; usamos add individual
      return Promise.allSettled(
        SHELL_ASSETS.map((url) => cache.add(url).catch(() => {
          console.warn('[SW] No se pudo cachear:', url);
        }))
      );
    }).then(() => {
      console.log('[SW] Shell cacheado. Tomando control inmediatamente.');
      return self.skipWaiting();
    })
  );
});

// ── ACTIVATE: limpiar cachés antiguas ─────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Activando...');
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => {
            console.log('[SW] Eliminando caché antigua:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: Network First, excluyendo /api/ ───────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Ignorar solicitudes que NO son GET
  if (request.method !== 'GET') return;

  // 2. Ignorar llamadas a la API — siempre van a la red, sin caché
  if (url.pathname.startsWith('/api/')) return;

  // 3. Ignorar peticiones cross-origin (CDN, Google Fonts, etc.)
  //    excepto Google Fonts que sí queremos cachear
  const isGoogleFonts = url.hostname.includes('fonts.googleapis.com') ||
                        url.hostname.includes('fonts.gstatic.com');

  if (url.origin !== self.location.origin && !isGoogleFonts) return;

  // 4. Estrategia Network First
  event.respondWith(networkFirst(request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    // Intenta la red primero
    const networkResponse = await fetch(request);

    // Si fue exitoso, actualiza la caché en segundo plano
    if (networkResponse.ok || networkResponse.type === 'opaque') {
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    // Red fallida → intenta desde caché
    console.log('[SW] Sin red, sirviendo desde caché:', request.url);
    const cached = await cache.match(request);

    if (cached) return cached;

    // Fallback final: si piden una página HTML, sirve index.html
    if (request.headers.get('accept')?.includes('text/html')) {
      const fallback = await cache.match('/index.html');
      if (fallback) return fallback;
    }

    // Sin opciones
    return new Response('Sin conexión y sin caché disponible.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}
