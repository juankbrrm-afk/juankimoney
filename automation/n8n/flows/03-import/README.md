# 03 — Import a Shopify (Fase 4)

**Estado:** real, ya construido como base en `flow2-product-publish.json` (nodo "Shopify: Crear Producto").

Crea el producto en Shopify con precio calculado (costo × multiplicador,
rango $40-100), sin revisión manual, solo si pasó el score >90 de
02-scoring. Guarda el link del proveedor original como metafield
(`custom.supplier_url`) para trazabilidad con DSers.
