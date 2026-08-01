# Estrategia de despliegue

## Topología (MVP)

```
                          ┌─────────────────────┐
   Usuarios (clínicas) →  │   Vercel (apps/web)  │ ← Next.js (dashboard + API + landings públicas)
                          └──────────┬───────────┘
                                     │
                 ┌───────────────────┼────────────────────┐
                 ▼                   ▼                     ▼
        ┌─────────────────┐  ┌──────────────┐    ┌──────────────────┐
        │ Postgres (Neon)  │  │ Cloudflare R2 │    │ n8n (Railway/Fly) │
        │  primary + branch │  │  (archivos,   │    │  automatizaciones │
        │  por preview deploy│  │   PDFs, R2)   │    └─────────┬─────────┘
        └─────────────────┘  └──────────────┘              │
                                                              ▼
                                              WhatsApp Cloud API / Resend /
                                              Stripe / Slack / HubSpot / Meta & Google Ads
```

- **Vercel** hostea `apps/web` (frontend + API routes). Preview deployments
  automáticos por PR, cada uno con su propia branch de base de datos en Neon
  (aislamiento total para QA sin tocar producción).
- **Postgres gestionado (Neon o Supabase)** — Neon recomendado por
  branching de base de datos nativo, que encaja con el flujo de preview
  deployments de Vercel.
- **Cloudflare R2** para archivos de leads, PDFs de reportes/auditorías y
  assets del landing builder — sin costo de egress, importante cuando el
  volumen de PDFs mensuales crezca con el número de clínicas.
- **n8n self-hosted** en Railway o Fly.io (no n8n Cloud, para controlar costo
  a escala y tener control total de los workflows) — Docker oficial de n8n,
  Postgres propio (puede ser el mismo Neon en un schema separado, o una
  instancia dedicada cuando el volumen lo justifique).
- **Vercel Cron** dispara los triggers periódicos (recordatorios, reportes,
  seguimiento) llamando a endpoints internos que a su vez notifican a n8n.

## CI/CD

- GitHub Actions (o Vercel's git integration directo): en cada PR — lint,
  typecheck, `prisma validate`, tests unitarios de `server/*Service.ts`
  (lógica de negocio pura, sin mocks pesados de Next.js).
- Migraciones de Prisma se aplican en el paso de build de Vercel
  (`prisma migrate deploy`) contra la base de datos de producción/preview
  correspondiente — nunca `db push` en producción.
- Secrets (API keys de OpenAI/Anthropic, WhatsApp, Stripe, Resend, R2,
  HubSpot) viven en variables de entorno de Vercel por ambiente
  (development/preview/production), nunca en el repo. `packages/config/env.ts`
  valida con Zod al boot y falla rápido si falta una requerida.

## Entornos

| Entorno | Base de datos | Dominio | Propósito |
|---|---|---|---|
| Development | Postgres local / Neon branch personal | localhost:3000 | Desarrollo |
| Preview | Neon branch por PR | `*.vercel.app` | QA por feature |
| Staging | Neon branch `staging` | `staging.medgrowthpanama.com` | Demo a clientes / UAT |
| Production | Neon `main` | `app.medgrowthpanama.com` | Clínicas reales |

## Escalado (cuándo separar servicios)

El MVP corre todo dentro de `apps/web` (Route Handlers) por simplicidad
operativa. Se extraen a servicios independientes cuando haya evidencia de
necesidad, no antes:

- **Cola de trabajos de IA/automatización** (BullMQ + Redis, o un worker en
  Railway) cuando el volumen de mensajes de WhatsApp/generación de reportes
  empiece a competir por tiempo de ejecución con requests de usuario en
  Vercel (las funciones serverless de Vercel tienen límite de duración).
- **Servicio de reportería/PDF** como worker separado si la generación de
  PDFs mensual para miles de clínicas no cabe en la ventana de ejecución
  serverless — se diseña `reportService` ya desacoplado (sección 2 de
  `ARCHITECTURE.md`) precisamente para que esta extracción sea mover un
  módulo, no reescribirlo.
- **Row-Level Security en Postgres** como capa adicional de aislamiento
  multi-tenant cuando el número de clínicas y el requisito de compliance lo
  justifiquen (ver `RISKS.md`).

## Backups y continuidad

- Postgres: point-in-time recovery habilitado (Neon/Supabase lo dan
  out-of-the-box) + snapshot diario retenido 30 días.
- R2: versionado de objetos habilitado para archivos de leads y reportes.
- Runbook de restauración documentado y probado trimestralmente (no solo
  "creemos que el backup funciona").
