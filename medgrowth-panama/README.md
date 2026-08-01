# MedGrowth Panama

**Llenamos la agenda de tu clínica con pacientes calificados.**

MedGrowth Panama es una plataforma SaaS + servicio de agencia para adquisición
de pacientes de clínicas privadas en Panamá (cirugía plástica, odontología,
dermatología, medicina estética, ginecología, ortopedia). El cliente de la
plataforma es la clínica, no el paciente: vendemos leads calificados,
conversión y visibilidad de ROI por canal (Meta Ads, Google Ads, TikTok,
WhatsApp, orgánico).

Este directorio contiene el diseño completo y el MVP en producción del
sistema. La documentación de arquitectura completa vive en [`docs/`](./docs),
empezando por [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

## Estructura del monorepo

```
medgrowth-panama/
├── docs/                  Diseño completo (arquitectura, DB, APIs, flujos, IA, riesgos...)
├── apps/
│   └── web/                Next.js 14 (App Router) — dashboard, CRM, landing builder, APIs
├── packages/
│   ├── db/                  Prisma schema + client compartido (multi-tenant)
│   ├── ai/                  Abstracción de proveedores de IA (OpenAI / Anthropic, intercambiables)
│   └── config/               RBAC, feature flags, env schema compartidos
└── automations/
    └── n8n/                  Workflows de automatización (lead → WhatsApp/email/CRM/Slack)
```

## Quickstart (desarrollo local)

```bash
cd medgrowth-panama
pnpm install
cp apps/web/.env.example apps/web/.env
# Configura DATABASE_URL (Postgres), NEXTAUTH_SECRET, y al menos un provider de IA
pnpm --filter @medgrowth/db db:push
pnpm --filter @medgrowth/db db:seed
pnpm --filter web dev
```

La app queda disponible en `http://localhost:3000`. El seed crea una clínica
demo (`Clínica Demo Panamá`), un usuario administrador, leads de ejemplo en
distintos estados del embudo, y una landing page de ejemplo.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | Next.js 14 (App Router), React, TypeScript, TailwindCSS |
| Backend | Next.js Route Handlers (Node.js) + `packages/ai` y `packages/db` como servicios internos |
| Base de datos | PostgreSQL + Prisma ORM (multi-tenant por `organizationId`) |
| Auth | Auth.js (NextAuth) con RBAC — capa de adaptador lista para migrar a Clerk |
| Storage | Cloudflare R2 (S3-compatible) |
| IA | OpenAI + Anthropic detrás de una interfaz intercambiable por configuración |
| Automatización | n8n (self-hosted) |
| CRM externo | HubSpot (adaptador), arquitectura preparada para Salesforce/Pipedrive |
| WhatsApp | Meta WhatsApp Business Cloud API (adaptador con modo mock) |
| Email | Resend |
| Pagos | Stripe (suscripciones SaaS + facturación de agencia) |
| Hosting | Vercel (web), Railway/Fly.io (n8n + workers), Neon/Supabase (Postgres) |

## Estado del MVP

Ver [`docs/ROADMAP.md`](./docs/ROADMAP.md) para el detalle de qué está
implementado en este MVP vs. lo que queda diseñado pero pendiente de
construir.
