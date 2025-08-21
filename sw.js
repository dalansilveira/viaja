const CACHE_NAME = 'viaja-app-cache-v1';
const urlsToCache = [
  './',
  './teste.html',
  './logo.png',
  './logodark.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet-routing-machine@latest/dist/leaflet-routing-machine.css',
  'https://unpkg.com/leaflet-routing-machine@latest/dist/leaflet-routing-machine.js'
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