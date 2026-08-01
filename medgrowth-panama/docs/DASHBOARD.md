# Dashboard

## KPIs principales (`GET /api/dashboard/kpis?from=&to=&channel=`)

Todos calculados server-side desde `Lead`, `Appointment`, `Campaign`,
`Patient` — filtrables por rango de fechas y canal, comparados contra el
período anterior equivalente (para mostrar flechas ↑/↓):

- **Pacientes nuevos** — `count(Patient.createdAt in range)`
- **Leads** — `count(Lead.createdAt in range)`
- **Costo por lead (CPL)** — `sum(Campaign.costTotal in range) / count(leads in range)`, por canal y agregado
- **Costo por paciente (CAC)** — `sum(Campaign.costTotal) / count(patients)`
- **ROAS** — `sum(Patient.estimatedValue closed in range) / sum(Campaign.costTotal in range)`
- **Ventas** — `sum(Patient.estimatedValue)` en el rango (ingreso atribuido)
- **Consultas agendadas / realizadas / canceladas** — `count(Appointment)` agrupado por `status`
- **Embudo** — conteo de leads por `stage` actual + tasa de conversión etapa→etapa (para detectar dónde se pierden los leads)

## Layout

- **Resumen** (`/dashboard`) — tarjetas KPI arriba, gráfico de embudo,
  gráfico de leads/pacientes por semana, tabla "actividad reciente".
- **Google Ads / Meta Ads** (`/dashboard/campaigns`) — métricas por canal:
  gasto, leads, CPL, CAC, ROAS, comparación entre campañas. Fase MVP: entrada
  manual de gasto + leads etiquetados por `utm_campaign`; fase 2: sync
  automático vía Meta Marketing API / Google Ads API (`Integration`).
- **WhatsApp** (`/dashboard/whatsapp`) — bandeja de conversaciones,
  volumen por día, % resuelto por IA vs. humano, tiempo de primera respuesta.
- **Calendario** (`/dashboard/calendar`) — vista semanal/mensual de
  `Appointment`, con acciones rápidas (confirmar, reprogramar, cancelar).
- **Reportes** (`/dashboard/reports`) — histórico de `Report` (PDF mensual)
  + botón "generar ahora" para un rango custom.
- **Facturación** (`/dashboard/billing`) — plan actual, próxima factura,
  historial (`Invoice`), botón a Stripe Customer Portal.
- **Landing Builder** (`/dashboard/landing-builder`) — ver `ROADMAP.md`.
- **Auditoría** (`/dashboard/audit`) — resultado de la última auditoría +
  botón "auditar ahora".

## Principio de render

KPIs se calculan en Route Handlers (Server Components hacen fetch directo a
través de `server/dashboardService.ts`, sin pasar por un round-trip HTTP
innecesario cuando se renderiza en el propio Next.js server) — el cliente
solo hidrata interactividad (filtros de fecha/canal, drag del kanban). Esto
mantiene el TTFB bajo y evita exponer lógica de agregación en el bundle de
cliente.
