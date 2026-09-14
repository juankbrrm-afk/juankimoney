# frontend/player — el reproductor de llamada

`docs/07` §7 es el único sitio de la documentación que pide pulido por su
nombre:

> Esta es la pantalla donde el supervisor entiende, en 30 segundos, qué está
> comprando. Merece más pulido que ninguna otra del producto.

Cuatro elementos no negociables de esa sección, y los cuatro están:

1. **Transcripción sincronizada**, clic para saltar.
2. **Selector de pista** — original del agente vs. procesada. El supervisor
   necesita las dos: la cruda muestra al agente real, la procesada muestra lo
   que vivió el cliente. En Modo B son idiomas distintos.
3. **Marcadores de evento** en la línea de tiempo: violaciones, advertencias,
   sugerencias.
4. **Indicador de qué sugerencias usó el agente.**

## Una llamada, dos pantallas, un fixture

El reproductor lee `../console/call-events.json` — el mismo archivo que
reproduce la consola, generado por los mismos motores.

No es ahorro de esfuerzo. Si el reproductor y la consola discreparan alguna
vez sobre lo que pasó en una llamada, el supervisor tendría que decidir cuál
de las dos miente, y dejaría de confiar en las dos. Un test lo verifica: la
página falla si empieza a leer un fixture propio.

## «El agente la usó» se mide, no se supone

`postcall/adoption.py`. Es el número que decide si esto se renueva —un
copilot que nadie usa es un copilot que nadie paga el año siguiente— y es el
más fácil de inflar del producto. Por eso las reglas son estrechas:

- **Solapamiento léxico, no semántico.** Un embedding puntuaría alto la
  paráfrasis del agente y también *cualquier* frase sobre el tema. El agente
  diciendo algo sensato sobre financiamiento se ve idéntico al agente leyendo
  el panel.
- **Solo cuentan las palabras que la sugerencia pudo aportar.** La evidencia
  es que el agente diga `zero interest` cuarenta segundos después de que
  apareciera en pantalla y no lo hubiera dicho antes.
- **Lo que el agente ya sabía no es adopción.** Los buenos agentes se saben
  sus rebatimientos. Contarlo infla la métrica justo en las cuentas con
  mejores agentes.
- **Una sugerencia ignorada es un resultado reportable.** Un número que solo
  sube no es una medición, y un copilot al que ignoran suele significar que
  la base de conocimiento está mal, no los agentes.

El veredicto lleva su evidencia en el `title`: el porcentaje y las palabras
exactas. El primer supervisor que discrepe de un «usó la sugerencia» tiene
que poder ver en qué se basó — la misma regla que siguen las citas del
copilot.

## Lo que esta pantalla NO finge

**No hay grabación detrás de este fixture.** El reproductor lo dice, en la
propia pantalla, en vez de dibujar una forma de onda plausible sobre
silencio.

Es la mentira más tentadora de todo el producto y la que se descubre durante
la demo, delante del cliente, cuando pulsa reproducir. `docs/12` §8: cuando
algo está degradado se dice explícitamente qué no funciona; nunca se finge
normalidad.

El selector de pista funciona de verdad: cambia, y entonces dice qué pista
está seleccionada y que no hay audio adjunto. Cuando `call-events.json`
traiga un bloque `audio`, el aviso desaparece solo.

## Correr

```bash
node test/player.test.mjs     # 21 comprobaciones en Chromium real
```

## Pendiente

- Audio real, con las dos pistas y forma de onda de verdad.
- Recortes («clips») y biblioteca de mejores llamadas — `docs/07` los pone
  en Enterprise.
- Saltar al momento desde el reporte post-llamada.
