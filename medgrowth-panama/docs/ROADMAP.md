# Roadmap / fases del MVP

El brief pide diseño completo primero y luego "un MVP funcional que pueda
ponerse en producción y crecer de forma incremental". Este documento es el
contrato entre ese diseño completo (docs/*) y lo que efectivamente existe
como código en este commit.

## Fase 0 — Este MVP (implementado en este commit)

- ✅ Monorepo (`pnpm` workspaces): `apps/web`, `packages/db`,
  `packages/ai`, `packages/config`.
- ✅ Esquema de base de datos completo y multi-tenant (todas las entidades de
  `DATABASE.md`) con Prisma, listo para `migrate`.
- ✅ Seed con clínica demo, usuarios de los 7 roles, leads en distintas
  etapas del embudo, una landing page publicada.
- ✅ Auth.js con credenciales (email/password) + sesión con `role` y
  `organizationId`, middleware de RBAC (`packages/config/roles.ts`) aplicado
  a rutas del dashboard y a los Route Handlers.
- ✅ Dashboard: KPIs reales calculados desde la base de datos (pacientes
  nuevos, leads, CPL, CAC, ROAS, ventas, consultas agendadas/realizadas/
  canceladas, embudo por etapa).
- ✅ CRM: tablero kanban funcional (mover leads entre etapas), ficha de lead
  con notas e historial.
- ✅ Landing builder: catálogo de plantillas por especialidad (cirugía
  plástica, odontología, dermatología, medicina estética, fertilidad) +
  página pública de ejemplo renderizada desde una `LandingPage` con formulario
  de captura conectado a `/api/public/leads/[slug]`.
- ✅ `packages/ai` con providers de OpenAI y Anthropic implementados y
  endpoint de calificación de lead (`/api/ai/qualify-lead`) funcional contra
  una API key real.
- ✅ API de leads completa (`/api/leads`, `/api/leads/[id]`, notas,
  conversión a paciente).
- ✅ Workflow de n8n `lead.created` exportado como JSON de referencia.
- ✅ Página de settings con gestión de usuarios/roles.

## Fase 1 — Piloto en producción (Ciudad de Panamá, 1-3 clínicas)

- Integración real de WhatsApp Business Cloud API (el MVP deja el adaptador
  con interfaz lista y modo mock; conectar credenciales reales de Meta).
- Envío real de email transaccional vía Resend (adaptador listo, falta
  cuenta de producción).
- Stripe Checkout + Customer Portal para cobro de suscripción SaaS.
- Registro de consentimiento (`ConsentRecord`) en formularios públicos y
  primer mensaje de WhatsApp — requisito de `RISKS.md` #1 antes del primer
  cliente real.
- Auditoría de sitio/redes con PageSpeed Insights + Google Business Profile
  reales (el MVP deja el endpoint y el modelo de datos, pendiente conectar
  las APIs externas).
- Generación real de PDF de reportes mensuales + envío automático.

## Fase 2 — Escalar a más clínicas / LATAM

- Row-Level Security en Postgres (defensa en profundidad multi-tenant).
- Sync automático de gasto real de Meta Ads / Google Ads / TikTok Ads
  (reemplaza entrada manual de costo por campaña).
- Integración bidireccional con HubSpot y adaptador genérico `CRMSyncAdapter`
  para otros CRMs.
- Cola de trabajos (BullMQ/Redis) para desacoplar generación de IA y PDFs de
  las funciones serverless.
- 2FA obligatorio para roles administrativos, logs de auditoría exportables,
  revisión de cumplimiento Ley 81 con asesoría legal formal.
- Editor visual drag-and-drop del landing builder (el MVP tiene selección de
  plantilla + edición de campos de contenido; el editor visual tipo
  "constructor" con bloques arrastrables es la iteración siguiente).
- Blog + calendario editorial con generación de contenido por IA.
- Migración opcional de Auth.js → Clerk si el volumen de organizaciones
  justifica delegar la gestión de identidad.

Este documento se actualiza en cada release — es el punto de referencia para
"qué es demo/diseño" vs. "qué corre en producción hoy".
