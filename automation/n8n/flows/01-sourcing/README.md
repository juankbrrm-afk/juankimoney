# 01 — Sourcing (Fase 2)

**Estado:** parcialmente automatizable.

Extrae datos de un producto de AliExpress (precio, fotos, descripción,
variantes) a partir de que pegues el link — las páginas de producto de
AliExpress son públicas, no requieren login, así que esto SÍ se puede
automatizar por scraping ligero.

Lo que sigue siendo manual: decidir QUÉ producto buscar y pegar el link
(no existe API de catálogo/búsqueda para uso de comerciante ni en DSers ni
en AliExpress sin aprobación de partner).

Reemplaza la hoja `candidatos` (solo `product_url`) del Flujo 2 actual.
Pendiente de construir: nodo que reciba la URL y devuelva el JSON completo
del producto.
