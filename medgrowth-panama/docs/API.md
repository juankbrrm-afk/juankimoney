# Diseño de APIs

Todas las rutas viven bajo `apps/web/src/app/api/`. Convenciones:

- REST-ish sobre Next.js Route Handlers, JSON in/out.
- Toda ruta autenticada resuelve `organizationId` desde la sesión
  (`requireOrgContext()`), nunca desde el body/query del cliente.
- Webhooks externos (`/api/webhooks/*`) verifican firma del proveedor
  (HMAC de Meta, `Stripe-Signature`, secret compartido con n8n) antes de
  procesar — nunca confían en el payload sin verificar.
- Respuestas de error consistentes: `{ error: { code, message } }` +
  status HTTP correcto (400 validación, 401 no autenticado, 403 sin permiso,
  404, 409 conflicto, 422 regla de negocio, 500).
- Validación de input con Zod en el borde de cada handler.

## Endpoints internos (consumidos por el dashboard)

| Método | Ruta | Descripción | Permiso |
|---|---|---|---|
| GET/POST | `/api/leads` | Listar / crear leads (filtros: stage, source, campaignId, assignedToId) | `leads:read` / `leads:write` |
| GET/PATCH | `/api/leads/[id]` | Detalle / actualizar lead (incluye cambio de `stage`) | `leads:read` / `leads:write` |
| POST | `/api/leads/[id]/notes` | Agregar nota | `leads:write` |
| POST | `/api/leads/[id]/files` | Subir archivo (presigned URL a R2) | `leads:write` |
| POST | `/api/leads/[id]/convert` | Convertir lead → `Patient` | `leads:write` |
| GET/POST | `/api/appointments` | Listar / crear citas | `appointments:*` |
| PATCH | `/api/appointments/[id]` | Reprogramar / cancelar / marcar realizada | `appointments:write` |
| GET | `/api/dashboard/kpis` | KPIs agregados (rango de fechas, canal) | `dashboard:read` |
| GET/POST | `/api/campaigns` | Listar / crear campañas | `campaigns:*` |
| GET | `/api/campaigns/[id]/metrics` | Métricas por campaña (leads, CPL, CAC, ROAS) | `campaigns:read` |
| GET/POST | `/api/conversations` | Bandeja unificada de mensajes | `conversations:*` |
| POST | `/api/conversations/[id]/reply` | Responder (humano o forzar respuesta de IA) | `conversations:write` |
| GET/POST | `/api/landing-pages` | CRUD de landing pages | `landings:*` |
| GET | `/api/landing-templates` | Catálogo de plantillas por especialidad | `landings:read` |
| POST | `/api/audit/run` | Dispara auditoría de sitio/redes/reputación | `audit:write` |
| GET | `/api/audit/[id]` | Resultado de auditoría + link a PDF | `audit:read` |
| GET/POST | `/api/reports` | Listar reportes / disparar generación manual | `reports:*` |
| GET | `/api/billing/subscription` | Estado de plan actual | `billing:read` |
| POST | `/api/billing/checkout` | Crea sesión de Stripe Checkout | `billing:write` |
| GET/POST | `/api/settings/users` | Gestión de usuarios de la organización | `users:*` |
| GET/POST | `/api/settings/integrations` | Conectar/desconectar HubSpot, Meta, Google, WhatsApp, Slack | `integrations:*` |
| GET/PATCH | `/api/settings/ai` | Config de asistentes de IA por organización | `ai:*` |

## Webhooks (entrantes, no requieren sesión de usuario — auth por firma)

| Ruta | Origen | Función |
|---|---|---|
| `/api/webhooks/whatsapp` | Meta WhatsApp Cloud API | Mensajes entrantes → crea/actualiza `Conversation`, dispara asistente de IA |
| `/api/webhooks/meta-ads` | Meta Lead Ads | Lead capturado en formulario nativo de Meta → crea `Lead` |
| `/api/webhooks/stripe` | Stripe | Eventos de suscripción/factura → sincroniza `Subscription`/`Invoice` |
| `/api/webhooks/n8n` | n8n (interno) | Callback genérico: resultado de un workflow (p. ej. "email enviado") → escribe `LeadActivity` |
| `/api/webhooks/hubspot` | HubSpot | Sync bidireccional de contactos/deals (fase 2) |

## API de IA (consumida por el propio backend, no expuesta públicamente)

| Ruta | Función |
|---|---|
| `POST /api/ai/qualify-lead` | Recibe un `Lead`, devuelve score 0-100 + razonamiento corto |
| `POST /api/ai/assistant/reply` | Genera respuesta para un mensaje entrante dado el historial de la conversación y el contexto del lead |
| `POST /api/ai/audit/summarize` | Convierte resultados crudos de auditoría (PageSpeed, SEO, redes) en recomendaciones en lenguaje natural |
| `POST /api/ai/reports/insights` | Genera las recomendaciones del reporte mensual a partir de las métricas del período |

Estas rutas llaman a `packages/ai`, que resuelve el proveedor
(OpenAI/Anthropic) según `AIAssistantConfig` de la organización — el resto
del sistema nunca importa un SDK de IA directamente.

## Ingesta externa (formularios de landing pages)

`POST /api/public/leads/[landingSlug]` — endpoint público (rate-limited,
sin sesión) que reciben las landing pages publicadas. Valida el slug contra
una `LandingPage` activa, crea el `Lead` con `source = LANDING_PAGE`, y
encola las automatizaciones (WhatsApp de bienvenida, notificación interna).
