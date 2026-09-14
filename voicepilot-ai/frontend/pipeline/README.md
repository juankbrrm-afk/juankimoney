# frontend/pipeline — el tablero y el forecast

`docs/07` §7 pide kanban con etapas configurables. El kanban es la mitad
fácil. El panel de al lado es el producto.

## Dónde miente todo CRM

```
forecast = Σ (monto × probabilidad de la etapa)
```

Está en Salesforce, en HubSpot, en Pipedrive y en todas las hojas de cálculo
que alguien rehízo después de no fiarse de ellos. Está mal de tres formas que
se acumulan, y un director de ventas corre su trimestre con el número que
sale.

**1. Un número ponderado no es un resultado posible.** Un negocio de $28.000
al 60% «pronostica» $16.800. Eso no va a pasar nunca: cierra en $28.000 o en
nada. Ponderar solo significa algo sobre suficientes negocios independientes
para que la aritmética se promedie, y «suficientes» es un número real.

**2. Las probabilidades por etapa suelen estar inventadas.** Los
10/25/50/75/90 que trae de fábrica cualquier CRM no se derivan de nada. Este
tenant, medido sobre **904 cierres propios**, da:

```
17%  Nuevo         n=412
41%  Calificado    n=244
54%  Propuesta     n=151
68%  Negociación   n=97
```

Ninguno se parece al que le habrían dado por defecto. Esa diferencia es todo
el argumento.

**3. El tiempo en etapa se ignora.** Un negocio que entró en negociación hace
nueve meses no tiene 68% de cerrar. Está muerto y nadie lo ha dicho.

## Lo que hace este módulo

`shared/crm/src/pipeline.ts` se niega en vez de inventar, con la regla que
gobierna todo el repositorio: **una afirmación sin evidencia no tiene
representación.**

| Estado | Cuándo | Qué muestra |
|---|---|---|
| `uncalibrated` | Alguna etapa con menos de 20 cierres | Sin forecast, y **qué etapa** falta y por cuánto |
| `unreliable` | Calibrado, pero menos de 30 negocios abiertos | Sin ponderado. Sí el pipeline abierto y el comprometido |
| `weighted` | Ambas condiciones cumplidas | El número, y qué excluyó |

Los umbrales (`MIN_DEALS_FOR_WEIGHTING = 30`, `MIN_HISTORY_PER_STAGE = 20`) no
son configurables hacia abajo. En otros CRMs ese ajuste existe solo para que
alguien pueda hacer aparecer el número.

Es la misma respuesta que da `signals/live.py` para una probabilidad de
cierre sin historial: *mostrar «calibrando» es mejor que mostrar un 73%
inventado.*

## Lo que el panel enseña y ningún otro

El resultado real de este tenant:

```
$380.293   ponderado, sobre 34 negocios abiertos
$975.887   pipeline abierto — suma de montos, no una estimación
 $28.879   comprometido — 1 negocio con el nombre de una persona detrás
 $89.062   excluido — 4 negocios estancados, nombrados uno por uno
```

Tres decisiones de diseño:

- **La base ocupa sitio.** «41% de tus negocios calificados cerraron, sobre
  244» es comprobable. «50%» no lo es, y esa diferencia es por qué todo
  director rehace el forecast en una hoja.
- **Los excluidos se nombran.** «4 excluidos» invita a «¿cuáles cuatro?». Un
  forecast que quita $89.062 de pipeline en silencio es uno que alguien
  rehace a mano.
- **El comprometido sobrevive a todas las negativas**, porque no es una
  estimación: alguien puso su nombre en cada uno.

El estancamiento se mide contra la mediana de permanencia **de este tenant**,
no contra un número fijo de días. «Mucho tiempo» en software empresarial y en
solar residencial se diferencian en un orden de magnitud.

## Correr

```bash
node --experimental-strip-types generate_fixture.mjs > board.json
node test/pipeline.test.mjs     # 24 comprobaciones en Chromium real
```

El fixture emite los tres estados. El tablero renderiza el ponderado; los dos
rechazos salen del mismo motor con otro historial, para que los estados
vacíos de la pantalla sean salida real y no texto escrito a mano. Un test
recarga la página con el estado `unreliable` y comprueba que **no aparece
ningún número** donde iría el forecast.

## Pendiente

- Arrastrar y soltar entre columnas, con `transition()` registrando avances,
  retrocesos y saltos. El motor ya los distingue; falta la interacción.
- Múltiples pipelines por tenant.
- Historial de forecast: qué dijimos hace cuatro semanas contra qué cerró.
  Es la única forma de demostrar que este número vale más que el anterior.
