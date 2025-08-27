// --- Service Worker para PWA do "Gestão de Aulas" ---
// Estratégia mista: pré-cache do shell + cache dinâmico com SWR (stale-while-revalidate)

const CACHE_NAME = 'gestao-aulas-v1';

// Arquivos essenciais (mesma origem)
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Instalando: faz o pré-cache do shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

// Ativando: remove caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)))
    )
  );
  self.clients.claim();
});

// Busca: 
// - Mesma origem -> Stale-While-Revalidate
// - Cross-origin (CDNs como Tailwind/Chart.js) -> Network-First com fallback cache
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Só intercepta GET
  if (req.method !== 'GET') return;

  // MESMA ORIGEM: SWR
  if (url.origin === self.location.origin) {
    event.respondWith(swr(req));
    return;
  }

  // OUTRA ORIGEM (CDNs): Network-First
  event.respondWith(networkFirst(req));
});

async function swr(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((res) => {
      // Clona e salva no cache se resposta ok
      if (res && res.status === 200) {
        cache.put(request, res.clone());
      }
      return res;
    })
    .catch(() => null);

  // Retorna cache imediatamente (se houver), atualiza em segundo plano
  return cached || (await networkPromise) || offlineFallback(request);
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const res = await fetch(request, { mode: 'no-cors' }); // respostas "opaque" de CDNs são aceitáveis
    // Mesmo com "opaque", armazena pra reuso offline
    cache.put(request, res.clone());
    return res;
  } catch (e) {
    const cached = await cache.match(request);
    return cached || offlineFallback(request);
  }
}

// Fallback simples: se pedir HTML e nada disponível, tenta devolver index.html
async function offlineFallback(request) {
  if (request.headers.get('accept')?.includes('text/html')) {
    const cache = await caches.open(CACHE_NAME);
    const shell = await cache.match('./index.html');
    if (shell) return shell;
  }
  return new Response('Offline', { status: 503, statusText: 'Offline' });
}
