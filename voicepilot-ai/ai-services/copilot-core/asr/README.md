# asr/ — la disciplina alrededor del reconocedor

El reconocedor es una decisión de proveedor: Deepgram, AssemblyAI, un Whisper
hospedado. Lo que **no** es decisión de proveedor, y que todos nos dejan como
problema nuestro, es que un reconocedor en vivo no emite transcripción. Emite
una discusión consigo mismo:

```
0.4s  partial  "I guarantee"
0.7s  partial  "I get onto"
1.1s  partial  "I guarantee you'll"
1.6s  final    "I can't guarantee you'll get every penny back"
```

Cuatro de esas cinco contienen `i guarantee`. Una es lo que dijo el agente, y
significa lo contrario.

Meter parciales directamente al motor de compliance produce una alerta legal
crítica, banda roja, sonido y exigencia de reconocimiento — **por palabras que
nadie dijo**, mientras el agente está a media frase. Que pase dos veces y el
agente ya aprendió a descartar la banda, que es la única alerta del producto
que nunca debe ignorarse. El módulo que ordena alertas con tanto cuidado en
vez de encolarlas no vale nada si el texto de abajo es una conjetura.

## La regla

> **El texto parcial puede influir en lo que ofrecemos. Solo el texto estable
> puede influir en lo que afirmamos.**

Es la misma asimetría a la que llega todo el repositorio. Una sugerencia
construida sobre un parcial que luego cambia es una sugerencia desperdiciada
—el agente mira, cambia, no pasa nada—. Una violación de compliance construida
sobre el mismo parcial es una acusación.

`Consumer` convierte eso en algo estructural en vez de algo que alguien tiene
que recordar en cada sitio:

| Consumer | Quién | Qué ve |
|---|---|---|
| `SUGGESTING` | copilot, etapa del guion, sentimiento | comprometido **+ el prefijo estable** de lo que se está diciendo |
| `ASSERTING` | compliance, adherencia, reporte, escritura al CRM | solo texto comprometido |

El copilot empieza a recuperar con `that's way too expens…` sin esperar a que
termine el turno, que es la mayor parte del presupuesto de latencia.

## Lo demás que hacen los reconocedores

**Reordenan.** Un parcial viejo aplicado después de un final des-finaliza un
turno sobre el que los motores ya actuaron: el reporte acaba contradiciendo la
alerta que el agente reconoció. `seq` por canal, monótono, y lo viejo se cae.

**No cierran turnos.** `ENDPOINT_SILENCE_MS = 700`. Por debajo de ~500 ms se
parte a la gente a media frase —todo el mundo hace pausas para pensar— y una
frase partida esconde el texto que cruza el corte de **todas** las reglas por
frase del producto, incluidas las de compliance, cuyo trabajo entero es
encontrar frases. Por encima de ~1 s el copilot responde una pregunta que el
cliente terminó hace un segundo.

**Entran en bucle.** Los modelos tipo Whisper repiten una cláusula sobre
silencio, música o tonos de espera, a veces durante un minuto. Pasado tal
cual, llega a la transcripción, a la nota del CRM, al reporte — y **satisface
cualquier regla MUST_SAY que coincida con la frase repetida**: la empresa
queda marcada como cumplidora porque el decodificador tartamudeó. `deloop()`
colapsa solo repeticiones *adyacentes* y solo pasado el umbral, porque la
gente sí se repite («no, no, no») y aplanarlo cambia lo que dijo.

**Mezclan hablantes si se lo permites.** Los canales se estabilizan por
separado — son rutas de audio distintas de verdad — porque unirlos antes es
como una palabra del cliente acaba atribuida al agente en un reporte de
compliance. El solapamiento se conserva: el momento en que el cliente objeta
mientras el agente todavía habla es justo el que hay que revisar.

## Lo que este módulo NO es

No es un modelo acústico y no lo intenta. Es la disciplina alrededor de uno.

## Correr

```bash
python3 -m unittest tests.test_asr        # 18 tests
python3 -m unittest discover -s . -q      # los 241
```

El test principal, `test_a_revised_partial_never_reaches_compliance`, lleva su
propio caso de control: primero demuestra que alimentar parciales **sí**
dispara la alerta falsa, y después que este módulo no. Sin el control, el test
pasaría contra una implementación que simplemente nunca dispara.

## Pendiente

- El adaptador real del proveedor (WebSocket, reconexión, reanudación por
  `seq`). `Hypothesis` es la frontera: lo que entre por ahí ya está domado.
- Diarización cuando el tenant no tiene canales separados.
- Vocabulario por tenant: nombres de producto y de calle que ningún modelo
  genérico acierta.
