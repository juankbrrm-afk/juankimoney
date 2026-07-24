# 10. Fases de Desarrollo

Ejecución técnica módulo por módulo. Cada fase tiene un criterio de salida verificable — no se
empieza la siguiente fase sin cerrar el criterio de salida de la anterior.

## Fase 0 — Fundación (infraestructura y datos base)

**Duración estimada**: 2-3 semanas.

- Crear repositorio dedicado (ver [`01-arquitectura.md#repositorio`](./01-arquitectura.md#repositorio)),
  monorepo Turborepo con la estructura de [`02-estructura-carpetas.md`](./02-estructura-carpetas.md).
- Proyecto Supabase (dev + staging), primeras migraciones: `countries`, `cities`, `zones`,
  `categories`, `places` y tablas asociadas (sin monetización todavía).
- CI/CD: Vercel conectado, lint + typecheck + tests en cada PR, Sentry configurado.
- `packages/ai-core` con el orquestador básico y un solo tool (`search_places`) contra datos
  semilla, sin UI todavía — validar el guardrail de cero-alucinación en un entorno de prueba
  aislado antes de construir cualquier interfaz encima.
- Curación de los primeros ~50 lugares (semilla) para poder desarrollar contra datos reales desde
  el día 1, no mocks.

**Criterio de salida**: un script/CLI interno puede enviar un prompt de texto y recibir una
respuesta del orquestador con lugares reales de la base de datos, sin ninguna alucinación, sobre
los 150-300 lugares completos.

## Fase 1 — MVP

**Duración estimada**: 6-8 semanas. Alcance completo en [`09-mvp.md`](./09-mvp.md).

- `apps/web`: landing conversacional, `ChatCanvas`, `PlaceCard`, `PlaceDetailSheet`,
  `ItineraryTimeline`, perfil de lugar SSR.
- `packages/ai-core` completo: los tres tools core (`search_places`, `build_itinerary`,
  `get_weather`), detección de idioma/intención, persona base + override Panamá.
- `apps/admin` mínimo: CRUD interno de lugares/categorías para el equipo de contenido.
- PWA, cuentas opcionales, compartir itinerario por link.
- Completar la curación a 150-300 lugares.

**Criterio de salida**: los criterios cuantitativos y cualitativos de
[`09-mvp.md#criterio-de-éxito-del-mvp`](./09-mvp.md#criterio-de-éxito-del-mvp) cumplidos en
pruebas con turistas reales.

## Fase 2 — Producto core (itinerarios avanzados, reservas, dashboard de negocio)

**Duración estimada**: 6-8 semanas.

- Reservas nativas con Stripe Connect (`bookings`, `create_booking` tool, webhooks).
- Dashboard self-service de negocio (`apps/admin`, rol `business_owner`): reclamar perfil, editar
  fotos/horarios/precios, ver reservas entrantes.
- `escalate_emergency` con datos verificados de embajadas/hospitales.
- `user_preferences` persistente y memoria de largo plazo en el concierge.
- Expansión de dataset a Bocas del Toro, Boquete, Coronado.
- Notificaciones de reserva vía WhatsApp Business API.

**Criterio de salida**: al menos 20 negocios gestionando su propio perfil sin intervención del
equipo interno; retención de usuarios (uso semana 4 sobre cohortes de semana 1) en niveles
saludables antes de activar cobros.

## Fase 3 — Monetización

**Duración estimada**: 6-8 semanas.

- `business_plans`/`business_subscriptions` con checkout de Stripe, listados destacados
  (`places.featured_until`), primeras campañas de `ad_campaigns` con el marcado "Patrocinado"
  obligatorio descrito en [`06-sistema-ia.md`](./06-sistema-ia.md).
- Panel de analítica para negocios (vistas de perfil, clics en botones de acción, reservas).
- Panel de analítica interno completo (`apps/admin/analitica`) para el equipo/inversionistas.

**Criterio de salida**: primer revenue recurrente mensual con al menos 3 negocios en un plan de
pago y una campaña publicitaria activa completada de principio a fin.

## Fase 4 — API B2B/B2G y cobertura nacional

**Duración estimada**: 10-12 semanas.

- API de partners versionada (`/v1/partners/*`) descrita en
  [`04-apis.md#42-apis-b2b--b2g`](./04-apis.md#42-apis-b2b--b2g), con el widget embebible white-label.
- Cobertura de dataset a nivel nacional (más provincias/zonas turísticas de Panamá).
- Primer partner hotelero integrado en producción; primeras conversaciones formales con
  ATP/municipios/Tocumen para la API B2G.

**Criterio de salida**: al menos un partner B2B pagando por la API en producción.

## Fase 5 — Expansión multipaís (país 2)

**Duración estimada**: 10-14 semanas.

- Activar `countries` para Costa Rica: configuración de persona cultural, moneda, pricing.
- Dataset curado para el nuevo país (mismo proceso operativo que Fase 0-1 de Panamá, ahora
  productizado como playbook interno repetible).
- Validar que **ningún cambio de código de producto** fue necesario para el lanzamiento — si lo
  fue, es una señal de que algo en la Fase 0 no se abstrajo correctamente y se corrige antes de
  país 3.

**Criterio de salida**: Costa Rica AI en producción con el motor compartido, y un tiempo/costo de
lanzamiento medible y significativamente menor que el de Panamá — esa métrica es el argumento
central de la siguiente ronda de inversión.

---

## Criterios de salida por fase (resumen para tracking)

| Fase | Criterio de salida |
|---|---|
| 0 | Orquestador de IA responde sin alucinaciones sobre dataset semilla completo |
| 1 | MVP validado con turistas reales, métricas cuantitativas cumplidas |
| 2 | 20+ negocios self-service activos, retención saludable |
| 3 | Revenue recurrente real, 3+ negocios pagando |
| 4 | 1+ partner B2B pagando en producción |
| 5 | País 2 en producción con costo/tiempo de lanzamiento menor que país 1 |
