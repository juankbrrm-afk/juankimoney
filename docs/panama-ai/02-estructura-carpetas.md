# 2. Estructura de Carpetas

Monorepo gestionado con **Turborepo** + **pnpm workspaces**.

```
panama-ai/
├── apps/
│   ├── web/                        # App pública (turistas) — Next.js App Router
│   │   ├── app/
│   │   │   ├── [country]/          # segmento dinámico: /panama, /costa-rica...
│   │   │   │   ├── (chat)/         # experiencia conversacional (ruta principal)
│   │   │   │   ├── lugares/[slug]/ # perfil de POI (SSR, SEO)
│   │   │   │   ├── itinerarios/[id]/
│   │   │   │   ├── eventos/
│   │   │   │   └── explorar/       # exploración por categoría/zona (sin IA)
│   │   │   ├── api/
│   │   │   │   ├── chat/route.ts       # streaming del concierge IA
│   │   │   │   ├── itineraries/
│   │   │   │   ├── places/
│   │   │   │   ├── bookings/
│   │   │   │   └── webhooks/
│   │   │   │       ├── stripe/route.ts
│   │   │   │       └── whatsapp/route.ts
│   │   │   ├── layout.tsx
│   │   │   └── middleware.ts       # resolución de país por dominio/geo
│   │   └── next.config.ts
│   │
│   ├── admin/                      # Dashboard interno + panel de negocios — Next.js
│   │   ├── app/
│   │   │   ├── (auth)/
│   │   │   ├── negocios/           # CRUD restaurantes, hoteles, tours...
│   │   │   ├── categorias/
│   │   │   ├── eventos/
│   │   │   ├── usuarios/
│   │   │   ├── publicidad/
│   │   │   ├── destacados/
│   │   │   └── analitica/
│   │   └── next.config.ts
│   │
│   └── docs/                       # (opcional, futuro) sitio de docs/API públicas B2B
│
├── packages/
│   ├── ai-core/                    # Motor de IA, independiente de framework de UI
│   │   ├── src/
│   │   │   ├── orchestrator.ts     # loop de conversación + tool-calling
│   │   │   ├── providers/
│   │   │   │   ├── claude.ts
│   │   │   │   └── openai.ts
│   │   │   ├── rag/
│   │   │   │   ├── embed.ts
│   │   │   │   └── retrieve.ts
│   │   │   ├── tools/               # funciones invocables por el modelo
│   │   │   │   ├── searchPlaces.ts
│   │   │   │   ├── buildItinerary.ts
│   │   │   │   ├── getWeather.ts
│   │   │   │   └── translate.ts
│   │   │   ├── prompts/
│   │   │   │   ├── base-persona.ts
│   │   │   │   └── country-overrides/
│   │   │   └── guardrails.ts
│   │   └── package.json
│   │
│   ├── db/                         # Cliente Supabase tipado + queries compartidas
│   │   ├── src/
│   │   │   ├── client.ts
│   │   │   ├── types.ts            # tipos generados desde el esquema
│   │   │   └── queries/
│   │   └── package.json
│   │
│   ├── ui/                         # Sistema de diseño (componentes React + Tailwind)
│   │   ├── src/
│   │   │   ├── primitives/         # Button, Input, Sheet, Dialog...
│   │   │   ├── patterns/           # PlaceCard, ChatBubble, ItineraryTimeline...
│   │   │   └── tokens/             # colores, tipografía, spacing, motion
│   │   └── package.json
│   │
│   ├── config/                     # Config compartida por país, planes, feature flags
│   │   ├── src/
│   │   │   ├── countries.ts
│   │   │   └── plans.ts
│   │   └── package.json
│   │
│   ├── integrations/               # Wrappers de APIs externas
│   │   ├── src/
│   │   │   ├── google-maps.ts
│   │   │   ├── weather.ts
│   │   │   ├── translate.ts
│   │   │   ├── stripe.ts
│   │   │   └── whatsapp.ts
│   │   └── package.json
│   │
│   ├── tsconfig/                   # tsconfig base compartido
│   └── eslint-config/
│
├── supabase/
│   ├── migrations/                 # SQL versionado, fuente de verdad del esquema
│   ├── seed.sql
│   └── config.toml
│
├── docs/
│   └── panama-ai/                  # esta documentación
│
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

## Convenciones

- **`apps/*` no contienen lógica de negocio de IA ni de datos** — solo componen `packages/*` y
  manejan routing/rendering. Esto es lo que permite reusar `ai-core` en un futuro canal de
  WhatsApp o voz sin duplicar código.
- **Un componente de UI que se usa en más de una app va a `packages/ui`**, nunca se copia.
- **Ningún paquete importa desde `apps/`** — la dependencia va en un solo sentido
  (`apps` → `packages`), lo que Turborepo valida automáticamente en el grafo de build.
- **`supabase/migrations` es la única forma de cambiar el esquema.** No se editan tablas a mano
  en el dashboard de Supabase en ningún entorno más allá de exploración local.
