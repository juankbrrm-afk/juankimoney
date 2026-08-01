# Automatizaciones (n8n)

n8n corre self-hosted (Railway/Fly.io, ver `DEPLOYMENT.md`). La app y n8n se
comunican por webhooks HTTP con un secret compartido (`N8N_WEBHOOK_SECRET`)
firmado en el header — cada lado verifica la firma antes de procesar.

## Workflow 1 — `lead.created` (el flujo del brief, sección "Automatizaciones")

Disparado por `/api/leads` (POST) al crear cualquier lead. Ver
`automations/n8n/lead-created.workflow.json` para el export real, importable
directo en una instancia de n8n.

Pasos:
1. **Guardar en base de datos** — ya ocurrió antes de disparar el webhook
   (la app es la fuente de verdad; n8n actúa *después* de la escritura, nunca
   antes, para que el lead nunca se pierda si n8n está caído).
2. **Enviar WhatsApp** — plantilla de bienvenida aprobada por Meta, variables
   `{{nombre}}`, `{{especialidad}}`.
3. **Enviar email** — vía Resend, plantilla de bienvenida.
4. **Asignar vendedor** — round-robin entre usuarios con `role=SALES` activos
   de la organización (lee `/api/settings/users?role=SALES`), escribe con
   `PATCH /api/leads/[id]`.
5. **Crear tarea** — `POST /api/leads/[id]/notes` tipo `TASK` con
   vencimiento a 1h ("primer contacto") asignada al vendedor.
6. **Notificar Slack** — si la organización tiene `Integration(SLACK)`
   conectada, mensaje al canal configurado con resumen del lead + link directo
   a la ficha.
7. **Actualizar CRM externo** — si hay `Integration(HUBSPOT)` activa, crea/
   actualiza el contacto correspondiente.
8. Cada paso hace `POST /api/webhooks/n8n` de vuelta con
   `{ leadId, step, status, error? }` → la app escribe `LeadActivity` por
   cada uno, así el timeline del lead muestra exactamente qué automatización
   corrió y si falló (con reintento manual disponible desde la UI).

## Workflow 2 — Recordatorios de cita

Cron cada 15 min: busca `Appointment` con `status=AGENDADA` a 24h y a 2h de
la hora agendada que no tengan un recordatorio ya enviado
(`Appointment.remindersSent`), envía WhatsApp de recordatorio, marca enviado.

## Workflow 3 — Seguimiento por inactividad

Cron diario: busca `Lead` en `stage IN (CONTACTADO, CALIFICADO, COTIZACIÓN)`
sin `LeadActivity` en los últimos N días (configurable por organización),
dispara `assistantService.followUp()` para generar y enviar un mensaje de
reactivación, y crea una tarea para el vendedor asignado si dos intentos de
IA no obtienen respuesta.

## Workflow 4 — Reporte mensual

Cron el día 1 de cada mes a las 06:00 (hora Panamá): para cada organización
activa, llama `POST /api/reports` (ver `FLOWS.md` #4).

## Por qué n8n y no solo cron jobs en Vercel

Vercel Cron es perfecto para disparar el *inicio* de un flujo (y se usa para
eso: los crons de arriba son en realidad Vercel Cron Jobs pegándole a un
endpoint interno que a su vez notifica a n8n, o directamente disparando el
workflow vía la API HTTP de n8n). n8n aporta lo que un cron job no: **edición
visual de la secuencia de pasos y condiciones por el equipo de operaciones**
sin depender de un deploy — crítico porque las reglas de asignación,
plantillas de WhatsApp y umbrales de seguimiento van a cambiar por clínica y
por experimentación de growth, mucho más rápido de lo que el equipo de
ingeniería puede iterar código.
