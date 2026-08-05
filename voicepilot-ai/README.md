# VoicePilot AI

**AI Operating System para Contact Centers.**

Convierte la voz de un agente latino en voz americana nativa en tiempo real,
le sopla la respuesta correcta según el script de la empresa, vigila el
compliance mientras habla, y escribe el CRM solo cuando cuelga.

Funciona de dos formas:

- **Modo Integrado** — se monta encima del CRM que la empresa ya usa
  (Salesforce, HubSpot, Zoho, Five9, Genesys, Zendesk, Pipedrive, Freshsales,
  o uno propio). Cero migración.
- **Modo Nativo** — si la empresa no tiene CRM, VoicePilot trae el suyo,
  completo.

---

## Estado del proyecto

**Especificación aprobada. Fase 0 en curso.**

| Módulo | Estado |
|---|---|
| Especificación completa (13 documentos) | ✅ Aprobada |
| **Fase 0 · 0.1 — Banco de latencia + Voice Engine** | ✅ **Completo** — [`media/voice-engine`](media/voice-engine/) |
| **Fase 0 · 0.2a — Contrato e integración remota** | ✅ **Completo** — [`shared/proto/voice.proto`](shared/proto/voice.proto) + `remote.rs` |
| Fase 0 · 0.2b — LiveKit SFU + puente SIP | ⛔ Bloqueado por entorno (sin acceso a crates.io) |
| Todo lo demás | No empezado, por diseño |

Lo medido hasta ahora, reproducible con
`cd media/voice-engine && cargo run --release --bin latency-bench`:

- **Modo A: 292 ms boca-a-oído, 99.9% de audio convertido entregado** — dentro
  de la promesa de 300 ms
- **Modo B: 1,025 ms, 97.5% entregado** — corregido desde la estimación de
  930 ms, a la que le faltaba el margen de playout
- **Continuidad de audio: 100%** con la GPU muerta, con 900 ms de stall, con
  100% de pérdida de paquetes, con el enlace de inferencia caído a mitad de
  llamada y bajo backpressure sostenido
- **Inferencia remota colocada: 99.73% entregado**, indistinguible de local
- **GPU en otra región: 0.00% entregado** — el hallazgo que convierte la
  colocación regional en requisito funcional, no en optimización

Lee los documentos en este orden:

| # | Documento | Qué responde |
|---|-----------|--------------|
| 00 | [Visión y alcance](docs/00-vision-y-alcance.md) | Qué construimos, para quién, qué NO construimos |
| 01 | [Arquitectura del sistema](docs/01-arquitectura.md) | Planos completos, planos de control/datos/media |
| 02 | [Pipeline de voz en tiempo real](docs/02-pipeline-voz-tiempo-real.md) | **El corazón.** Presupuesto de latencia, Modo A y Modo B |
| 03 | [Modelo de datos](docs/03-modelo-de-datos.md) | Esquema completo de base de datos |
| 04 | [Especificación de APIs](docs/04-apis.md) | REST, WebSocket, gRPC, webhooks |
| 05 | [Flujo de llamada](docs/05-flujo-de-llamada.md) | De la marcación al colgado, paso a paso |
| 06 | [Flujos de IA](docs/06-flujos-de-ia.md) | Copilot, RAG, compliance, análisis, post-llamada |
| 07 | [Flujo del CRM](docs/07-flujo-crm.md) | CRM nativo + capa de integración |
| 08 | [Decisiones de tecnología (ADRs)](docs/08-decisiones-tecnologia.md) | Cada stack elegido, con justificación y alternativa descartada |
| 09 | [Seguridad y compliance](docs/09-seguridad-y-compliance.md) | Auth, tenancy, cifrado, y el riesgo legal real de la voz IA |
| 10 | [Roadmap: MVP → Enterprise](docs/10-roadmap.md) | Fases, hitos, criterios de salida |
| 11 | [Unit economics](docs/11-unit-economics.md) | Costo por minuto, precio, margen |
| 12 | [Sistema de diseño](docs/12-sistema-de-diseno.md) | UI, color, densidad, componentes clave |

---

## Estructura del monorepo

```
voicepilot-ai/
├── media/               Rust — Media Plane: Voice Engine, scheduler, SIP
├── frontend/            Next.js — dashboard, CRM, consola del agente
├── backend/             NestJS — API de negocio, CRM, orquestación
├── ai-services/         Python — voz, ASR, MT, TTS, copilot, análisis
├── browser-extension/   Chrome MV3 — VoicePilot encima de CRMs ajenos
├── shared/              Contratos, tipos, esquemas de eventos, SDK
├── infrastructure/      Terraform, Helm, CI/CD, observabilidad
└── docs/                Esta especificación
```

Cada carpeta tiene su propio `README.md` con su responsabilidad exacta,
su frontera y lo que tiene prohibido hacer.

---

## Los tres números que definen el producto

1. **< 300 ms de latencia añadida** en Modo A (mismo idioma, conversión de
   acento). Es el número que hace que el cliente jamás sospeche.
   **Medido: 292 ms.**
2. **~1,025 ms de latencia añadida** en Modo B (español → inglés). Traducir
   exige entender, y entender exige esperar. Ver [doc 02](docs/02-pipeline-voz-tiempo-real.md#por-qué-el-modo-b-no-puede-bajar-de-300-ms).
   **Medido: 1,025 ms** — la estimación original de 930 ms omitía el margen
   de playout.
3. **0 respuestas inventadas** en el copilot. Si no está en el material de
   la empresa, el copilot calla. Sin excepción.

---

## Principio de ingeniería

> Piensa primero. Diseña después. Programa al final.
> Cada módulo se termina por completo antes de empezar el siguiente.

Nada entra a `main` sin: tests, telemetría, y un criterio de salida
verificable escrito antes de empezar.
