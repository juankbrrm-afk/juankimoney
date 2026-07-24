# 9. MVP

## Objetivo del MVP

Probar una sola hipótesis: **un turista real, sin ayuda humana, puede describir su situación en
lenguaje natural y recibir un itinerario con lugares reales y verificados que efectivamente
visita.** Todo lo que no sirva para probar esa hipótesis queda fuera, sin excepción — incluida la
mayoría del modelo de negocio.

## Alcance geográfico y de datos

- **Un solo país**: Panamá (`countries` ya modelado multipaís, pero solo un registro activo).
- **Una sola ciudad a fondo**: Ciudad de Panamá + Casco Antiguo, con **150-300 lugares curados a
  mano** por el equipo (no scraping automatizado — la calidad y verificación del dato es el
  producto, y a este volumen la curación manual es más rápida que construir herramientas de
  ingesta masiva). Categorías cubiertas: restaurantes, hoteles, rooftops, playas cercanas, tours,
  vida nocturna, museos — suficiente variedad para que los prompts de ejemplo del brief ("tengo
  hambre", "quiero playa", "vida nocturna") tengan respuesta real.

## Dentro del MVP

- Chat conversacional multi-idioma (mínimo español + inglés; el modelo soporta más de forma
  nativa) con streaming.
- Motor de intención + RAG + tool-calling completo (`search_places`, `build_itinerary`,
  `get_weather`) — el guardrail de cero-alucinación **no es opcional ni siquiera en el MVP**,
  es la promesa central del producto.
- Itinerario visual (`ItineraryTimeline`), editable por conversación, compartible por link sin
  cuenta.
- Perfil de lugar completo (foto, descripción, horarios, precio, contacto, los 3 botones de
  acción) — botón "Reservar" en el MVP puede enlazar externamente (WhatsApp/teléfono/web del
  negocio) en vez de checkout nativo; el checkout nativo con comisión es Fase 2.
- Cuenta de usuario opcional (guardar itinerario, preferencias básicas).
- Dashboard admin interno mínimo: CRUD de lugares/categorías para el equipo de contenido (no
  self-service de negocio todavía — eso es Fase 2).
- PWA instalable.

## Explícitamente fuera del MVP

- Reservas nativas con pago (Yappy / PagueloFacil) — se pospone a Fase 2.
- Dashboard self-service para negocios — el equipo interno carga y mantiene los datos.
- Listados destacados, publicidad, suscripciones — cero monetización activa en el MVP.
- Cobertura fuera de Ciudad de Panamá/Casco Antiguo.
- API B2B/B2G.
- App nativa iOS/Android (la PWA cubre el caso de uso del MVP).
- Segundo país.

## Criterio de éxito del MVP

- **Cualitativo**: sesiones de prueba con turistas reales (no el equipo) completando un
  itinerario de un día sin intervención humana y calificando la experiencia como "mejor que lo
  que hubiera hecho solo con Google".
- **Cuantitativo**: ≥60% de conversaciones terminan en un itinerario guardado o una acción de
  contacto con un negocio (llamar/navegar/WhatsApp), y **0 alucinaciones de negocios inexistentes**
  detectadas en el golden set de evaluación (ver [`06-sistema-ia.md`](./06-sistema-ia.md)) y en
  revisión manual de una muestra de conversaciones reales.

## Timeline estimado

8-10 semanas desde Fase 0 completada, con un equipo mínimo de: 1 ingeniero full-stack senior
(Next.js/Supabase), 1 ingeniero especializado en el motor de IA, 1 diseñador producto/UX, y
soporte de una persona de contenido/operaciones para curar los 150-300 lugares iniciales — este
último rol es tan crítico como cualquier ingeniero, porque el dataset *es* el producto.
