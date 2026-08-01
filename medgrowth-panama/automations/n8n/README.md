# Workflows de n8n

`lead-created.workflow.json` — importable directo en n8n (Workflows →
Import from File). Implementa el flujo descrito en
`../../docs/AUTOMATIONS.md` workflow 1: WhatsApp de bienvenida, email,
asignación de vendedor, tarea de seguimiento, notificación a Slack, sync
opcional con HubSpot, y callback de vuelta a la app para dejar rastro en el
historial del lead (`LeadActivity`).

## Variables de entorno requeridas en la instancia de n8n

- `APP_BASE_URL` — URL de `apps/web` (p. ej. `https://app.medgrowthpanama.com`)
- `N8N_WEBHOOK_SECRET` — mismo valor que `N8N_WEBHOOK_SECRET` en `apps/web`
- Credenciales de WhatsApp Cloud API, Resend, Slack y HubSpot configuradas
  como credenciales de n8n (no hardcodeadas en el JSON del workflow).

## Cómo se dispara

`apps/web` hace `POST` a `{N8N_WEBHOOK_URL}/medgrowth/lead-created` cada vez
que se crea un `Lead` (ver `src/server/leadService.ts` → `createLead`, fase
siguiente: disparar este webhook desde ahí en vez de solo dejarlo
documentado — en el MVP actual el webhook está descrito y listo para
conectar, pendiente de una instancia real de n8n en producción).

Los workflows de recordatorios de citas, seguimiento por inactividad y
reporte mensual (workflows 2-4 de `docs/AUTOMATIONS.md`) siguen el mismo
patrón: cron trigger en n8n → llamada a un endpoint de `apps/web` → n8n
ejecuta las notificaciones → callback a `/api/webhooks/n8n`. Se agregan como
JSON adicionales en esta carpeta a medida que se conecten instancias reales
de WhatsApp/Resend en producción (ver `docs/ROADMAP.md` Fase 1).
