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

**2 · Tu antes y después, con tu propia voz.** Esto es el negocio. Tres pasos:

1. **Grabas** una línea de tu pitch en inglés, aquí mismo. Se descarga a tu
   máquina, no se sube a ningún lado.
2. **La conviertes** con cualquier conversor de voz a voz —
   ElevenLabs Voice Changer tiene capa gratis y hace exactamente esto: entra tu
   voz, sale la misma frase con tu misma entonación, en voz americana nativa.
3. **Los comparas** arrastrando los dos archivos. Quedan guardados en el
   navegador, así que el demo sigue funcionando mañana frente a un cliente.

Diez minutos, sin pagar nada, y sales con un antes/después real que puedes
poner sobre la mesa.

## Qué es real y qué no

Esto importa más que el demo: un demo que no distingue no sirve para decidir.

| | |
|---|---|
| **Real** | El procesamiento del micrófono es DSP genuino — desplazamiento de tono granular, moldeado de formantes, compresión. La latencia está medida. El motor de audio en Rust existe, con 71 tests. |
| **Simulado** | El contenido de la llamada es un guion. Las sugerencias del copilot están escritas a mano; el motor de recuperación anclada aún no existe. |
| **Se compra** | La conversión de acento ya existe como servicio. Para el MVP y los primeros clientes se compra — sale esta semana, no en seis meses. El modelo propio es para cuando el volumen justifique el costo por minuto. |

**La conversión no corre dentro de este navegador** — necesita GPU. Lo que el
demo hace es cerrar el ciclo: capturar tu voz real y poner las dos versiones
lado a lado, para que la diferencia sea algo que se oye y no algo que se
promete.

## Para mostrárselo a alguien

1. Abre el archivo, dale a **Reproducir llamada**
2. En el segundo 42 aparece la sugerencia del copilot con su cita — ese es el
   momento que vende
3. Pulsa **Matar la GPU** y explica por qué la llamada sigue viva
4. Deja que termine y muestra el resumen automático
5. Baja a la sección 2 y dale al botón grande: **ANTES · tu voz** y luego
   **DESPUÉS · lo que oye el cliente**. Esa diferencia cierra la venta sola

Los números que puedes citar sin exagerar: **292 ms de latencia añadida, 99.9 %
de audio convertido entregado, 100 % de continuidad con la GPU muerta.** Los
tres están medidos y son reproducibles desde `media/voice-engine`.
