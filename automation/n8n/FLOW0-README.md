# Flujo 0 — Descubrimiento Automático (esto es lo que cierra el círculo)

## Qué hace
Todos los días a las 8am: busca en AliExpress por una lista de palabras
clave que tú defines una vez (ej. "women boutique dress"), extrae los
productos que aparecen (título, precio, imagen, link), revisa si ya los
había visto antes, y agrega los nuevos a la hoja `candidatos` con
`status: pending`. De ahí, el **Flujo 2** (que ya tenías) los recoge solo:
Claude los evalúa, calcula precio, y publica en Shopify si el score da
bien.

Con esto, la cadena completa queda: **Flujo 0 (busca) → Flujo 2 (evalúa y
publica) → Flujo 3 (crea video y publica en redes)** — corriendo sola,
tú solo la dejas prendida.

## Por qué esto no existía antes
Ni DSers ni AliExpress tienen una API de catálogo para comerciantes. Pero
las páginas de **búsqueda** de AliExpress, igual que las de producto, son
públicas — no requieren login. Eso permite renderizarlas con un navegador
headless y extraer los resultados, en vez de necesitar una API que no
existe.

## Léelo antes de activarlo — 3 riesgos reales

1. **Los selectores CSS del nodo "Extraer Tarjetas de Producto" son mi
   mejor estimado, no algo que pude probar en vivo** — mi entorno no tiene
   acceso a internet general, así que no pude abrir AliExpress y confirmar
   los nombres exactos de las clases CSS que usan hoy. Es muy probable que
   tengas que ajustarlos la primera vez (te explico cómo abajo).
2. **AliExpress cambia el diseño de su página sin avisar.** Cuando lo
   haga, este nodo va a dejar de encontrar productos hasta que alguien
   (tú o yo) actualice los selectores. No es un "se rompe una vez y ya" —
   es mantenimiento continuo.
3. **Scraping automatizado probablemente no está permitido en los
   términos de servicio de AliExpress.** El riesgo real es que tu IP se
   quede bloqueada temporalmente si el volumen de búsquedas es muy alto —
   por eso el workflow corre solo 1 vez al día con 4 búsquedas, no cada
   hora con 50.

Si estos riesgos no te parecen aceptables, la alternativa sin riesgo sigue
siendo pegar tú mismo el link en la hoja `candidatos` (2 minutos/semana) y
dejar que el Flujo 2 haga el resto.

## Setup
1. Agrega el servicio `browserless` al `docker-compose.yml` (ya está en
   este repo) y ponle un `BROWSERLESS_TOKEN` random en tu `.env`.
2. `docker compose up -d` para levantar el navegador headless junto a n8n.
3. Importa `flow0-discovery.json` en n8n.
4. Conecta la credencial de Google Sheets (misma hoja `candidatos`).
5. En n8n → Settings → Variables, agrega `BROWSERLESS_TOKEN` con el mismo
   valor del `.env`.

## Cómo probarlo (hazlo en este orden)
1. Ejecuta manualmente el nodo "Browserless: Renderizar Búsqueda" solo —
   revisa que el HTML que devuelve de verdad parezca una página de
   resultados de AliExpress (y no una página de bloqueo/captcha).
2. Ejecuta "Extraer Tarjetas de Producto" — si `title`/`url`/`price` salen
   vacíos, abre el HTML del paso 1, busca la tarjeta de un producto, y
   copia el nombre de clase real para reemplazarlo en los `cssSelector`
   del nodo.
3. Una vez que veas filas nuevas aparecer en la hoja `candidatos`, déjalo
   activo (`Active: ON`).
