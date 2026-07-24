# 5. Sistema de Diseño y Componentes

## Filosofía

Un sistema de diseño propio, en `packages/ui`, inspirado en el rigor de Linear/Stripe (tokens
consistentes, poca decoración) y en la calidez editorial de Airbnb (fotografía grande, tipografía
humana). No se usa una librería de componentes genérica sin personalizar — el patrón de
implementación es el de **shadcn/ui** (componentes copiados y editables dentro del repo, no una
dependencia opaca de node_modules), porque necesitamos control total del look & feel para que se
sienta como un producto de un solo país que después se "repinta" por mercado sin rehacer nada.

## Tokens (`packages/ui/src/tokens`)

- **Color**: paleta neutra premium (grises cálidos, casi-negro, blanco roto) + un único acento de
  marca por país, configurable (Panamá: un azul-verde inspirado en el Canal/el mar Caribe-Pacífico,
  sin caer en cliché de bandera). Estados semánticos (éxito, alerta, error) independientes del
  acento de marca.
- **Tipografía**: una familia sans-serif premium para UI (ej. Inter o una tipografía con
  personalidad tipo General Sans/Söhne-alike con licencia adecuada) + una segunda familia serif o
  display para titulares editoriales (perfiles de lugar, storytelling cultural), igual que Airbnb
  distingue UI de contenido editorial.
- **Espaciado**: escala de 4px, con mucho aire — el brief pide explícitamente "muchísimo espacio
  en blanco"; se define un `spacing-loose` por defecto en layouts de contenido, no solo en la UI
  densa del dashboard admin.
- **Motion**: duración/easing estandarizados (`packages/ui/src/tokens/motion.ts`), usando
  Framer Motion. Transiciones de 150-250ms para UI, hasta 400ms para transiciones de página/hero.
  Nada de animación decorativa sin propósito — el estándar es Linear (rápido, funcional) no un
  sitio de agencia creativa.

## Componentes primitivos (`primitives/`)

Button, Input, Textarea, Select, Sheet (bottom sheet en móvil / side panel en desktop), Dialog,
Tooltip, Badge, Avatar, Skeleton, Toast — construidos sobre Radix UI para accesibilidad
(manejo de foco, ARIA) sin heredar su estética por defecto.

## Componentes de patrón (`patterns/`) — el vocabulario específico de Panama AI

| Componente | Uso |
|---|---|
| **ChatCanvas** | El lienzo conversacional principal: burbujas de mensaje + tarjetas ricas embebidas (no solo texto) |
| **PlaceCard** | Tarjeta de lugar: foto, nombre, categoría, rating, precio, distancia, badges (Destacado/Abierto ahora) — usada en resultados de chat, exploración y admin |
| **PlaceDetailSheet** | Vista expandida de un lugar con fotos, horarios, precio, reseñas, y los 3 botones de acción (Reservar / Llamar / Navegar) |
| **ItineraryTimeline** | Vista de itinerario día por día, arrastrable (drag to reorder), con hora estimada por parada |
| **MapView** | Mapa interactivo (Google Maps JS API envuelto) sincronizado con los resultados listados — hover en tarjeta resalta el pin |
| **CategoryChips** | Filtros rápidos de intención ("Comida", "Playa", "Vida nocturna"...) sobre el chat, para usuarios que prefieren tocar antes que escribir |
| **QuickIntentPrompts** | Sugerencias de prompt tipo "Tengo un día", "Voy con niños", "Quiero algo escondido" al iniciar conversación — reduce la fricción de la página en blanco |
| **BookingModal** | Flujo de reserva/pago (Stripe Elements embebido) |
| **AdminDataTable** | Tabla con edición inline, usada en todo el dashboard admin (negocios, categorías, eventos) |
| **AnalyticsCard / Sparkline** | Widgets de métricas del dashboard |
| **LanguageSwitcher** | Cambio de idioma explícito, aunque el chat detecta idioma automáticamente por mensaje |

## Data fetching y estado

- **Server Components + fetch directo a Supabase** para todo contenido que no cambia por
  interacción del usuario en tiempo real (perfil de lugar, landing de categoría) — mejor SEO y
  TTFB.
- **TanStack Query** en el cliente para todo lo interactivo (favoritos, itinerario en edición,
  resultados de exploración con filtros) — cache, invalidación y estados de carga consistentes.
- **Vercel AI SDK (`useChat`)** para el streaming de la conversación con el concierge — maneja
  estado de mensajes, streaming de tokens y tool-call rendering out of the box.
- **Supabase Realtime** para estado que cambia por eventos externos: confirmación de reserva por
  parte del negocio, actualización de disponibilidad.

## Responsive y plataforma

- **Mobile-first estricto**: el turista usa esto parado en la calle con datos móviles, no en un
  escritorio. Cada componente se diseña primero para 375px de ancho.
- **PWA desde el MVP**: instalable, funciona con conectividad intermitente (cache de la última
  respuesta del concierge y del itinerario activo vía Service Worker), porque el roaming
  internacional en Panamá no siempre es confiable para un turista recién llegado.
- Dashboard admin es **desktop-first** (uso interno/negocios en horario laboral), pero responsive
  hasta tablet como mínimo.
