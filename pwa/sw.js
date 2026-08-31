// Trabajador de servicio del estudio.
//
// El estudio es un unico archivo, asi que guardarlo entero es barato y hace que
// abra sin conexion: una vez instalado en la pantalla de inicio, funciona en el
// metro. Estrategia: se sirve lo guardado al momento y se refresca por detras,
// de modo que la siguiente apertura ya trae la version nueva.

const CACHE = 'estudio-v1';
const ARCHIVOS = ['./', './index.html', './manifest.webmanifest', './icono-180.png', './icono-192.png', './icono-512.png'];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ARCHIVOS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((c) => c !== CACHE).map((c) => caches.delete(c))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;
  if (peticion.method !== 'GET' || new URL(peticion.url).origin !== self.location.origin) return;

  evento.respondWith(
    caches.match(peticion).then((guardada) => {
      const red = fetch(peticion)
        .then((respuesta) => {
          if (respuesta.ok) {
            const copia = respuesta.clone();
            caches.open(CACHE).then((cache) => cache.put(peticion, copia));
          }
          return respuesta;
        })
        .catch(() => guardada);
      // Lo guardado va primero; la red actualiza para la proxima vez.
      return guardada || red;
    })
  );
});
