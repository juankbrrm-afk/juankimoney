# 4. APIs

Tres capas de API distintas, cada una con su propio contrato de estabilidad:

1. **API interna de producto** (consumida por `apps/web` y `apps/admin`) — puede cambiar libre,
   no versionada formalmente, vive como Route Handlers de Next.js.
2. **API pública B2B/B2G** (consumida por terceros: hoteles, municipios, aeropuertos) —
   versionada, documentada, con SLA.
3. **Integraciones salientes** (nosotros como consumidores de Google Maps, Weather, Translate,
   Stripe, WhatsApp).

## 4.1 API interna de producto

Implementada como Route Handlers dentro de `apps/web/app/api/*`, protegidos por Supabase Auth +
RLS (la autorización real vive en la base de datos, el Route Handler es una capa delgada).

| Endpoint | Método | Descripción |
|---|---|---|
| `/api/chat` | `POST` (stream) | Entrada principal del concierge de IA. Recibe mensaje + `conversation_id`, responde en streaming (Vercel AI SDK), puede emitir tool-calls que el cliente renderiza como tarjetas (lugares, itinerario) |
| `/api/places` | `GET` | Búsqueda estructurada (categoría, zona, precio, abierto ahora, cercanía) — usado por la vista "Explorar" sin IA |
| `/api/places/[slug]` | `GET` | Perfil completo de un lugar |
| `/api/itineraries` | `POST`, `GET` | Crear/listar itinerarios del usuario (o de la sesión anónima vía `share_token`) |
| `/api/itineraries/[id]` | `PATCH`, `DELETE` | Modificar itinerario (mover ítem, cambiar día, quitar lugar) |
| `/api/bookings` | `POST` | Crear reserva (dispara Stripe si aplica, notifica al negocio) |
| `/api/reviews` | `POST` | Crear reseña (requiere cuenta) |
| `/api/webhooks/stripe` | `POST` | Webhook de pagos/suscripciones |
| `/api/webhooks/whatsapp` | `POST` | Webhook de confirmaciones de reserva vía WhatsApp Business |

Autenticación: JWT de Supabase Auth en cookie httpOnly; sesiones anónimas para chat/itinerario
usan un `session_id` firmado que se puede "reclamar" al crear cuenta (no forzamos login para
empezar a usar el producto — ver [`07-diseno-ux-ui.md`](./07-diseno-ux-ui.md)).

Rate limiting (Upstash Redis, por IP + por usuario): agresivo en `/api/chat` (costo directo en
tokens de modelo), laxo en lectura de `/api/places`.

## 4.2 APIs B2B / B2G

Estas son el eje de la línea de ingresos institucional descrita en
[`overview.md`](./overview.md#modelo-de-negocio). Versionadas desde el inicio (`/v1/`), con API
keys emitidas por socio y scopes explícitos.

```
GET  /v1/partners/places              # catálogo de POIs filtrable, para widgets de hoteles
GET  /v1/partners/places/{id}
POST /v1/partners/concierge/session   # inicia una sesión de concierge de IA white-label
                                       # (hotel puede pasar su propio branding/logo/tono)
POST /v1/partners/concierge/message   # continúa la conversación (streaming)
GET  /v1/partners/analytics/summary   # reportes agregados para municipios/cámaras de turismo
                                       # (flujo de búsquedas, categorías más pedidas, sin PII)
```

Casos de uso concretos:

- **Hoteles**: embeben el widget de concierge en su propia web/app con su marca; el hotel paga
  una licencia mensual + puede promocionar sus propios servicios dentro de las respuestas.
- **Municipios**: reciben datos agregados y anónimos de demanda turística de su zona (qué
  categorías se buscan, qué eventos generan más interés) para planificación pública.
- **Aeropuertos** (ej. Tocumen): kiosco/pantalla con el concierge integrado para pasajeros en
  tránsito con pocas horas — caso de uso "tengo 5 horas" es literalmente un prompt de ejemplo del
  brief original.

Autenticación: API key + secret por partner, alcance limitado por `country_id` y por los scopes
contratados en su plan. Cuotas y facturación por uso viven en `business_plans`/`business_subscriptions`
reutilizando el mismo modelo de suscripción que negocios individuales, con un `partner_type`
adicional.

## 4.3 Integraciones externas

| Proveedor | Uso | Notas de arquitectura |
|---|---|---|
| **Google Maps + Places API** | Distancia/ruta, autocompletado de direcciones, sincronización de reseñas/rating público, "botón de navegar" | Se cachea agresivamente (Redis) porque tiene costo por llamada; los datos de reseñas de Google se guardan en `reviews (source='google_sync')`, no se pisan las reseñas propias |
| **Weather API** (ej. OpenWeather o Tomorrow.io) | Contexto para el concierge ("va a llover, mejor un plan indoor") y para filtrar recomendaciones outdoor | Cache de 30-60 min por ciudad, no por request |
| **Google Translate API** | Fallback de traducción de UI estática; la conversación con el concierge se traduce nativamente por el LLM, no por esta API | Evita depender de traducción externa para lo que ya hace mejor el modelo de lenguaje |
| **Stripe (+ Stripe Connect)** | Suscripciones de negocio, comisión de reservas, pagos directos a negocios reteniendo % | Connect permite que el dinero del turista llegue al negocio con nuestra comisión retenida automáticamente, sin que nosotros custodiemos fondos de terceros |
| **WhatsApp Business API** | Confirmación de reservas, notificación a negocios sin dashboard activo | Relevante en Panamá donde WhatsApp es el canal de facto para reservas informales |
| **Claude API / OpenAI API** | Ver [`06-sistema-ia.md`](./06-sistema-ia.md) | — |

## Estrategia de versionado y estabilidad

- API interna: sin versión, cambia junto al frontend, sin garantía de compatibilidad hacia atrás.
- API de partners: versionada semánticamente en el path (`/v1/`), con changelog público y
  ventana de deprecación mínima de 6 meses una vez que exista al menos un partner en producción.
- Toda integración externa pasa por un wrapper en `packages/integrations` — nunca se llama a un
  SDK de terceros directo desde `apps/*`, para poder cambiar de proveedor (ej. de OpenWeather a
  Tomorrow.io) tocando un solo archivo.
