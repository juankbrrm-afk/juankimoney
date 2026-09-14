# frontend/console — la consola del agente

La pantalla crítica del producto. El agente la mira ocho horas seguidas
mientras habla con un cliente, y `docs/12` §1 fija la regla que gobierna todo
lo demás:

> El agente está hablando con un cliente. **La interfaz no puede pedirle
> nada.**

Sin modales. Sin animaciones de entrada. Una sugerencia a la vez, nunca una
lista. Nada parpadea excepto una violación crítica de compliance. Legible a
70 cm y de reojo.

## Lo que hace distinta a esta consola

**Nada de lo que se ve en pantalla está escrito a mano.**

`generate_fixture.py` corre una llamada real a través de los motores reales
— el pipeline del copilot, el motor de compliance, las pistas de señales, el
evaluador de guion — y escribe lo que produjeron, incluidas las negativas.

```bash
python3 generate_fixture.py > call-events.json
```

La razón está en `frontend/README.md`: *si una regla existe solo en el
frontend, es un bug de arquitectura esperando a ser explotado por alguien con
las devtools abiertas.* Una consola de demo construida sobre texto inventado
parece correcta y cada afirmación que hace sobre el producto — sugerencias
ancladas, el presupuesto de tres alertas, silencio cuando el material no
responde — es una afirmación sobre un JSON que alguien tecleó. El día que se
conecta un backend real, la mitad dejan de ser ciertas.

Construirla así ya encontró dos bugs que una demo con texto falso habría
escondido:

1. **`current_stage()` retrocedía.** Devolvía el último paso *emparejado*, no
   el más avanzado. En una llamada donde el agente hizo descubrimiento a los
   0:14 y verificó la dirección a los 0:26, la etapa volvía a `verify` — dos
   pasos atrás. El copilot sigue la etapa: el panel habría rebobinado a
   material de verificación mientras el cliente preguntaba por el precio.
   Corregido en `script/adherence.py`, con dos tests.

2. **El riel del guion marcaba pasos por transición de etapa.** Un paso que
   el agente cumplió fuera de orden nunca se marcaba. El agente volvería a
   pedir una dirección que ya tenía, delante del cliente.

## Archivos

| Archivo | Qué es |
|---|---|
| `generate_fixture.py` | Corre la llamada por los motores reales y emite el JSON |
| `call-events.json` | La salida. Generada, no editada a mano |
| `index.html` | El marcado |
| `tokens.css` | El sistema de diseño de `docs/12` §2 como variables |
| `console.css` | La consola |
| `console.js` | Reproduce los eventos. **No decide nada** |
| `test/console.test.mjs` | 23 comprobaciones en Chromium real |

## Correr

```bash
python3 generate_fixture.py > call-events.json   # regenerar desde los motores
node test/console.test.mjs                       # 23 comprobaciones
python3 -m http.server -d . 8080                 # verla
```

Sin dependencias instaladas en el repo. El test localiza un Playwright y un
Chromium que ya estén en la máquina (`test/chromium.mjs`); si no hay,
dice cómo conseguirlos en vez de reventar con un stack trace.

## Lo que verifican los tests

No verifican que el copilot respondiera bien — eso se decide y se prueba en
`ai-services/copilot-core` contra entradas hostiles. Verifican lo único que
solo se puede comprobar en un navegador: que las promesas de `docs/12` sobre
**la pantalla** sobreviven.

- La cita está en pantalla **mientras el texto todavía está apareciendo**.
  Es la ventana donde una cita añadida tarde pasaría desapercibida en una
  revisión humana.
- La banda crítica **no se va sola**. `docs/12` §6 exige reconocimiento: una
  alerta que se borra mientras el agente habla no deja constancia de que la
  vio, y es la alerta que dice que tiene segundos para retractarse.
- El estado de bypass **dice que el cliente está oyendo su voz real**.
  Ocultarlo para no alarmar sería traicionar al usuario.
- El silencio se renderiza como estado diseñado, con su motivo, no como un
  div vacío.
- **Nada anima durante una llamada activa** — comprobado leyendo estilo
  computado de cada elemento del DOM, no haciendo grep al CSS, porque el modo
  de fallo es que alguien añada una transición en un componente que este
  archivo no menciona.
- Sin scroll horizontal a 390 px.

## Pendiente

- Portar a React/Next cuando el backend exista. Este es el contrato de
  renderizado de referencia, no el destino final.
- `shared/ui`: el panel del copilot debe ser literalmente el mismo componente
  aquí y en la extensión de Chrome (`docs/12` §6).
- Transcripción en vivo por WebSocket con reanudación por `seq`, en lugar de
  reproducir un fixture.
- Los atajos de `docs/12` §7 más allá de `Esc` y `Espacio`.
