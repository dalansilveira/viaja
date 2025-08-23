const CACHE_NAME = 'viaja-app-cache-v5';
// Lista completa de arquivos essenciais para o App Shell.
const urlsToCache = [
  // Core
  '/',
  '/index.html',
  '/manifest.json',
  '/css/style.css',

  // JavaScript Modules
  '/js/app.js',
  '/js/dom.js',
  '/js/state.js',
  '/js/utils.js',
  '/js/api.js',
  '/js/map.js',
  '/js/ui.js',
  '/js/history.js',
  '/js/auth.js',
  '/js/pwa.js',
  '/js/destinations.js',

  // External Libraries
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet-routing-machine@latest/dist/leaflet-routing-machine.css',
  'https://unpkg.com/leaflet-routing-machine@latest/dist/leaflet-routing-machine.js',
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Poppins:wght@700&display=swap'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache aberto. Adicionando URLs ao cache.');
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Se a resposta estiver no cache, retorna ela. Senão, busca na rede.
        return response || fetch(event.request);
      })
  );
});

// Evento 'activate': Limpa caches antigos para manter o app atualizado.
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(cacheNames
        .filter(cacheName => !cacheWhitelist.includes(cacheName))
        .map(cacheName => {
          console.log('Deletando cache antigo:', cacheName);
          return caches.delete(cacheName);
        }));
    })
  );
});
