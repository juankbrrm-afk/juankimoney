# ai-services/

**Python 3.12 + asyncio + gRPC, con GPU.** El Intelligence Plane.

Conversión de voz, ASR, traducción incremental, TTS, copilot con RAG,
compliance, análisis en vivo y post-llamada.

## Responsabilidad

Todo lo que es un modelo. Nada de negocio.

Este servicio no sabe qué es un lead, ni un pipeline, ni una factura. Recibe
audio y contexto, devuelve audio y señales. Esa ignorancia deliberada es lo
que permite escalarlo, sustituirlo y probarlo de forma independiente.

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
