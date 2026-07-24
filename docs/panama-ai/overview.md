# Visión de Producto y Resumen Ejecutivo

## La tesis

Un turista que aterriza en Panamá hoy resuelve su viaje con seis apps distintas (Google Maps,
Instagram, TripAdvisor, WhatsApp a su hotel, un grupo de Facebook, y preguntas al taxista) y
ninguna de ellas sabe quién es él, cuánto tiempo tiene, ni cuánto quiere gastar. Panama AI
reemplaza esas seis apps con una conversación. El usuario dice *"tengo un día, viajo con mis
hijos, presupuesto de $50"* y recibe un itinerario ejecutable — con reservas, rutas y contactos
reales — en el idioma que hable, con el criterio de un concierge de hotel cinco estrellas que
lleva veinte años en Panamá.

Eso solo es posible si dos cosas son verdad al mismo tiempo:

1. **La capa de datos es la mejor y más verificada base de POIs turísticos del país** (no
   scraping de Google Places genérico — datos de horarios, precios, disponibilidad y contacto
   directo mantenidos por los propios negocios).
2. **La capa de IA entiende intención, no palabras clave**, y nunca recomienda algo que no pueda
   respaldar con datos reales.

Quien construya esas dos capas primero, en un país pequeño y turísticamente denso como Panamá,
tiene una ventana de 18-24 meses antes de que un jugador global (Google, TripAdvisor, una OTA)
decida invertir en hacerlo también. Esa ventana es el negocio.

## Qué NO es este producto

- No es un directorio con IA encima. El directorio es *insumo*, no el producto.
- No es una app de reservas más (Booking, Airbnb, GetYourGuide ya ganaron esa guerra global). Nos
  integramos con ellas cuando conviene, no competimos de frente en inventario hotelero genérico.
- No es un chatbot de FAQ turísticas. Si la respuesta no cambia el itinerario o la acción del
  usuario, no es el producto.

## Por qué esto puede ser la empresa de turismo más grande de Latinoamérica

- **Efecto de red de datos por país**: cada reserva, cada búsqueda, cada "esto no me gustó" hace
  mejor la recomendación siguiente. Un competidor que llega tarde no puede comprar ese dataset.
- **Defensibilidad institucional**: una vez que un municipio o el aeropuerto de Tocumen integra su
  API oficial de información turística con nosotros, migrar a otro proveedor tiene costo político,
  no solo técnico.
- **Modelo replicable, no reinventado por país**: el motor (IA, itinerarios, pagos, dashboard) es
  el mismo; lo único que cambia al lanzar Costa Rica AI es la data y el tono cultural del
  concierge. Eso convierte cada país nuevo en un costo marginal decreciente, el patrón clásico de
  una empresa que levanta ronda tras ronda con la misma narrativa: "funcionó en el país 1, aquí
  está el manual para el país 10".

## North Star Metric

**Itinerarios completados con al menos una acción de conversión** (reserva, llamada, navegación
iniciada, o compartido) **por usuario activo semanal**, medido por país. No "mensajes enviados al
chat" — eso mide uso del chatbot, no valor turístico entregado.

Métricas de apoyo: tasa de negocios que responden/confirman reservas en <15 min, GMV facilitado
(reservas + comisiones), % de sesiones que terminan en itinerario guardado, NPS del turista vs.
NPS de guías humanos tradicionales.

## Modelo de negocio

Multi-línea desde el diseño, aunque el MVP solo activa la primera:

| Línea | Descripción | Cuándo se activa |
|---|---|---|
| **Listados destacados** | Negocios pagan por aparecer primero en categoría/zona y con badge "Recomendado" | Fase 2 |
| **Suscripciones de negocio** | Planes Free / Pro / Premium para restaurantes, hoteles, tours (analítica, más fotos, respuesta prioritaria de reservas, perfil enriquecido) | Fase 2 |
| **Comisión por reserva** | % sobre reservas de tours/experiencias hechas dentro de la plataforma | Fase 2-3 |
| **Publicidad nativa** | Espacios patrocinados dentro de recomendaciones del itinerario, marcados como "Patrocinado", nunca mezclados con el ranking orgánico | Fase 3 |
| **API B2B (hoteles)** | Widget/API para que hoteles ofrezcan el concierge de IA a sus huéspedes con su marca | Fase 4 |
| **API B2G (municipios, aeropuertos)** | Licenciamiento de la plataforma como "kiosco oficial de información turística" | Fase 4-5 |
| **Datos agregados y analítica de turismo** | Reportes anonimizados de flujo turístico para cámaras de turismo/gobierno | Fase 5 |

Ver el detalle de cómo cada línea se refleja en el esquema de datos en
[`03-base-de-datos.md`](./03-base-de-datos.md#monetización) y en la API en
[`04-apis.md`](./04-apis.md#apis-b2b-b2g).

## Stack de alto nivel (resumen — detalle en `01-arquitectura.md`)

Next.js + React + TypeScript + Tailwind en el frontend, Supabase (Postgres + pgvector + Auth +
Storage + Realtime) como backend de datos, Claude como motor conversacional/razonamiento con
OpenAI como modelo de embeddings y fallback, Google Maps/Places + weather API para contexto
geoespacial, Yappy + PagueloFacil para pagos, Vercel para hosting/edge, Cloudflare para DNS/WAF/cache de borde.

## Cómo pensamos las próximas expansiones

Costa Rica AI, Colombia AI, México AI, República Dominicana AI no son productos nuevos: son un
`country_id` nuevo, un dataset de POIs nuevo, y un ajuste de tono cultural en el system prompt del
concierge. Toda decisión de arquitectura en este documento se evalúa contra la pregunta: *"¿esto
me obliga a reescribir algo cuando lancemos el país 2?"* Si la respuesta es sí, se rediseña ahora.
