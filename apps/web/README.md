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

## Qué falta para llegar al MVP completo de `docs/panama-ai/09-mvp.md`

Esto es intencionalmente un corte vertical, no el MVP terminado. Pendiente, en orden de
prioridad:

1. **Supabase real**: migrar `lib/data/places.ts` de leer `/data/places.json` a consultar las
   tablas de `docs/panama-ai/03-base-de-datos.md` (mismas firmas de función, solo cambia la
   implementación), con RLS, y `place_embeddings` con pgvector reemplazando el scoring por
   palabras clave de `lib/ai/tools.ts`.
2. **Cuentas de usuario** (Supabase Auth) y guardar/compartir itinerario por link
   (`share_token`).
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
