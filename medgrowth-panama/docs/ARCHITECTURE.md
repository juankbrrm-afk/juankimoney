# MedGrowth Panama — Arquitectura del sistema

Este documento es el índice y resumen ejecutivo del diseño. Cada sección
profunda vive en su propio documento dentro de `docs/`.

1. [Visión general y decisiones de stack](#1-visión-general-y-decisiones-de-stack)
2. [Estructura de carpetas](#2-estructura-de-carpetas)
3. [Base de datos](./DATABASE.md)
4. [APIs](./API.md)
5. [Flujos](./FLOWS.md)
6. [Sistema de IA](./AI_SYSTEM.md)
7. [CRM](./CRM.md)
8. [Dashboard](./DASHBOARD.md)
9. [Automatizaciones](./AUTOMATIONS.md)
10. [Estrategia de despliegue](./DEPLOYMENT.md)
11. [Riesgos técnicos y regulatorios](./RISKS.md)
12. [Roadmap / fases del MVP](./ROADMAP.md)

---

## 1. Visión general y decisiones de stack

### 1.1 Modelo de negocio → modelo de datos

El principio de diseño más importante: **multi-tenant desde el día uno**.
Cada clínica es una `Organization`. Todo dato operativo (leads, pacientes,
citas, campañas, conversaciones, reportes, facturación) cuelga de un
`organizationId`. Esto evita una reescritura dolorosa cuando pasamos de "una
clínica piloto en Panamá" a "miles de clínicas en LATAM" — es la misma tabla,
solo con más filas y límites por plan.

Los **usuarios de la plataforma** (`User`) pertenecen a una `Organization` y
tienen un `Role` (Administrador, Manager, Recepción, Doctor, Marketing,
Ventas, Cliente). Un usuario `SUPER_ADMIN` (staff de MedGrowth) puede operar
entre organizaciones — es el rol que usa la agencia para gestionar campañas
de todas las clínicas.

### 1.2 Por qué este stack

- **Next.js (App Router) para todo el frontend + backend del MVP.** Un solo
  runtime para dashboard, CRM, landing builder y API routes reduce
  superficie operativa. Las Route Handlers de Next.js SÍ son Node.js server-side,
  así que cumplen el requisito de "backend Node.js" sin correr un segundo
  servicio en el día 1. Cuando el volumen de automatizaciones o IA lo exija,
  se extraen a servicios independientes (ver `docs/DEPLOYMENT.md`, sección de
  escalado).
- **Prisma + PostgreSQL.** Migraciones tipadas, relaciones multi-tenant
  claras, y el ecosistema mejor soportado en Vercel/Neon/Supabase.
- **Auth.js en vez de Clerk para el MVP.** Clerk es superior en velocidad de
  implementación de UI de auth (2FA, magic links, social login) pero es un
  proveedor externo de pago con su propio modelo de usuarios — atarnos a él
  antes de validar el producto es riesgo innecesario. Se diseña el módulo de
  auth (`packages/config` + `apps/web/src/lib/auth.ts`) detrás de una interfaz
  que permite migrar a Clerk sin tocar el resto del sistema (mismo modelo
  `User`/`Role`, mismo middleware de RBAC). Ver `docs/RISKS.md` #7.
- **`packages/ai` como capa de abstracción, no un SDK expuesto directamente.**
  Los asistentes de IA (WhatsApp, calificación de leads, reportes) llaman a
  `packages/ai`, que decide en runtime si usa OpenAI o Anthropic según
  configuración por `Organization` (columna `aiProvider`/`aiModel` en
  `AIAssistantConfig`). Cambiar de modelo es una fila en base de datos, no un
  deploy.
- **n8n para automatización, no lógica de negocio embebida en cron jobs.**
  Los flujos "cuando entra un lead → WhatsApp + email + Slack + tarea" son
  configurables visualmente por el equipo de operaciones sin tocar código.
  La app expone webhooks (`/api/webhooks/*`) que n8n consume, y n8n llama de
  vuelta a `/api/leads`, `/api/crm/*` para escribir resultados. Esto separa
  "lógica de producto" (en el repo, versionada, testeada) de "orquestación
  operativa" (en n8n, editable por no-ingenieros).
- **RBAC propio en vez de un framework de permisos pesado.** Con 7 roles y
  permisos por recurso, una tabla `Role → Permission` simple en
  `packages/config` cubre el caso de uso sin la complejidad de un motor de
  políticas externo. Se revisita si en el futuro se necesitan permisos
  granulares por-campo.

### 1.3 Multi-tenancy y aislamiento

- Todas las queries pasan por un `organizationId` obtenido de la sesión —
  nunca del input del cliente. Los Route Handlers usan un helper
  `requireOrgContext()` que lanza si falta.
- Los `SUPER_ADMIN` (agencia) acceden vía un selector de organización
  explícito en el dashboard, auditado en `AuditLog`.
- Postgres Row-Level Security queda documentada como hardening de fase 2
  (ver `docs/RISKS.md`); el MVP aplica aislamiento a nivel de aplicación
  (Prisma middleware) porque es más rápido de implementar de forma correcta
  con equipo pequeño, con RLS como capa adicional cuando el número de
  clínicas justifique el costo operativo.

---

## 2. Estructura de carpetas

```
medgrowth-panama/
├── docs/                          Diseño (este árbol de documentos)
│
├── apps/
│   └── web/                       Next.js 14 App Router
│       ├── prisma/                 (symlink lógico → packages/db, ver nota)
│       ├── src/
│       │   ├── app/
│       │   │   ├── (marketing)/     Landing pública de MedGrowth (ventas B2B)
│       │   │   ├── (auth)/          /login, /registro
│       │   │   ├── (dashboard)/     Área autenticada, layout con sidebar + RBAC
│       │   │   │   ├── dashboard/    KPIs, embudo, ROAS
│       │   │   │   ├── crm/          Kanban de leads/pacientes
│       │   │   │   ├── leads/[id]/   Ficha de lead: notas, archivos, historial
│       │   │   │   ├── campaigns/    Google/Meta/TikTok Ads (conectores)
│       │   │   │   ├── whatsapp/     Bandeja de conversaciones
│       │   │   │   ├── calendar/     Citas
│       │   │   │   ├── landing-builder/  Constructor visual + plantillas
│       │   │   │   ├── audit/        Auditoría de sitio/redes/reputación
│       │   │   │   ├── reports/      Reportes mensuales
│       │   │   │   ├── billing/      Stripe — plan, facturas
│       │   │   │   └── settings/     Usuarios, roles, integraciones, IA
│       │   │   └── api/
│       │   │       ├── auth/[...nextauth]/
│       │   │       ├── leads/            Ingesta de leads (form, ads, manual)
│       │   │       ├── crm/[...]/        Mutaciones de pipeline
│       │   │       ├── webhooks/
│       │   │       │   ├── whatsapp/      Meta WhatsApp Cloud API
│       │   │       │   ├── stripe/
│       │   │       │   ├── meta-ads/
│       │   │       │   └── n8n/           Callback genérico de automatizaciones
│       │   │       ├── ai/
│       │   │       │   ├── assistant/     Endpoint de chat/califica/agenda
│       │   │       │   └── audit/          Genera auditoría de sitio+redes
│       │   │       └── reports/generate/
│       │   ├── components/           UI compartida (KPI cards, kanban, charts)
│       │   ├── lib/                  auth.ts, rbac.ts, db.ts, stripe.ts, r2.ts
│       │   └── server/               "Servicios" — lógica de dominio pura,
│       │                              testeable sin Next.js (leadService,
│       │                              crmService, reportService, auditService)
│       └── package.json
│
├── packages/
│   ├── db/                        Prisma schema, client singleton, seed
│   ├── ai/                        Interfaz IProvider + OpenAIProvider/AnthropicProvider,
│   │                                prompts por caso de uso (calificación, WhatsApp, reportes)
│   └── config/                    roles.ts (RBAC), env.ts (validación de entorno), flags.ts
│
└── automations/
    └── n8n/                       Workflows exportados (JSON) + docs de cada uno
```

**Nota de diseño — "servicios" (`apps/web/src/server/`).** En vez de crear
microservicios separados desde el día 1 (over-engineering para una sola
clínica piloto), la lógica de dominio vive en módulos puros dentro de
`server/` que no dependen de Next.js (`Request`/`Response`). Los Route
Handlers son adaptadores delgados que llaman a estos módulos. Esto da la
separación real que pide el brief ("separación entre frontend, backend y
servicios") sin pagar el costo operativo de N despliegues independientes
antes de tener tráfico que lo justifique. Cuando un servicio (p. ej. IA o
reportería) necesite escalar independientemente del resto, se extrae a su
propio `apps/*` sin reescribir lógica — solo se mueve el módulo y se cambia
el adaptador HTTP.

Ver el resto del diseño en los documentos enlazados arriba.
