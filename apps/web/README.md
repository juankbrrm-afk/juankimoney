# Panama AI — `apps/web`

Primer corte funcional del MVP descrito en `docs/panama-ai/09-mvp.md`. Next.js 15 (App Router) +
TypeScript + Tailwind v4. Sin dependencia de Supabase todavía — usa el dataset semilla en
`lib/data/places.ts` como stand-in de la tabla `places` real.

## Correr en local

```bash
cd apps/web
npm install
npm run dev
```

Abre `http://localhost:3000`.

## Qué funciona ya

- Chat conversacional (`/`) con streaming de UI (no de tokens todavía, ver "Pendiente" abajo),
  tool-calling real contra Claude cuando hay `ANTHROPIC_API_KEY`.
- **Modo demo sin API key**: si no configuras `ANTHROPIC_API_KEY`, `/api/chat` responde con
  búsqueda estructurada sobre el dataset semilla sin llamar a ningún modelo — para poder probar
  el flujo completo (UI, tarjetas de lugar, itinerario) sin credenciales.
- Guardrail de cero-alucinación aplicado a nivel de arquitectura: la UI solo renderiza
  `PlaceCard` a partir de los resultados que devolvió la tool `search_places`, nunca parseando
  el texto libre del modelo — ver comentario en `lib/ai/orchestrator.ts`.
- Página de perfil de lugar (`/lugares/[slug]`) con los tres botones de acción
  (Reservar/Llamar/Navegar).
- Itinerario básico ordenado por restricción de tiempo/presupuesto (`build_itinerary`).

## Qué falta para llegar al MVP completo de `docs/panama-ai/09-mvp.md`

Esto es intencionalmente un corte vertical, no el MVP terminado. Pendiente, en orden de
prioridad:

1. **Streaming real de tokens** vía Vercel AI SDK (`ai` + `@ai-sdk/anthropic`) en vez de
   respuesta JSON completa — mejora percepción de velocidad.
2. **Supabase real**: migrar `lib/data/places.ts` a las tablas de
   `docs/panama-ai/03-base-de-datos.md`, con RLS, y `place_embeddings` con pgvector reemplazando
   el scoring por palabras clave de `lib/ai/tools.ts`.
3. **Cuentas de usuario** (Supabase Auth) y guardar/compartir itinerario por link
   (`share_token`).
4. **Dashboard admin interno** (`apps/admin`) para que el equipo cargue los 150-300 lugares
   reales en vez de editar `places.ts` a mano.
5. Fotografía real (Supabase Storage) reemplazando los bloques `bg-stone-100` placeholder.
6. Integración de Google Maps embebido (`MapView`) sincronizado con los resultados.

## Credenciales necesarias que no puedo generar por ustedes

- `ANTHROPIC_API_KEY` — cuenta en console.anthropic.com.
- Proyecto Supabase (URL + anon key + service role key).
- `GOOGLE_MAPS_API_KEY` con Places API habilitada.
- Cuenta Stripe (modo test primero) para Fase 2 (reservas).

Ver `.env.example` para el set completo. Sin estas, el modo demo permite seguir desarrollando UI
y lógica de producto igual.
