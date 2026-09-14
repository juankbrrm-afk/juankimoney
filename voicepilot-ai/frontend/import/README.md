# frontend/import — la importación en seco

`docs/07` §8 pide un importador CSV con detección de duplicados y **dry-run**.
El dry-run es la función entera, y el problema de diseño es que es facilísimo
construir uno que nadie lea: un botón verde de «12 filas OK, ¿importar?» que
se pulsa siempre.

## Lo que esta pantalla muestra son negativas

Las decisiones las toma `shared/crm/src/dedupe.ts` corriendo sobre un archivo
real. Aquí importa más que en ninguna otra pantalla, porque lo que se enseña
son **rechazos** —«estas dos filas no son la misma persona»— y un fixture
escrito a mano enseñaría rechazos que ningún código hace.

El archivo de ejemplo tiene las diez formas en que una importación real sale
mal. Lo que decidió el motor:

| Fila | Qué es | Resultado |
|---|---|---|
| 2 y 3 | La misma persona dos veces **dentro del archivo** | Fusiona con la misma; un importador que solo compara contra la base crea el duplicado que venía a evitar |
| 4 | Mismo nombre y misma empresa | **Revisar** |
| 5 | Mismo nombre, empresa distinta | **Revisar**, con otro motivo |
| 6 | El archivo dice que un número suprimido se puede llamar | Fusiona y **mantiene la supresión** |
| 7 | Ids distintos en el mismo Salesforce | **Revisar** — allí son dos personas |
| 8 | Coincide con dos contactos existentes | **Revisar** — la base ya tiene un duplicado |
| 9 | `Jose Munoz` contra `José Muñoz` | **Revisar** — los acentos se pliegan para marcar, no para fusionar |
| 10 | Teléfono que no es E.164 | Crea; no coincide por casualidad |

**2 nuevos · 3 fusiones · 5 a revisar.** Cinco de diez filas necesitan a una
persona, y ese es el resultado correcto para una lista real.

## El peso visual va al revés que los números

Dos filas que se crean reciben una línea. Cinco que necesitan una decisión se
llevan la parte de arriba y espacio para enseñar los candidatos lado a lado.
Decidir «¿son la misma persona?» desde una fila de tabla no se puede; hace
falta ver los campos de los dos registros enfrentados.

## El botón no miente

`plan()` devuelve `cleanlyApplicable: false` en cuanto una sola fila necesita
a alguien. La barra de aplicar **es** ese booleano — no calcula su propia
opinión — y sigue deshabilitada hasta que cada fila está resuelta. Un test
comprueba que resolver todas menos una **no** la habilita: el off-by-one ahí
es como un archivo entra con una fusión sin revisar dentro.

No hay ningún camino que convierta una revisión en fusión automática. El
revisor elige un registro concreto por id, crea uno nuevo, u omite la fila.

## La supresión

Es lo único de esta pantalla con un estatuto detrás, y por eso tiene su propio
aviso arriba en vez de estar enterrada entre seis cambios de campo.

Un archivo que declara que un número suprimido se puede llamar no es una
entrada rara: es lo que parece el export de un list broker. `mergeContacts`
mantiene la supresión pase lo que pase. Bajo la TCPA, una llamada a un número
suprimido son $500–$1.500 **por llamada**, y una fusión es justo la operación
que lo borraría a escala y sin dejar rastro.

El aviso va en verde, no en rojo: no falló nada. El producto rechazó algo, y
el cliente tiene que verlo rechazar.

## `ReviewCode`

Las razones de `dedupe.ts` están en inglés porque están escritas para quien
lee un log. La pantalla no las renderiza: cada revisión trae además un **code**
estable (`name_only`, `existing_duplicates`, …) y la UI traduce por code.

Una cadena de prosa no es una interfaz — se rompe en cuanto alguien mejora la
redacción, y renderizarla directa metía inglés en un producto en español, que
es exactamente lo que hacía esta pantalla antes de que el code existiera. Un
test lo verifica.

## Correr

```bash
node --experimental-strip-types generate_fixture.mjs > plan.json
node test/import.test.mjs     # 28 comprobaciones en Chromium real
```

## Pendiente

- Subir un CSV de verdad y mapear columnas (`docs/07` §8: «mapeo de columnas
  asistido»).
- Ejecutar el plan contra la cola idempotente de `shared/crm`. Hoy la pantalla
  enseña la intención y lo dice.
- Importadores directos desde HubSpot y Salesforce.
