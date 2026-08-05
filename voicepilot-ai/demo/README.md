# demo/

**Ábrelo: `demo/index.html`.** Doble clic. No necesita servidor, ni instalar
nada, ni internet.

Un solo archivo. Si lo mandas por WhatsApp o correo, funciona igual del otro
lado.

## Qué hay dentro

**1 · La consola del agente.** Una llamada de ventas reproduciéndose en tiempo
real: transcripción palabra por palabra, el copilot apareciendo en el momento
exacto de la objeción de precio — con la cita al manual y la página —, alertas
de compliance, y los medidores de sentimiento moviéndose.

Hay un botón que dice **"Matar la GPU"**. Púlsalo a mitad de llamada. El
indicador se pone rojo, el agente ve que su voz real está saliendo, y **la
llamada no se corta**. Eso es el invariante del motor, hecho visible: el
cliente nunca escucha un hueco, escucha al agente.

Al colgar, el resumen post-llamada se genera solo.

**2 · Tu voz, procesada en vivo.** Activa el micrófono (**con audífonos** — sin
ellos hay acople) y habla. Hay un botón para alternar entre tu voz cruda y la
procesada. La latencia que muestra es la que tu navegador reporta de verdad,
no una estimación.

## Qué es real y qué no

Esto importa más que el demo: un demo que no distingue no sirve para decidir.

| | |
|---|---|
| **Real** | El procesamiento del micrófono es DSP genuino — desplazamiento de tono granular, moldeado de formantes, compresión. La latencia está medida. El motor de audio en Rust existe, con 71 tests. |
| **Simulado** | El contenido de la llamada es un guion. Las sugerencias del copilot están escritas a mano; el motor de recuperación anclada aún no existe. |
| **Falta** | El modelo de conversión de acento. Necesita GPU y semanas de entrenamiento. El banco que lo va a medir ya está construido. |

**El demo no convierte tu acento a americano.** Demuestra la ruta —
micrófono → procesamiento → salida, sin cortes — y la experiencia completa del
agente. Prometer lo otro se cae en la primera prueba frente a un cliente.

## Para mostrárselo a alguien

1. Abre el archivo, dale a **Reproducir llamada**
2. En el segundo 42 aparece la sugerencia del copilot con su cita — ese es el
   momento que vende
3. Pulsa **Matar la GPU** y explica por qué la llamada sigue viva
4. Deja que termine y muestra el resumen automático
5. Baja, activa el micrófono con audífonos y alterna cruda/procesada

Los números que puedes citar sin exagerar: **292 ms de latencia añadida, 99.9 %
de audio convertido entregado, 100 % de continuidad con la GPU muerta.** Los
tres están medidos y son reproducibles desde `media/voice-engine`.
