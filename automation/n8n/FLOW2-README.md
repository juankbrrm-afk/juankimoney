# Flujo 2 — Filtrar, Pricear y Publicar Productos

## Qué hace
Todos los lunes a las 9am: lee una hoja de Google Sheets con productos
candidatos → Claude evalúa si encajan con el posicionamiento "boutique/lujo
accesible" de MONÉA (score 1-10) y escribe el título + descripción →
si el score es ≥7, calcula el precio de venta (costo × 6, con piso $40 /
techo $100) y **publica el producto directo en Shopify, sin revisión
manual** → registra en la misma hoja qué se publicó (o rechazó y por qué).

## La única parte manual real (y por qué existe)
DSers no tiene una API pública para "buscar productos por costo/rating/
categoría" — investigué esto a fondo (ver `automation/README.md`). Así que
la hoja de Google Sheets `candidatos` es donde tú pegas los productos que
encontraste navegando DSers/AliExpress (5-10 min a la semana). De ahí en
adelante, todo lo demás es automático.

### Columnas que debe tener la hoja "candidatos"
`product_url | title | category | cost | image_url | description | status`

Deja `status` vacío o en `pending` para los nuevos. El workflow los pasa a
`published` o `rejected` solo.

## Setup
1. Crea el Google Sheet con esas columnas, pestaña llamada `candidatos`.
2. Importa `flow2-product-publish.json` en n8n.
3. Reemplaza `PLACEHOLDER_SHEET_ID` (aparece 3 veces) por el ID real de tu
   sheet (está en la URL de Google Sheets).
4. Conecta las credenciales de Google Sheets, Shopify y Claude (Anthropic).
5. Ajusta si quieres el multiplicador de precio en el nodo
   "Calcular Precio de Venta" (por defecto: costo × 6, rango $40-$100).

## Cómo probarlo
1. Agrega 1-2 productos de prueba en la hoja con `status = pending`.
2. Ejecuta el workflow manualmente.
3. Revisa: ¿se creó el producto en Shopify? ¿la hoja marcó `published` con el
   `shopify_product_id`? ¿el precio quedó en el rango esperado?
4. Si algo no encaja con la marca, prueba con un producto random (ropa
   deportiva genérica, por ejemplo) y confirma que Claude lo rechace
   (`status = rejected` con una razón).
5. Solo después de una corrida limpia, activa el workflow (`Active: ON`).

## Nota
El producto se crea con `status: "active"` (publicado inmediato) porque así
lo pediste. Si prefieres una red de seguridad, cambia ese valor a `"draft"`
en el nodo "Shopify: Crear Producto" para revisar antes de que se vea en la
tienda.
