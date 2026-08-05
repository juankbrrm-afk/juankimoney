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

**2 · Tu voz con acento americano — conversión real.** Esto es el negocio.

1. **Grabas** una línea de tu pitch en inglés, aquí mismo.
2. **Pegas tu llave de ElevenLabs** (capa gratuita) y la página convierte tu voz
   en el momento: misma frase, tu misma entonación, voz americana nativa.
3. **Comparas** con dos botones grandes: ANTES · tu voz / DESPUÉS · lo que oye
   el cliente. Los clips quedan guardados en el navegador.

> ⚠ **La conversión solo funciona con el archivo abierto desde tu máquina.**
> La versión publicada en la web no puede llamar a ElevenLabs — el navegador lo
> bloquea por seguridad, y hace bien. Descarga `demo/index.html` de este
> repositorio y ábrelo con doble clic.

La llave se guarda solo en tu navegador y viaja solo a ElevenLabs. Consíguela
en elevenlabs.io → tu perfil → API Keys.

## Qué es real y qué no

Esto importa más que el demo: un demo que no distingue no sirve para decidir.

| | |
|---|---|
| **Real** | El procesamiento del micrófono es DSP genuino — desplazamiento de tono granular, moldeado de formantes, compresión. La latencia está medida. El motor de audio en Rust existe, con 71 tests. |
| **Simulado** | El contenido de la llamada es un guion. Las sugerencias del copilot están escritas a mano; el motor de recuperación anclada aún no existe. |
| **Comprado, y funcionando** | La conversión de acento del paso 2 es real, vía ElevenLabs. Para el MVP y los primeros clientes se compra — sale esta semana, no en seis meses. El modelo propio es para cuando el volumen justifique el costo por minuto. |

**La conversión de acento en el demo es real, pero es comprada, no nuestra.**
Usa la API de ElevenLabs. Eso es exactamente lo correcto para demostrar el
negocio: existe hoy, funciona hoy. Nuestro modelo propio viene después, cuando
el volumen justifique el costo por minuto y la latencia sea el diferenciador.

**Lo que el demo no hace es la conversión en vivo durante una llamada.** Aquí
grabas y conviertes en dos pasos; en producción corre continuo a 292 ms. Esa
diferencia es el trabajo de ingeniería que ya está medido en
`media/voice-engine`.

## Para mostrárselo a alguien

1. Abre el archivo, dale a **Reproducir llamada**
2. En el segundo 42 aparece la sugerencia del copilot con su cita — ese es el
   momento que vende
3. Pulsa **Matar la GPU** y explica por qué la llamada sigue viva
4. Deja que termine y muestra el resumen automático
5. Baja a la sección 2, graba veinte segundos, convierte, y dale a
   **ANTES · tu voz** y luego **DESPUÉS · lo que oye el cliente**.
   Esa diferencia cierra la venta sola — y es tu propia voz, no un ejemplo

Los números que puedes citar sin exagerar: **292 ms de latencia añadida, 99.9 %
de audio convertido entregado, 100 % de continuidad con la GPU muerta.** Los
tres están medidos y son reproducibles desde `media/voice-engine`.
