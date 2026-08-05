# 04 — Especificación de APIs

## 1. Superficies

VoicePilot expone **cinco** superficies distintas. Cada una existe porque
tiene un consumidor y unas restricciones que las otras no pueden cubrir.

| Superficie | Protocolo | Consumidor | Por qué existe |
|---|---|---|---|
| **API pública** | REST + JSON, OpenAPI 3.1 | Integradores, clientes, extensión | Estable, versionada, documentada |
| **API del dashboard** | GraphQL | Frontend propio | El dashboard pide 12 agregados por pantalla; REST lo haría con 12 round-trips |
| **Canal de tiempo real** | WebSocket | Consola del agente, dashboard, extensión | Push de eventos de llamada |
| **Bus interno** | gRPC | Servicios entre sí | Streaming bidireccional, latencia |
| **Webhooks** | HTTP POST firmado | Sistemas del cliente | Notificación saliente |

**Regla:** la API pública nunca expone detalles internos (nombres de modelos,
ids de proveedores de IA, topología). Es un contrato, no una ventana.

---

## 2. Convenciones de la API pública

```
Base:            https://api.voicepilot.ai/v1
Auth:            Authorization: Bearer <jwt>   |   X-API-Key: vp_live_...
Tenant:          derivado del token. NUNCA de un parámetro.
Idempotencia:    Idempotency-Key: <uuid>  (obligatorio en POST que crean)
Paginación:      cursor — ?limit=50&cursor=<opaque>
Rate limit:      por tenant y por clave. Headers RateLimit-*
Errores:         RFC 9457 (application/problem+json)
Trazabilidad:    X-Request-Id en request y respuesta
```

### Formato de error

```json
{
  "type": "https://docs.voicepilot.ai/errors/validation-failed",
  "title": "Validation failed",
  "status": 422,
  "detail": "phone_e164 must be in E.164 format",
  "instance": "/v1/contacts",
  "request_id": "req_01HZX...",
  "errors": [
    { "field": "phone_e164", "code": "invalid_format", "value": "555-1234" }
  ]
}
```

### Versionado

Versión en la ruta (`/v1`). Cambios incompatibles crean `/v2`. Los cambios
compatibles (campos nuevos opcionales) no cambian versión. **Toda versión se
soporta 18 meses después de anunciar su fin de vida.** Sin excepciones — es
lo que hace que un enterprise nos integre sin miedo.

---

## 3. API pública — Recursos

### 3.1 Llamadas

```http
GET    /v1/calls
       ?agent_id=&campaign_id=&status=&from=&to=&disposition=
       &min_duration_ms=&sentiment_lt=&has_violations=true
GET    /v1/calls/{id}
GET    /v1/calls/{id}/transcript      # ?format=json|srt|vtt|txt
GET    /v1/calls/{id}/analysis
GET    /v1/calls/{id}/events
GET    /v1/calls/{id}/suggestions
GET    /v1/calls/{id}/violations
GET    /v1/calls/{id}/recordings      # devuelve URLs firmadas, TTL 5 min
POST   /v1/calls/{id}/disposition
PATCH  /v1/calls/{id}/notes
POST   /v1/calls/search               # búsqueda full-text sobre transcripciones
```

**Control de llamada en vivo** (usado por la consola del agente):

```http
POST   /v1/calls/{id}/voice-mode      { "mode": "A" | "B" | "off" }
POST   /v1/calls/{id}/bypass          { "enabled": true, "reason": "..." }
POST   /v1/calls/{id}/hold
POST   /v1/calls/{id}/transfer        { "to_user_id": "..." }
POST   /v1/calls/{id}/monitor         { "mode": "listen"|"whisper"|"barge" }
```

> `monitor` requiere permiso `call:monitor` y **siempre** escribe en
> `audit_log`. Escuchar una llamada de un empleado es una acción sensible y
> queda registrada con actor, momento y duración.

**Ejemplo de respuesta:**

```json
{
  "id": "call_01HZXK...",
  "status": "completed",
  "direction": "outbound",
  "agent": { "id": "usr_...", "name": "Andrés Rojas" },
  "contact": { "id": "con_...", "name": "Michael Reed", "phone_e164": "+13055550142" },
  "campaign_id": "cmp_...",
  "voice_mode": "A",
  "started_at": "2026-08-05T14:22:10.220Z",
  "duration_ms": 412000,
  "talk_time_ms": 388400,
  "disposition": "sale_closed",
  "quality": {
    "latency_p50_ms": 268,
    "latency_p95_ms": 331,
    "bypass_ms": 0,
    "audio_mos": 4.21,
    "packet_loss_pct": 0.2
  },
  "analysis": {
    "sentiment_overall": 0.62,
    "close_probability": 0.81,
    "objections": [
      { "type": "price", "quote": "that's more than I wanted to spend",
        "at_ms": 145200, "handled": true }
    ],
    "next_steps": ["Enviar contrato antes del viernes"]
  }
}
```

### 3.2 CRM

```http
# Contactos
GET|POST      /v1/contacts
GET|PATCH|DEL /v1/contacts/{id}
POST          /v1/contacts/bulk           # hasta 1000, procesamiento asíncrono
GET           /v1/contacts/{id}/timeline  # llamadas + notas + tareas, ordenado

# Leads
GET|POST      /v1/leads
GET|PATCH|DEL /v1/leads/{id}
POST          /v1/leads/{id}/convert      # → contact + opportunity
POST          /v1/leads/{id}/assign       { "owner_id": "..." }

# Pipeline
GET           /v1/pipelines
GET|POST      /v1/opportunities
GET|PATCH     /v1/opportunities/{id}
POST          /v1/opportunities/{id}/stage  { "stage_id": "...", "reason": "..." }

# Actividad
GET|POST      /v1/notes
GET|POST      /v1/tasks
PATCH         /v1/tasks/{id}
GET|POST      /v1/calendar/events
```

### 3.3 Conocimiento

```http
POST   /v1/knowledge-bases
GET    /v1/knowledge-bases/{id}
POST   /v1/knowledge-bases/{id}/documents      # multipart, hasta 100 MB
GET    /v1/knowledge-bases/{id}/documents
GET    /v1/documents/{id}                      # incluye estado de ingesta
DELETE /v1/documents/{id}
POST   /v1/knowledge-bases/{id}/publish        # promueve a nueva kb_version
POST   /v1/knowledge-bases/{id}/query          # prueba de recuperación, para QA
```

`POST /documents` responde **202 Accepted** con un `job_id`. La ingesta
(extracción → chunking → embeddings) es asíncrona y su progreso llega por
webhook y por WebSocket.

### 3.4 Scripts y compliance

```http
GET|POST      /v1/scripts
GET|PATCH     /v1/scripts/{id}
POST          /v1/scripts/{id}/activate
GET|POST      /v1/scripts/{id}/steps
GET|POST      /v1/compliance-rules
PATCH         /v1/compliance-rules/{id}
POST          /v1/compliance-rules/{id}/test   # contra transcripciones históricas
GET           /v1/violations
```

`POST /compliance-rules/{id}/test` es una feature deliberada: antes de activar
una regla, el cliente la ejecuta sobre sus últimas 1,000 llamadas y ve cuántas
alertas habría disparado. Sin esto, las reglas mal calibradas generan ruido y
los agentes aprenden a ignorar las alertas — que es el peor resultado posible.

### 3.5 Reportes

```http
GET    /v1/reports/overview          ?from=&to=&team_id=
GET    /v1/reports/agents            # ranking, KPIs por agente
GET    /v1/reports/campaigns
GET    /v1/reports/compliance
GET    /v1/reports/ai-impact         # sugerencias usadas vs conversión
POST   /v1/reports/export            { format: "csv"|"xlsx", ... } → 202 + job
```

### 3.6 Integraciones

```http
GET    /v1/integrations/providers
POST   /v1/integrations/connections            # inicia OAuth, devuelve auth_url
GET    /v1/integrations/connections/{id}
DELETE /v1/integrations/connections/{id}
GET    /v1/integrations/connections/{id}/fields   # descubre campos del CRM remoto
PUT    /v1/integrations/connections/{id}/mappings
POST   /v1/integrations/connections/{id}/sync     # sincronía manual
GET    /v1/integrations/connections/{id}/operations  # cola, fallos, DLQ
```

---

## 4. Canal de tiempo real (WebSocket)

```
wss://rt.voicepilot.ai/v1/stream?token=<jwt-corto>
```

El token es de vida corta (60 s), obtenido vía `POST /v1/realtime/token`.
Nunca se pasa el JWT de sesión por query string.

### Suscripción

```json
{ "op": "subscribe", "channels": ["call:call_01HZX...", "agent:usr_...", "tenant:floor"] }
```

| Canal | Quién | Contenido |
|---|---|---|
| `call:{id}` | Agente en la llamada, supervisor con permiso | Todo lo de esa llamada |
| `agent:{id}` | El propio agente, su supervisor | Presencia, asignaciones |
| `tenant:floor` | Supervisores | Llamadas activas, alertas críticas |
| `job:{id}` | Quien lanzó el job | Progreso de ingesta/exportación |

### Eventos servidor → cliente

```jsonc
// Transcripción parcial — el evento de mayor frecuencia
{ "t": "transcript.partial", "call_id": "...", "seq": 1042,
  "speaker": "customer", "text": "I'm not really inter",
  "start_ms": 145200, "confidence": 0.72 }

{ "t": "transcript.final", "call_id": "...", "seq": 1042,
  "speaker": "customer", "text": "I'm not really interested.",
  "start_ms": 145200, "end_ms": 146850, "confidence": 0.96 }

// Sugerencia del copilot — siempre con citas
{ "t": "suggestion", "call_id": "...", "id": 88213,
  "trigger_type": "objection", "trigger_text": "I'm not really interested.",
  "suggestion_text": "I completely understand. Most of our clients said the same thing before they saw the first month's numbers. Can I take sixty seconds to show you what changed for them?",
  "citations": [
    { "document_id": "doc_...", "title": "Objection Handling v4",
      "page": 7, "heading_path": "Objeciones > No interesado", "score": 0.89 }
  ],
  "grounding_score": 0.91, "latency_ms": 640 }

// Alerta de compliance
{ "t": "compliance.alert", "call_id": "...", "severity": "critical",
  "rule_key": "identity_verification",
  "alert_text": "⚠ Debes verificar identidad antes de continuar",
  "at_ms": 61000 }

// Señales en vivo
{ "t": "signals", "call_id": "...", "at_ms": 147000,
  "sentiment": -0.31, "stress": 0.58, "interest": 0.22,
  "close_probability": 0.34, "agent_confidence": 0.71 }

// Salud del pipeline de voz — el agente DEBE ver esto
{ "t": "voice.health", "call_id": "...", "state": "ok" | "degraded" | "bypass",
  "latency_ms": 287, "reason": null }

// Objeción detectada, cambio de etapa del script, etc.
{ "t": "script.step", "call_id": "...", "step_key": "pitch", "status": "completed" }
{ "t": "call.ended", "call_id": "...", "duration_ms": 412000 }
{ "t": "analysis.ready", "call_id": "..." }
```

### Eventos cliente → servidor

```jsonc
{ "op": "suggestion.feedback", "id": 88213, "value": 1 }
{ "op": "voice.mode", "call_id": "...", "mode": "B" }
{ "op": "compliance.ack", "violation_id": 5521 }
{ "op": "ping" }   // cada 20 s; el servidor cierra a los 45 s sin actividad
```

### Reglas de diseño del canal

- **Ordenación garantizada por `call_id`**, no global. Cada canal lleva su
  propio `seq`; el cliente detecta huecos y pide `resync`.
- **Reconexión con reanudación:** al reconectar, el cliente envía el último
  `seq` recibido y el servidor reenvía desde ahí (buffer de 60 s en Redis).
- **Coalescing de `transcript.partial`:** máximo 8 eventos/segundo por
  llamada. Un ASR puede emitir 50/s; renderizar eso quema batería y CPU sin
  aportar nada perceptible.
- **El WebSocket nunca transporta audio.** El audio va por WebRTC, siempre.

---

## 5. APIs internas (gRPC)

Contratos en `shared/proto/`. Los tres críticos:

```protobuf
service VoiceProcessor {
  // El stream que sostiene la llamada. Bidireccional, larga vida.
  rpc Process(stream AudioFrame) returns (stream ProcessedFrame);
}

message AudioFrame {
  string call_id = 1;
  uint64 seq = 2;
  uint64 capture_timestamp_ns = 3;
  Speaker speaker = 4;
  bytes  pcm_f32 = 5;          // 20 ms @ 24 kHz mono
  bool   voice_active = 6;
  VoiceConfig config = 7;      // solo en el primer frame o al cambiar
}

message ProcessedFrame {
  uint64 seq = 1;
  uint64 capture_timestamp_ns = 2;  // viaja de vuelta: así medimos latencia real
  bytes  pcm_f32 = 3;
  ProcessingState state = 4;        // OK | DEGRADED | BYPASS_RECOMMENDED
  uint32 processing_latency_us = 5;
}

service Transcriber {
  rpc Transcribe(stream AudioFrame) returns (stream TranscriptEvent);
}

service Copilot {
  // Unario: se llama al detectar un disparador, no continuamente
  rpc Suggest(SuggestRequest) returns (SuggestResponse);
}
```

**Decisión:** `capture_timestamp_ns` viaja en la ida y en la vuelta. Es lo
que permite medir latencia real punto a punto en producción, en lugar de
sumar estimaciones por etapa. Una métrica medida vale más que diez estimadas.

---

## 6. Webhooks salientes

```http
POST <url del cliente>
X-VoicePilot-Signature: t=1754400000,v1=<hmac-sha256>
X-VoicePilot-Event: call.completed
X-VoicePilot-Delivery: whd_01HZX...
```

| Evento | Cuándo |
|---|---|
| `call.started` | El cliente contesta |
| `call.completed` | Cuelgue |
| `call.analysis.ready` | Análisis post-llamada listo (~20 s después) |
| `compliance.violation` | Violación crítica, en vivo |
| `lead.created` / `lead.status_changed` | Cambios de CRM |
| `opportunity.stage_changed` | Movimiento de pipeline |
| `document.ingested` / `document.failed` | Ingesta de conocimiento |
| `integration.sync_failed` | El conector falló tras agotar reintentos |

- Firma HMAC-SHA256 con secreto por endpoint, con timestamp para evitar replay
- Reintentos: 8 intentos con backoff exponencial + jitter, hasta 24 h
- Entrega **al menos una vez** → el consumidor debe deduplicar por `delivery id`
- Endpoint deshabilitado automáticamente tras 72 h de fallo continuo, con aviso

---

## 7. API para la extensión de Chrome

La extensión tiene restricciones propias (sin backend propio, CSP estricta,
service worker que muere) y su propio conjunto reducido:

```http
POST /v1/extension/session          # vincula pestaña del CRM ↔ agente
POST /v1/extension/context          # la extensión reporta qué registro está abierto
     { "crm": "salesforce", "object": "Lead", "external_id": "00Q5g..." }
GET  /v1/extension/resolve          # ↑ resuelve a nuestro lead/contact interno
POST /v1/extension/writeback        # escribe notas/disposición al CRM anfitrión
GET  /v1/extension/config           # selectores DOM por CRM, versionados en servidor
```

> `GET /extension/config` es una decisión importante: los selectores del DOM
> de Salesforce/HubSpot cambian sin aviso. Si vivieran dentro del código de la
> extensión, cada cambio exigiría una release en la Chrome Web Store con
> días de revisión. Servidos desde la API, se arreglan en minutos.

---

## 8. Límites y cuotas

| Recurso | Límite por defecto |
|---|---|
| API pública | 100 req/s por tenant, ráfaga 300 |
| Bulk contactos | 1,000 por request, 10 requests/min |
| Búsqueda en transcripciones | 10 req/s |
| Conexiones WebSocket | 3 por usuario, 500 por tenant |
| Subida de documentos | 100 MB por archivo, 2 GB por KB |
| Webhooks | 20 endpoints por tenant |
| Exportaciones | 5 concurrentes |

Los límites se devuelven en headers `RateLimit-Limit`, `RateLimit-Remaining`,
`RateLimit-Reset`, y se sobrepasan con `429` + `Retry-After`.
