# Panama AI — `apps/web`

Primer corte funcional del MVP descrito en `docs/panama-ai/09-mvp.md`. Next.js 15 (App Router) +
TypeScript + Tailwind v4. Sin dependencia de Supabase todavía — `lib/data/places.ts` lee de
`/data/places.json` (raíz del repo, compartido con `apps/admin`, ver `/data/README.md`) como
stand-in de la tabla `places` real.

## Correr en local

```bash
cd apps/web
npm install
npm run dev
```

Abre `http://localhost:3000`.

## Qué funciona ya

- Chat conversacional (`/`) con **streaming real de tokens**: `/api/chat` transmite un stream
  NDJSON propio (`lib/ai/orchestrator.ts` → `StreamEvent`, ver el comentario ahí sobre por qué es
  protocolo propio y no el data-stream del Vercel AI SDK) consumido con `fetch` +
  `ReadableStream.getReader()` en `ChatCanvas.tsx` — verificado con timestamps reales por evento,
  no solo revisado a ojo. Tool-calling real contra Claude cuando hay `ANTHROPIC_API_KEY`.
- **Modo demo sin API key**: si no configuras `ANTHROPIC_API_KEY`, `/api/chat` corre búsqueda
  estructurada sobre el dataset semilla y la transmite palabra por palabra por el mismo protocolo
  de streaming — para poder probar el flujo completo (UI, tarjetas de lugar, itinerario,
  streaming) sin credenciales.
- Guardrail de cero-alucinación aplicado a nivel de arquitectura: la UI solo renderiza
  `PlaceCard` a partir de los resultados que devolvió la tool `search_places`, nunca parseando
  el texto libre del modelo — ver comentario en `lib/ai/orchestrator.ts`.
- Página de perfil de lugar (`/lugares/[slug]`) con los tres botones de acción
  (Reservar/Llamar/Navegar).
- Itinerario básico ordenado por restricción de tiempo/presupuesto (`build_itinerary`).
- Datos compartidos en vivo con `apps/admin`: un negocio editado en el dashboard aparece en el
  siguiente mensaje del chat, sin reiniciar el servidor (verificado, no solo diseñado — ver el
  commit que unificó `/data/places.json`).
- Capa de pagos (`lib/payments/`) con la interfaz común y el enrutamiento Yappy/PagueloFacil
  definidos (no Stripe — decisión del negocio). **PagueloFacil ya hace una llamada HTTP real**
  al endpoint confirmado `LinkDeamon.cfm` (corroborado por múltiples integraciones públicas
  independientes, con validación estricta de la respuesta); **Yappy sigue bloqueado** — su
  portal de desarrolladores y varios blogs con ejemplos de código devolvieron 403 al intentar
  investigarlos de forma automática, así que solo confirmamos nombres de credenciales y estados
  de resultado, no el endpoint. Ver el comentario al inicio de cada archivo para el detalle
  exacto de qué está confirmado y qué falta (incluye el contacto directo del equipo de Yappy).
- Mapa embebido de Google en el perfil de lugar (`components/MapEmbed.tsx`), a diferencia de
  los pagos esta sí es una API pública sin muro de autenticación — implementada y probada de
  verdad con y sin `GOOGLE_MAPS_API_KEY` (sin key muestra un aviso, con key genera el iframe
  real apuntando a `maps/embed/v1/place`).
- **Reseñas sin cuenta** en cada perfil de lugar (`lib/reviews/store.ts`, mismo patrón de
  archivo JSON que itinerarios) — no recalcula el `avgRating` curado del lugar, solo lo
  complementa; eso evita que una reseña suelta distorsione el rating editorial mientras el
  volumen real es bajo. La página de lugar pasó de estática a `force-dynamic` para que una
  reseña nueva se vea de inmediato. Probado end-to-end: reseña enviada por API, aparece en la
  página con autor, texto y estrellas correctas.
- **Guardar y compartir itinerario por link, sin cuenta**: botón "Guardar y compartir" bajo
  cualquier itinerario del chat → `POST /api/itineraries` → `/itinerarios/[id]`. Se guarda solo
  la referencia a cada `placeId` (`lib/itineraries/store.ts`), no una copia de los datos del
  lugar, así que si el negocio edita su horario en `apps/admin` después de que alguien comparta
  el link, quien lo abra ve el dato fresco, no uno congelado. Probado en vivo: crear vía API,
  abrir el link generado y confirmar que trae exactamente los lugares guardados con el título
  correcto; un id inexistente da 404.
- `/explorar` — navegación por categoría/zona sin pasar por el chat, con filtros vía query
  params (`?categoria=beach&zona=...`) enlazables/indexables, sin JS del lado del cliente para
  filtrar. Probado en vivo con los tres casos (sin filtro, por categoría, por zona) contra el
  dataset real — cada uno devuelve exactamente los lugares esperados.
- **PWA instalable de verdad** (docs/panama-ai/05-componentes-ui.md): `public/manifest.json` +
  `public/sw.js` + `components/ServiceWorkerRegister.tsx`, con íconos PNG reales generados a
  mano (sin librería externa, ver `public/icon-192.png`/`icon-512.png` — un placeholder honesto
  hasta que exista un logo de marca definitivo). Probado con navegador real, no solo
  configurado: el manifest carga, el service worker se activa y toma control de la página, y
  **recargar la app estando offline sigue funcionando** (cachea el app shell; deliberadamente
  nunca cachea `/api/chat` ni datos de negocios, que deben ser siempre frescos).

- **Rediseño visual** inspirado en una referencia real que pasó el usuario (un sitio de turismo
  con hero de foto grande a pantalla completa): tipografía enorme en mayúsculas para el momento
  de bienvenida del chat, navbar persistente, tarjetas de lugar con tinte de color por categoría.
- **Fotografía real de Panamá** (`lib/data/category-photos.ts`) en el hero y en `PlacePhoto` —
  una foto de Wikimedia Commons por categoría (Isla Taboga, esclusas de Miraflores, Biomuseo,
  skyline de Ciudad de Panamá de día y de noche, Casco Viejo, un perezoso del Parque Natural
  Metropolitano), servida vía `Special:FilePath` (resuelve al archivo original sin necesitar el
  hash de carpeta de `upload.wikimedia.org`). Este sandbox de desarrollo no tiene salida directa
  a `commons.wikimedia.org` (curl y WebFetch devuelven 403/timeout contra ese dominio incluso
  después de pedir acceso de red "Full" — solo `WebSearch` funciona, que corre por infraestructura
  aparte), así que las URLs no se pudieron cargar ni verificar visualmente *desde aquí*; en
  Vercel, con salida a internet normal, deberían resolver sin problema. Por eso `PlacePhoto` y el
  hero de `ChatCanvas` tienen `onError` que cae a la ilustración vectorial / al gradiente si una
  imagen no carga — verificado de verdad simulando el fallo (capturas con la red del sandbox
  bloqueada, sin imagen rota visible). **Antes de un lanzamiento público**, verificar cada URL
  carga en un navegador real y confirmar el nombre exacto del autor en la file page de cada
  imagen (linkeada en `category-photos.ts`) para el crédito CC BY / CC BY-SA — el crédito que
  aparece hoy es el mejor esfuerzo a partir de los resultados de búsqueda, no una verificación
  campo por campo. La categoría "restaurant" se quedó con la ilustración: no encontré una foto de
  Panamá específica y confiable (solo resultados genéricos o de otros países) y preferí no usar
  una imagen mal etiquetada.
- **Ilustraciones propias por categoría** (`components/illustrations/CategoryIllustration.tsx`)
  como red de seguridad de `PlacePhoto` cuando no hay foto real asignada a la categoría o la foto
  falla al cargar — cada categoría tiene su propia escena vectorial de un lugar/paisaje real de
  Panamá (balcones de Casco Antiguo de noche, un barco cruzando las esclusas de Miraflores, Isla
  Taboga, el techo multicolor del Biomuseo, un perezoso en el dosel del Parque Natural
  Metropolitano...), 100% autocontenidas — cero requests externos, cero riesgo de imagen rota.
  Iteradas con capturas reales: la primera versión del barco del Canal se veía como un cuadrado
  flotando a tamaño grande, así que se rehizo con casco, puente de mando y contenedores
  reconocibles.

## Qué falta para llegar al MVP completo de `docs/panama-ai/09-mvp.md`

Esto es intencionalmente un corte vertical, no el MVP terminado. Pendiente, en orden de
prioridad:

1. **Supabase real**: migrar `lib/data/places.ts` de leer `/data/places.json` a consultar las
   tablas de `docs/panama-ai/03-base-de-datos.md` (mismas firmas de función, solo cambia la
   implementación), con RLS, y `place_embeddings` con pgvector reemplazando el scoring por
   palabras clave de `lib/ai/tools.ts`.
2. **Cuentas de usuario** (Supabase Auth) — hoy los itinerarios se guardan y comparten sin
   cuenta (ver arriba), pero no hay forma de "reclamarlos" ni ver "mis itinerarios" al loguearse.
3. Fotografía real (Supabase Storage) reemplazando los bloques `bg-stone-100` placeholder.
4. Confirmar el endpoint real de Yappy (contactar botondepagoyappy@bgeneral.com o acceder al
   panel de comercio) para completar `lib/payments/yappy.ts`.
5. Un `MapView` interactivo sincronizado con los resultados de búsqueda (hoy `MapEmbed` solo
   se usa en el perfil de un lugar individual, no en la vista de exploración).

## Credenciales necesarias que no puedo generar por ustedes

- `ANTHROPIC_API_KEY` — cuenta en console.anthropic.com.
- Proyecto Supabase (URL + anon key + service role key).
- `GOOGLE_MAPS_API_KEY` con Places API habilitada.
- Cuenta de comercio Yappy (Banco General) y cuenta de comercio PagueloFacil (CCLW + API key),
  ambas necesarias antes de poder completar `lib/payments/` — ver nota arriba.

Ver `.env.example` para el set completo. Sin estas, el modo demo permite seguir desarrollando UI
y lógica de producto igual.
