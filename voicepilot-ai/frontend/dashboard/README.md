# frontend/dashboard — el piso

La pantalla del supervisor. `docs/06` §5 dice para qué sirve realmente el
análisis en vivo, y no es el gráfico:

> El dashboard de piso ordena las llamadas activas **por riesgo, no por
> duración**: sentimiento en caída, estrés alto, violaciones críticas y
> silencio prolongado combinados. El supervisor ve arriba las tres que
> necesitan intervención *ahora*. **Ese es el valor real del análisis en
> vivo — no el gráfico bonito.**

Un dashboard que lista llamadas es un monitor. Uno que las prioriza es una
herramienta, y la diferencia está casi toda en lo que *no* recibe peso
visual.

## El problema de diseño

Ordenar por duración es lo que trae por defecto cualquier dashboard, y es
peor que inútil: **la llamada más larga del piso suele ser la que va bien.**

Por eso el layout es asimétrico a propósito. Tres tarjetas se llevan la
parte de arriba, el color y el espacio para explicarse con palabras. Las
otras nueve llamadas reciben una fila densa y monocroma cada una. Una
cuadrícula de doce fichas iguales sería la opción de aspecto honesto y
destruiría el producto: el supervisor escanearía las doce, todas las veces, y
el ranking sería decoración.

## Nada está ordenado a mano

`generate_fixture.py` describe doce llamadas por sus señales y deja que
`triage()` — el motor real — las ordene. El orden que salga es el orden que
se muestra.

Esto importa más aquí que en la consola, porque lo que el producto afirma
**es un orden**, y un orden es exactamente lo que un fixture escrito a mano
acierta por construcción sin demostrar nada.

El piso está construido con los casos que rompen un dashboard ingenuo:

| Llamada | Por qué está ahí |
|---|---|
| `c-1027` · 14:44 · sentimiento +0.62 | La más larga del piso y va bien. Ordenar por duración la pone primera; debe quedar fuera del top |
| `c-1041` · 1:33 · violación crítica | La más corta en pantalla y la #1. Cualquier orden que toque la duración la hunde |
| `c-1039` · 8:25 · reconocida | Mala, pero la supervisora ya está encima. Pondera 0.4× y sale del top; si no, se queda clavada arriba seis minutos tapando todo lo demás |
| 8 llamadas sin señales | `triage()` las excluye en vez de rankearlas últimas |

Resultado real del motor:

```
1.36  c-1041  Andrés M.    93s   1 alerta crítica de compliance · sentimiento en -0.52
1.17  c-1052  Paola R.    412s   sentimiento en -0.71 · estrés 74% · 2 advertencias
0.94  c-1048  Luis T.     208s   estrés 68% · 14 s de silencio
----
0.33  c-1039  Karina S.   505s   reconocida, pondera 0.4×
0.20  c-1033  Diego V.    631s
0.00  c-1027  Marcela D.  884s   ← la más larga del piso
```

## Los motivos van en palabras

`signals/triage.py` guarda cada `Factor` en vez de colapsarlos en un número,
y la tarjeta los muestra todos. La razón está en el propio módulo:

> Un ranking que el supervisor no puede interrogar es un ranking que va a
> anular por instinto en una semana.

«Sentimiento en −0.52, una alerta crítica de compliance» es un motivo para
hacer clic. «Riesgo 1.36» no lo es.

Por lo mismo, las filas de abajo que alguien va a cuestionar llevan su
explicación escrita: la llamada de catorce minutos dice que no aparece
arriba porque no tiene señales de riesgo. Es más barato que la conversación.

## El piso tranquilo

`triage()` devuelve lista vacía cuando nada tiene riesgo, y esa es la salida
correcta, común y valiosa: significa que el piso está bien. Un dashboard que
siempre encuentra tres cosas de qué preocuparse entrena al supervisor para
descontar las tres. El estado vacío dice qué aparecería ahí y por qué.

## Correr

```bash
python3 generate_fixture.py > floor.json
node test/dashboard.test.mjs        # 17 comprobaciones en Chromium real
```

Las comprobaciones son inusuales: la mayoría afirman que una llamada concreta
**no** está arriba. Eso es el producto.

## Pendiente

- Datos en vivo por WebSocket en lugar de un fixture.
- «Escuchar» y «Susurrar» son botones sin backend: necesitan el barge-in del
  plano de medios.
- Histórico y reportes — este dashboard es solo el tiempo real.
