# CRM interno

## Pipeline (kanban)

```
LEAD → CONTACTADO → CALIFICADO → COTIZACIÓN → CITA_AGENDADA → PACIENTE
                                        ↘ NO_INTERESADO
                                        ↘ PERDIDO
```

- `NO_INTERESADO` y `PERDIDO` son estados terminales alcanzables desde
  cualquier etapa (el kanban los muestra como columnas separadas al final,
  colapsadas por defecto para no distraer del flujo activo).
- Cada movimiento entre columnas es un drag-and-drop en el dashboard que
  llama a `PATCH /api/leads/[id]` con el nuevo `stage`; el backend escribe
  `LeadActivity` y dispara automatizaciones si aplica (p. ej. entrar a
  `COTIZACIÓN` puede disparar el envío automático de un PDF de precios).

## Ficha del lead (`/crm` → detalle)

Cuatro bloques, todos respaldados por tablas propias para no perder
historial cuando el lead cambia de estado:

- **Notas** (`LeadNote`) — texto libre, autor, timestamp.
- **Archivos** (`LeadFile`) — subidos a Cloudflare R2 vía URL prefirmada;
  metadatos (nombre, tipo, tamaño, quién subió) en Postgres.
- **Historial** (`LeadActivity`) — línea de tiempo inmutable: creación,
  cambios de estado, mensajes enviados/recibidos, llamadas registradas,
  tareas completadas. Es un event log — nunca se edita ni se borra, solo se
  agrega (auditable).
- **Llamadas** (`LeadCall`) — registro manual (duración, resultado,
  quién llamó) por ahora; el modelo deja espacio para `recordingUrl` cuando
  se integre un proveedor de telefonía (fase 2, no priorizado por el brief).
- **Mensajes** — no se duplican aquí; se linkean a la `Conversation`
  correspondiente en la bandeja unificada de WhatsApp/Instagram/Facebook/Email.
- **Seguimiento** (`LeadFollowUp`) — próxima acción programada (fecha +
  tipo: llamar, WhatsApp, email) — lo que alimenta la vista "tareas de hoy"
  de cada vendedor y las automatizaciones de seguimiento por inactividad.

## Asignación

`assignedToId` en `Lead`. Reglas de asignación (round-robin, por
especialidad, por carga actual) viven en el workflow de n8n de
`lead.created` (`docs/AUTOMATIONS.md`), no hardcodeadas — cada clínica tiene
su propio equipo de ventas y reglas.

## Por qué no reutilizamos HubSpot como el CRM primario

El brief pide "CRM interno" + integración con HubSpot. Decisión: el CRM
interno es la fuente de verdad operativa (es donde vive el embudo de
adquisición específico de clínicas — estados, scoring de IA, vínculo con
WhatsApp — que un CRM genérico no modela bien out-of-the-box). HubSpot se
integra como **destino de sincronización** (`Integration` con
`provider=HUBSPOT`) para clínicas que ya tienen HubSpot como sistema de
ventas/marketing más amplio y quieren ver sus leads de MedGrowth ahí también.
El adaptador (`server/integrations/hubspot.ts`) mapea `Lead` → Contact/Deal
de HubSpot; la interfaz `CRMSyncAdapter` permite agregar Salesforce o
Pipedrive sin tocar el core.
