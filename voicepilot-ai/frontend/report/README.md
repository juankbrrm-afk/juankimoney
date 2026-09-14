# frontend/report — el reporte post-llamada

Lo que la llamada dejó. Tercera pantalla sobre el mismo fixture: la consola
la mostró en vivo, el reproductor la reproduce, esta es la huella.

Todo sale de `ai-services/copilot-core/postcall/`: el resumen y sus citas de
anclaje, los ítems extraídos con su evidencia verbatim, las métricas
deterministas, la propuesta de disposición, y el conteo de lo que el pipeline
tiró.

## La idea que carga toda la pantalla

> **La IA propone. El humano dispone.**

Cada línea de esta página es una afirmación que un modelo hizo sobre el
trabajo de alguien. Un supervisor que no puede discrepar con un ítem tampoco
va a confiar en el resumen de arriba, y un reporte en el que nadie confía es
un reporte que nadie lee — que es exactamente como el análisis post-llamada
acaba siendo la función que se corta en la renovación.

De ahí todo lo demás:

- **Cita verbatim en cada ítem.** `Item.__post_init__` revienta sin ella:
  *un ítem sin cita verbatim no se puede rastrear, no se puede verificar, y
  es indistinguible de una invención.* La pantalla no puede recibir uno sin
  cita, así que no lo comprueba — lo muestra.
- **La lectura del modelo junto a las palabras de las que la sacó.** Es la
  diferencia entre una herramienta que auditas y una de la que desconfías.
- **Cada cita está a un clic del segundo en que se dijo.** Quien discrepa
  necesita *oírlo*, no leer nuestra transcripción de ello.

## Lo que se tiró, impreso

El sumarizador del fixture propone a propósito un compromiso **completamente
inventado** — «I'll waive the installation fee for you» — del tipo que
produce un modelo real cuando reconoce el patrón de una llamada de ventas en
vez de leerla.

`postcall/extract.py` lo localiza en la transcripción, no lo encuentra, y lo
descarta. El reporte dice «1 extracción descartada» y explica por qué se
cuenta: **que ese número suba es la señal más temprana de que el modelo se
está desviando.**

Un fixture donde nunca se rechaza nada enseña una pantalla que jamás ejerció
su propia garantía, y el número que más importa en ella sería un cero
escrito a mano.

## La disposición

La interacción más importante de la página. Llega **sin confirmar** y se
queda ahí hasta que alguien pulsa.

`postcall/analysis.py` lo dice sin rodeos: *una disposición auto-aplicada es
como un pipeline se llena de resultados que nadie eligió, y como un forecast
construido sobre esos resultados se vuelve ficción.*

La consecuencia es visible: `crm_writes()` emite la nota y las dos tareas,
pero **no** la escritura al lead. Esa fila aparece punteada y en gris, con el
motivo escrito, hasta que un humano confirma. Se muestra la escritura que la
confirmación *produciría* — descubrir después que confirmar tenía una
consecuencia que nadie mencionó es exactamente lo que destruye la confianza
en una integración.

«Otra» no elige otro valor: limpia la propuesta y deja la disposición al
humano. La misma negativa que `binding.ts` cuando no sabe qué registro está
abierto.

## Métricas sin modelo

Aritmética sobre marcas de tiempo. `postcall/analysis.py`: *un ratio de habla
ocasionalmente inventado es peor que ningún ratio, porque se toman decisiones
de coaching con él.*

El 71% del agente se marca en ámbar porque pasa de 65% — es lo más coacheable
del reporte y la única métrica a la que se le permite color.

## Correr

```bash
node test/report.test.mjs     # 26 comprobaciones en Chromium real
```

El test de la invención lleva su propio control: comprueba que el
sumarizador del fixture **sí** propuso la cita falsa, para que la
comprobación mida un rechazo y no una ausencia.

## Pendiente

- Escribir de verdad al CRM a través de la cola de `shared/crm`. Hoy la
  pantalla enseña la intención; falta el botón que la ejecuta y su reporte
  por campo (`overlay.ts` ya sabe verificar escrituras).
- Editar el resumen antes de que se escriba.
- Los 8 reportes prefabricados de `docs/07` §7 — esto es el de una llamada.
