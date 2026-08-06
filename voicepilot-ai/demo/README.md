# demo/

**Descarga `index.html` y ábrelo con doble clic.** Un solo archivo, sin
servidor, sin instalar nada.

> ⚠ **La conversión en vivo tiene que ser desde tu máquina.** La versión
> publicada en la web no puede llamar a ElevenLabs — el navegador lo bloquea
> por seguridad, y hace bien. El **comparador manual** sí funciona en el link
> publicado y en el teléfono.

---

## Sección 2 — el negocio

**Hablas tú, el cliente te oye en inglés perfecto.** Continuo, sin apretar
nada.

| | |
|---|---|
| **Modo A** | Hablas inglés con acento → sale inglés americano nativo |
| **Modo B** | Hablas **español** → sale inglés |

Le das a **Empezar a hablar** y hablas normal. Cada vez que haces una pausa,
esa frase se convierte y **suena sola**. Sigues hablando mientras tanto.

### Para probarlo

1. **Audífonos.** Sin ellos el micrófono capta la salida y se enloquece.
2. Cuenta gratis en **elevenlabs.io** → perfil → **API Keys** → copia la llave.
3. Pégala en el demo, dale **Conectar**, elige la voz del cliente.
4. **Empezar a hablar.** Di una frase, haz una pausa, escucha.

La llave se guarda solo en tu navegador y viaja solo a ElevenLabs.

### Cómo funciona por dentro

Un detector de actividad de voz vigila el nivel. Cuando llevas hablando y te
quedas callado ~650 ms, esa frase se cierra y sale a convertir mientras tú
sigues con la siguiente. Se convierten en paralelo pero **se reproducen en
orden estricto** — una llamada donde la frase tres llega antes que la dos no es
una llamada.

---

## Comparador manual — para el celular, y para vender

Dentro de la sección 2 hay un panel plegable, **Comparador manual**. No
necesita llave, ni micrófono, ni internet, ni abrir el archivo desde tu
máquina: **funciona en el link publicado, en el teléfono.**

Cargas dos audios — tu voz original y la versión convertida — y quedan dos
botones grandes: **ANTES** y **DESPUÉS**. Los aprietas delante del cliente.

1. Grábate 15 segundos con la grabadora del teléfono.
2. Conviértelo en la app de ElevenLabs (Voice Changer para Modo A, Dubbing
   para Modo B) y descarga el resultado.
3. Carga los dos en el panel.

**Los audios quedan guardados en el navegador.** Cierras, vuelves mañana, y
el panel se abre solo con tus clips listos. Un clip demasiado grande para el
almacenamiento del navegador (>2 MB) suena igual, pero no sobrevive al
cierre.

Esta es la herramienta de venta: la conversión en vivo impresiona, pero
depende de tu red y de una API. El comparador nunca falla delante de un
cliente.

---

## Lo que este demo no es

**El retardo que ves no es el del producto.** Aquí cada frase hace un viaje de
ida y vuelta a una API: uno o dos segundos en Modo A, más en Modo B porque el
doblaje es un trabajo asíncrono.

En producción el modelo corre pegado al agente y va **continuo, sin esperar tus
pausas**: 292 ms medidos, con el audio saliendo mientras todavía hablas. Eso es
lo que mide `media/voice-engine`, y es la única diferencia real entre este demo
y el producto.

Lo que este demo sí prueba, y es lo que hay que probar: **que la conversión
suena bien, que funciona en los dos modos, y que el flujo es manos libres.**

---

## Sección 1 — la consola del agente

Una llamada de ventas reproduciéndose en tiempo real: transcripción palabra por
palabra, el copilot apareciendo en la objeción de precio con su cita al manual,
alertas de compliance, medidores de sentimiento.

Hay un botón **"Matar la GPU"**. Púlsalo a mitad de llamada: el indicador se
pone rojo, el agente ve que su voz real está saliendo, **y la llamada no se
corta**. Ese es el invariante del motor, hecho visible.

Esta sección **es un guion** — el contenido está escrito a mano. Sus tiempos,
su latencia y su comportamiento ante fallos sí son los del sistema real.

---

## Para mostrárselo a alguien

1. Abre en la **sección 2**, no en la 1. El acento es lo que vende.
2. Ponte los audífonos, Modo A, di tu pitch. Deja que lo oiga.
3. Cambia a **Modo B** y di la misma frase **en español**. Ahí se cae de
   espaldas.
4. Sube a la sección 1 y muestra la consola, el copilot con su cita, y el botón
   de matar la GPU.

Números que puedes citar sin exagerar, todos medidos y reproducibles desde
`media/voice-engine`: **292 ms de latencia añadida, 99.9 % de audio convertido
entregado, 100 % de continuidad con la GPU muerta.**
