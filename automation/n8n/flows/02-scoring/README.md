# 02 — Scoring (Fase 3)

**Estado:** real, construible ahora.

Claude puntúa cada producto extraído en 01-sourcing de 0-100 en: calidad
(fotos/descripción), rating y volumen de pedidos (si vienen en la página
de AliExpress), precio vs. costo, potencial de tendencia/viralidad
(heurística de Claude, no dato duro), y margen resultante.

Umbral: solo pasa a 03-import si score > 90.

Evoluciona el nodo "Claude: Evaluar y Escribir Copy" del `flow2-product-publish.json` actual, separando el scoring de la generación de copy (eso se mueve a 04-seo-copy).
