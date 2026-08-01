# Flujos principales

## 1. Entrada de un lead nuevo (el flujo más importante del negocio)

```mermaid
sequenceDiagram
    participant Src as Fuente (Landing / Meta Ads / WhatsApp)
    participant API as /api/leads o /api/public/leads/[slug]
    participant DB as Postgres
    participant AI as packages/ai (calificación)
    participant N8N as n8n workflow
    participant WA as WhatsApp Business API
    participant Slack as Slack

    Src->>API: nuevo lead (nombre, contacto, canal, campaña)
    API->>DB: crea Lead (stage=LEAD) + LeadActivity(created)
    API->>AI: qualify-lead(lead)
    AI-->>API: score 0-100 + razonamiento
    API->>DB: guarda score
    API->>N8N: dispara webhook "lead.created"
    par Automatizaciones en paralelo
        N8N->>WA: envía WhatsApp de bienvenida (plantilla aprobada)
        N8N->>API: POST /api/emails (Resend) — email de bienvenida
        N8N->>DB: asigna vendedor (round-robin o por regla) vía /api/leads/[id]
        N8N->>DB: crea tarea de seguimiento (LeadActivity tipo TASK)
        N8N->>Slack: notifica canal #leads-panama
    end
    N8N-->>API: callback /api/webhooks/n8n (estado de cada paso)
    API->>DB: LeadActivity por cada acción completada/fallida
```

**Por qué pasa por n8n y no está todo hardcodeado en el API route:** las
reglas de "a quién se asigna", "qué plantilla de WhatsApp se usa según
especialidad", y "si Slack está conectado" cambian por clínica y por
temporada. Encapsular eso en un workflow visual permite que operaciones
ajuste sin deploy, mientras el API route solo garantiza que el `Lead` se creó
de forma consistente y auditable.

## 2. Conversación de WhatsApp → calificación → cita agendada

```mermaid
sequenceDiagram
    participant Paciente
    participant Meta as WhatsApp Cloud API
    participant Hook as /api/webhooks/whatsapp
    participant Conv as Conversation/Message
    participant AI as Asistente de IA
    participant Cal as Calendario (Appointment)

    Paciente->>Meta: mensaje entrante
    Meta->>Hook: webhook (firma verificada)
    Hook->>Conv: guarda Message(sender=LEAD)
    Hook->>AI: assistant/reply(conversación + lead + AIAssistantConfig)
    AI-->>Hook: respuesta + acción sugerida (responder / calificar / agendar / escalar a humano)
    alt Acción = agendar cita
        AI->>Cal: crea Appointment (estado AGENDADA)
        Hook->>Meta: confirma horario por WhatsApp
    else Acción = escalar a humano
        Hook->>Conv: marca conversación como "requiere atención humana"
        Hook-->>Slack: notifica al vendedor asignado
    else Acción = responder FAQ
        Hook->>Meta: envía respuesta generada
    end
    Hook->>Conv: guarda Message(sender=AI_ASSISTANT)
```

Reglas de negocio explícitas (no dejadas al modelo): el asistente **nunca**
promete precios exactos ni hace diagnósticos — responde con rangos/políticas
configuradas por la clínica y siempre puede escalar a un humano. Ver
`docs/AI_SYSTEM.md` y `docs/RISKS.md` #2 (publicidad médica regulada).

## 3. Ciclo de vida del embudo (CRM)

```
LEAD → CONTACTADO → CALIFICADO → COTIZACIÓN → CITA_AGENDADA → PACIENTE
                                                     ↘ NO_INTERESADO / PERDIDO (desde cualquier etapa)
```

Cada transición escribe `LeadActivity` con `fromStage`/`toStage` y quién/qué
la disparó (usuario humano o automatización), lo que permite calcular tiempo
promedio por etapa y tasa de conversión por etapa en el dashboard.

## 4. Reporte mensual automático

```mermaid
sequenceDiagram
    participant Cron as n8n (cron 1º de cada mes)
    participant API as /api/reports (POST)
    participant Svc as reportService
    participant AI as packages/ai
    participant R2 as Cloudflare R2

    Cron->>API: generar reporte del mes anterior (por organización)
    API->>Svc: agrega KPIs (leads, CPL, CAC, ROAS, citas, ingresos)
    Svc->>AI: reports/insights(métricas)
    AI-->>Svc: recomendaciones en lenguaje natural
    Svc->>Svc: renderiza PDF (gráficos + recomendaciones)
    Svc->>R2: sube PDF
    Svc->>API: guarda Report(url, metrics JSON)
    API-->>Cron: 200 OK
    Note over API: dispara email (Resend) con el PDF adjunto/link al cliente
```

## 5. Auditoría de presencia digital

`POST /api/audit/run` dispara en paralelo: PageSpeed Insights (velocidad +
Core Web Vitals), un scraper ligero de metadatos SEO on-page, lectura de
Google Business Profile (rating, reseñas, completitud del perfil), e
Instagram/Facebook (métricas públicas básicas vía Graph API si la página está
conectada). Los resultados crudos se envían a `packages/ai` para producir un
resumen priorizado ("3 cosas que más te están costando pacientes este mes"),
y se renderiza a PDF vía el mismo pipeline que el reporte mensual.
