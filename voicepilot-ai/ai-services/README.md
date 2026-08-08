# ai-services/

**Python 3.12 + asyncio + gRPC, con GPU.** El Intelligence Plane.

Conversión de voz, ASR, traducción incremental, TTS, copilot con RAG,
compliance, análisis en vivo y post-llamada.

## Responsabilidad

Todo lo que es un modelo. Nada de negocio.

Este servicio no sabe qué es un lead, ni un pipeline, ni una factura. Recibe
audio y contexto, devuelve audio y señales. Esa ignorancia deliberada es lo
que permite escalarlo, sustituirlo y probarlo de forma independiente.

## Estado

| Módulo | Estado |
|---|---|
| **`copilot-core/copilot/`** — anclaje, recuperación, verificación | ✅ **Construido** — **0 alucinaciones en 200 pruebas** · [README](copilot-core/README.md) |
| **`copilot-core/compliance/`** — motor determinista + red de seguridad | ✅ **Construido** — recall y precisión sobre el bar en reglas críticas · presupuesto de ruido de 3 alertas |
| **`copilot-core/postcall/`** — resumen, extracción trazable, escrituras al CRM | ✅ **Construido** — cada elemento anclado a una cita literal · cobertura 100% vs QA humano en el set de prueba |
| **`copilot-core/gateway/`** — enrutamiento, failover, plazos, versionado, techo de coste | ✅ **Construido** — el plazo pertenece a la tarea, no al intento |
| **`copilot-core/signals/`** — señales en vivo y triaje del supervisor | ✅ **Construido** — la probabilidad de cierre no se puede inventar; el piso se ordena por riesgo, no por duración |
| **`copilot-core/script/`** — adherencia al guion y etapa actual | ✅ **Construido** — hallazgos con nombre, no un puntaje sobre 100 |
| Los seis juntos | **183 tests**, cero dependencias |
| Todo lo demás | No empezado |

`copilot-core` es el núcleo del módulo 1.6 del roadmap, adelantado porque su
criterio de salida — *0 respuestas inventadas* — es uno de los tres números
que definen el producto, y porque se puede verificar sin GPU y sin modelo.
Lo que trae es la **garantía estructural** y la recuperación; el modelo de
embeddings, el cross-encoder y el verificador NLI se inyectan por sus
protocolos y no están aquí.

Reproducible: `cd copilot-core && python3 -m eval.run`

## Estructura prevista

```
ai-services/
├── voice/
│   ├── engine_bridge/       Servidor gRPC hacia el Voice Engine (Rust)
│   ├── conditioning/        Denoise, VAD, AGC, extracción de locutor
│   ├── conversion/          Modo A — speech-to-speech, el foso del producto
│   ├── asr/                 Streaming, con abstracción de proveedor
│   ├── translation/         Modo B — wait-k adaptativo, política de commit
│   └── tts/                 Streaming incremental con continuidad prosódica
├── copilot-core/            ✅ CONSTRUIDO — la garantía de cero invención
│   ├── copilot/             Tipos, chunking, índice, disparadores, verificación
│   ├── tests/               63 tests, incluida la suite adversaria
│   └── eval/                El criterio de salida, como programa
├── copilot/
│   ├── retrieval/           Híbrido BM25 + vectorial + reranking
│   ├── generation/          Generación anclada, salida estructurada
│   └── verification/        Anti-alucinación — descarta lo no respaldado
├── compliance/
│   ├── deterministic/       Reglas y máquina de estados del script
│   └── semantic/            Clasificador de red de seguridad
├── analytics/
│   ├── live/                Sentimiento, estrés, interés, intención
│   └── post_call/           Resumen, objetos extraídos, puntuación de QA
├── gateway/                 ModelGateway — abstracción de proveedores, failover
├── eval/                    Sets de evaluación, golden audio, benchmarks
└── serving/                 Carga de modelos, pool de sesiones, batching
```

## Reglas duras

| Regla | Motivo |
|---|---|
| **Nada bloquea el audio.** Si un servicio se retrasa > 3 chunks, se descarta y se activa bypass | Un buffer creciente en tiempo real es una bomba de tiempo |
| **Sin HTTP en la ruta caliente.** Solo gRPC bidireccional | El handshake por request es inaceptable a 50 frames/s |
| **Sin asignaciones de memoria en el bucle de audio.** Buffers pre-asignados | La presión de GC/alocador se traduce en jitter audible |
| **`capture_timestamp_ns` viaja de ida y vuelta** | Es lo que permite medir latencia real, no estimada |
| **Toda salida registra `model_version`** | Sin esto no se puede depurar una regresión de calidad |
| **Sin generación sin contexto recuperado** | La regla de cero alucinaciones, impuesta en código |
| **Los sets de evaluación corren en CI** | Alucinación > 0 bloquea el despliegue |

## Modelo de despliegue

- ASR, conversión de voz y TTS de una misma llamada corren en **un solo
  proceso** cuando comparten GPU. Separarlos en microservicios añade copias
  de buffers entre procesos y latencia sin beneficio operativo.
- Pool de **sesiones pre-calentadas** por agente activo: cargar el modelo
  cuando el cliente ya contestó arruina el saludo, que es el momento más
  importante de la llamada.
- Aprovisionamiento de GPU **por pronóstico de turnos**, no autoescalado
  reactivo ([ADR-012](../docs/08-decisiones-tecnologia.md)).

## Lo que NO va aquí

- Acceso a la base de datos de negocio (recibe el contexto que necesita)
- Decisiones de negocio o de permisos
- Estado persistente entre llamadas

## Estado

No implementado. La conversión de voz empieza en **Fase 0**, y es el módulo
que decide si el proyecto continúa ([roadmap](../docs/10-roadmap.md)).
