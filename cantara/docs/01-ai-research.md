# Investigación: proveedores de IA para el pipeline (agosto 2026)

Este documento justifica la selección de modelos/APIs. Se revisó el estado del
mercado en agosto de 2026. Todo lo que aquí se elige está detrás de una
**interfaz (port)** en `packages/ai`, así que cambiar de proveedor es cambiar un
adaptador y una variable de entorno, nunca tocar el dominio.

---

## 0. El problema real

Ninguna API hace de una sola pasada lo que pide el brief: *"una canción
completa cantada con la voz del usuario"*.

- Los generadores musicales (Suno, Udio, Eleven Music, Stable Audio) generan la
  canción **con su propia voz sintética**. No aceptan un modelo de voz arbitrario
  del usuario como timbre de salida (y donde existe algo parecido, es un
  "vocal reference" de estilo, no clonación identitaria).
- Los clonadores de voz (ElevenLabs, XTTS, F5-TTS) hacen **habla**, no canto.
  Fuerzan prosodia de locución: no siguen una melodía ni sostienen notas.

La solución que usa la industria y que adoptamos es un **pipeline de conversión
de voz cantada (SVC)**:

```
letra → canción guía (voz IA) → separar stems → convertir la voz guía
al timbre del usuario → remezclar → masterizar → codificar
```

La generación musical aporta melodía, arreglo y producción. El SVC aporta la
identidad vocal. Esto es lo que hace que el resultado suene *cantado por el
usuario* y no *leído por el usuario*.

---

## 1. Generación de letras

| Opción | Calidad | Coste | Integración | Veredicto |
|---|---|---|---|---|
| **Claude (Anthropic API)** | Excelente en estructura, rima, métrica y multilingüe | ~$0.001–0.01/letra | REST + SDK oficial | **Elegido** |
| GPT-class | Comparable | Similar | REST | Alternativa vía adaptador |
| Llama 3.x self-host | Aceptable | GPU propia | Alto | Solo si hay coste crítico |

**Elegido: Claude.** La letra no es texto libre: debe emitir secciones
etiquetadas (`[Verse]`, `[Chorus]`, `[Bridge]`) porque los motores musicales las
consumen como estructura. Claude sigue esquemas estrictos de salida de forma
fiable y maneja bien español, reguetón e inglés, que es el grueso del caso de
uso. Se le pide JSON validado con Zod; una letra mal formada se reintenta, no
se cuela al pipeline.

## 2. Generación musical (canción guía)

| Opción | Calidad | Licencia comercial | API | Veredicto |
|---|---|---|---|---|
| **ElevenLabs Music** | Muy alta, producción limpia | **Licenciada antes del lanzamiento**, comercial por API | REST oficial, `POST /v1/music`, plan de composición por secciones | **Primario** |
| Suno v5.5 | La mejor vocal/genérica del mercado | En litigio (Sony) | Sin API pública de primera parte; pasarelas de terceros | Adaptador secundario |
| Udio | Licencias firmadas (UMG, Warner, Merlin) | Descargas pausadas | Limitada | No |
| Stable Audio 3 | Pesos abiertos, 6 min, rápido | Self-host | Alto (GPU propia) | Fallback self-host |

**Elegido: ElevenLabs Music como primario.** No es la vocal más impresionante
del mercado — Suno lo es — pero es la única con **API oficial de primera parte y
licencia comercial resuelta antes del lanzamiento**. En este pipeline la voz
generada es *desechable*: se separa y se reemplaza por la del usuario. Lo que
importa del motor musical es el arreglo, la producción y la estabilidad del
contrato de API, no su timbre vocal. Optimizar por licencia y fiabilidad es la
decisión correcta.

Su *composition plan* (`POST /v1/music/plan`) permite definir intro/verso/
estribillo/outro con estilo y duración por sección, y **no consume créditos**.
Eso encaja exactamente con la letra estructurada que produce Claude.

> **Riesgo legal registrado:** los casos de Sony contra Suno y Udio esperan
> resolución hacia mediados de 2026. Por eso el adaptador de Suno existe pero
> **no es el predeterminado**, y los términos de cada proveedor se revisan antes
> de habilitar distribución comercial. Ver `docs/05-legal-and-consent.md`.

## 3. Separación de stems

Necesaria: la API musical devuelve una mezcla, y hay que aislar la voz guía para
sustituirla.

| Opción | Veredicto |
|---|---|
| **Demucs v4 (htdemucs_ft)** | **Elegido.** Estándar de facto, MIT, 4 stems, corre en Replicate o GPU propia |
| Spleeter | Peor calidad, obsoleto |
| Stems nativos del proveedor | Se usan si la API los expone (evita el paso entero) |

El pipeline **detecta si el proveedor musical devuelve stems** y en ese caso
salta la separación. Es más barato y de mayor calidad que separar una mezcla.

## 4. Clonación de voz y conversión de voz cantada (el núcleo)

Aquí se distinguen dos cosas que suelen confundirse:

- **Clonación de voz (TTS)** → habla. ElevenLabs, XTTS-v2, F5-TTS.
- **Conversión de voz cantada (SVC)** → canto. RVC, seed-vc, so-vits-svc.

Para "canta con mi voz" **hace falta SVC**, no TTS.

| Opción | Datos necesarios | Calidad cantada | Coste | Veredicto |
|---|---|---|---|---|
| **RVC (Retrieval-based Voice Conversion)** | 2–10 min limpios — coincide con el brief | Preserva vibrato, respiración y timbre; entrenamiento por usuario | GPU minutos, ~$0.05–0.30/entrenamiento en Replicate | **Elegido (primario)** |
| seed-vc | Zero-shot, sin entrenamiento | Buena, algo menos identitaria | Más barato, sin fase de entrenamiento | **Elegido (modo rápido)** |
| so-vits-svc | 30+ min | Alta pero pesada | Alto | No |
| ElevenLabs PVC | 30+ min, verificación | Habla, no canto | Alto | No para canto |

**Elegido: RVC como primario, seed-vc como modo instantáneo.**

RVC es exactamente la tecnología dimensionada para el requisito del brief
(2–10 minutos de grabación). Requiere una fase de entrenamiento por usuario, que
es precisamente lo que justifica la barra de progreso de entrenamiento pedida.

seed-vc se ofrece como *Instant Voice* — zero-shot, sin entrenamiento, resultado
en segundos con calidad algo inferior. Da al producto un onboarding sin espera:
el usuario oye su voz cantando en la primera sesión y decide después si invierte
en el entrenamiento completo.

## 5. Masterización

| Opción | Coste | Veredicto |
|---|---|---|
| **Matchering 2.0** | Gratis, open source (Python) | **Elegido por defecto.** Masterización por referencia: se iguala el track a una referencia comercial del género |
| LANDR Mastering API | Por track | Adaptador premium |
| Dolby.io Music Mastering | Por track | Adaptador premium |
| Cadena ffmpeg (loudnorm EBU R128) | Gratis | **Fallback**, sin dependencias externas |

**Elegido: Matchering por defecto.** Es gratis y encaja conceptualmente con el
producto: hay una referencia por género, así que un reguetón se masteriza contra
un reguetón. La cadena ffmpeg `loudnorm` a −14 LUFS es el fallback garantizado
cuando no hay referencia disponible.

## 6. Codificación de entregables

MP3 320 kbps + WAV 24-bit/44.1 kHz. Dos adaptadores:

- **ffmpeg** (producción): calidad y velocidad.
- **JS puro** (`lamejs` + writer WAV): fallback cuando no hay binario ffmpeg,
  para que el proyecto arranque en cualquier máquina y en CI.

Se detecta ffmpeg al arrancar y se elige el adaptador automáticamente.

---

## Combinación final

| Etapa | Primario | Fallback / alternativa |
|---|---|---|
| Letras | Claude | Plantillas deterministas (offline) |
| Música | ElevenLabs Music | Suno (adaptador), Stable Audio self-host |
| Stems | Stems nativos → Demucs v4 | — |
| Entrenamiento de voz | RVC | seed-vc zero-shot (Instant) |
| Conversión cantada | RVC | seed-vc |
| Mezcla | ffmpeg / JS puro | — |
| Masterización | Matchering 2.0 | LANDR, Dolby.io, ffmpeg loudnorm |
| Codificación | ffmpeg | lamejs + WAV writer |

## Coste estimado por canción (3 minutos)

| Concepto | Coste |
|---|---|
| Letra (Claude) | ~$0.005 |
| Música (Eleven Music) | ~$0.20–0.60 |
| Demucs (si aplica) | ~$0.02 |
| SVC RVC (inferencia) | ~$0.05 |
| Masterización (Matchering) | $0.00 |
| **Total variable** | **~$0.30–0.70** |

Entrenamiento de voz: **~$0.30–1.50 una sola vez por modelo**.

El sistema de créditos (`packages/shared/src/credits.ts`) está calibrado sobre
estas cifras con margen: 30 créditos por canción, 100 por entrenamiento, y el
plan gratuito arranca con 150.

---

## Fuentes

- [Eleven Music API — ElevenLabs](https://elevenlabs.io/music-api)
- [Compose music — ElevenLabs Docs](https://elevenlabs.io/docs/api-reference/music/compose)
- [Create composition plan — ElevenLabs Docs](https://elevenlabs.io/docs/api-reference/music/create-composition-plan)
- [Best AI Music Generators 2026: Suno, Udio, Stable Audio 3 — Dubspot](https://blog.dubspot.com/best-ai-music-generators-2026)
- [Best AI Music Generation APIs — Apiframe](https://apiframe.ai/blog/best-ai-music-generation-apis)
- [Retrieval-based Voice Conversion — Wikipedia](https://en.wikipedia.org/wiki/Retrieval-based_Voice_Conversion)
- [seed-vc — GitHub](https://github.com/Plachtaa/seed-vc)
- [RVC API — each::labs](https://www.eachlabs.ai/rvc-project/rvc)
- [LANDR Mastering API](https://www.landr.com/pro-audio-mastering-api)
- [Dolby.io Music Mastering](https://news.dolby.com/en-WW/203113-dolby-upgrades-dolby-io-introduces-transcoding-music-mastering-and-more-to-developer-platform/)
