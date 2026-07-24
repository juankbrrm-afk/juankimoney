# 7. Diseño UX/UI

## Principios (no negociables)

1. **La conversación es la interfaz principal, no una función adicional.** La página de inicio no
   es una grilla de categorías con un ícono de chat en la esquina — es el chat, con sugerencias
   de intención visibles para quien prefiera tocar antes que escribir.
2. **Espacio en blanco como jerarquía, no como decoración.** Cada pantalla resuelve una sola
   decisión del usuario a la vez. Si una pantalla tiene más de una acción primaria compitiendo,
   está mal diseñada.
3. **Cero fricción antes del primer valor.** Sin login para chatear, sin login para ver un
   itinerario armado. Login solo cuando el usuario quiere *guardar* algo o *reservar* algo — el
   momento en que ya percibió valor y el costo de fricción se justifica.
4. **Cada lugar recomendado es accionable de inmediato.** Ver [`03-base-de-datos.md`](./03-base-de-datos.md):
   toda tarjeta de lugar tiene sus tres botones (Reservar / Llamar / Navegar) a un toque, nunca a
   dos.
5. **Confianza visual explícita.** Fuente de la reseña, badge de "Patrocinado" cuando aplica,
   "verificado por el negocio" cuando el negocio reclamó su perfil — el usuario nunca debe
   preguntarse si lo que ve es orgánico o pagado.

## Flujos clave

### 1. Primera visita (sin cuenta)
Landing con el chat ya visible (no una portada separada) + 4-6 `QuickIntentPrompts` calibrados al
país/temporada (“Tengo un día”, “Quiero algo escondido”, “Voy con niños”, “Vida nocturna”). El
usuario escribe o toca uno → respuesta en streaming con 2-3 tarjetas de lugar concretas, nunca una
lista genérica de 10.

### 2. Construcción de itinerario
Conversación → el modelo propone un `ItineraryTimeline` embebido en el chat → el usuario puede
arrastrar, quitar, o pedir en texto ("cámbialo, no quiero museos") → el timeline se actualiza en
vivo. Se puede compartir por link (`share_token`) sin necesidad de cuenta, útil para turistas que
viajan en grupo y coordinan por WhatsApp.

### 3. Perfil de lugar
Página SSR completa e indexable (SEO — cada lugar es una puerta de entrada orgánica desde Google
para tráfico que nunca pasó por el chat): galería, descripción, horarios de hoy resaltados,
precio, mapa embebido, reseñas (propias + Google), y los tres botones de acción. Diseño inspirado
directamente en la ficha de producto de Airbnb: foto dominante, información secundaria en
jerarquía tipográfica clara, nunca un muro de texto.

### 4. "Tengo X horas / X dólares" (modo restricción dura)
Caso de uso explícito del brief. El concierge trata presupuesto y tiempo como restricciones duras
del `build_itinerary`, no como preferencias suaves — el itinerario que propone nunca excede el
presupuesto ni el tiempo declarado, y lo dice explícitamente ("esto te deja con $12 de margen").

### 5. Emergencia (pasaporte perdido, necesito un doctor)
Cambia de registro visualmente: la burbuja de respuesta usa un tratamiento visual distinto (más
directo, con tarjetas de contacto de emergencia reales — embajada, hospital cercano, línea 911
local) — nunca el tono cálido/casual por defecto. Ver
[`06-sistema-ia.md#guardrails`](./06-sistema-ia.md#guardrails-y-seguridad-del-contenido).

### 6. Dashboard de negocio (self-service)
Un dueño de restaurante/hotel/tour reclama su perfil, edita fotos/horarios/precios, ve sus
reservas entrantes, y puede subir de plan. Diseño más denso e informativo que la app de turista
(más cercano a Stripe Dashboard que a Airbnb) porque el usuario aquí es un profesional revisando
datos con frecuencia, no un turista explorando.

### 7. Dashboard interno (staff/admin)
Ver [`05-componentes-ui.md`](./05-componentes-ui.md) — `AdminDataTable` + `AnalyticsCard` como
vocabulario base. Prioriza densidad de información y velocidad de edición en bulk sobre estética
editorial.

## Sistema visual (resumen — tokens completos en `05-componentes-ui.md`)

- Paleta neutra + un acento por país, nunca el acento como color de fondo dominante (se usa para
  CTAs y estados activos, el resto es escala de grises cálidos sobre blanco roto).
- Tipografía: sans premium para UI, serif/display para contenido editorial de lugares — el mismo
  patrón que separa "app" de "revista" en Airbnb.
- Fotografía como protagonista: ninguna tarjeta de lugar sin foto de calidad; si un negocio no
  sube fotos propias, no se publica (la calidad visual del catálogo es parte del producto, no un
  detalle).
- Animación funcional (Framer Motion): transiciones de estado (mensaje llegando, tarjeta
  expandiéndose), nunca animación que retrase la lectura de información útil.

## Accesibilidad

- Contraste AA como mínimo en todo texto sobre fondo.
- Navegación completa por teclado en el dashboard admin (uso profesional intensivo).
- Todo botón de acción (Reservar/Llamar/Navegar) con label accesible explícito, no solo ícono.
- Streaming de chat anunciado a lectores de pantalla de forma no disruptiva (`aria-live="polite"`).

## Responsive

Mobile-first para `apps/web` (turista), desktop-first para `apps/admin` — ver el detalle de
breakpoints y PWA en [`05-componentes-ui.md#responsive-y-plataforma`](./05-componentes-ui.md#responsive-y-plataforma).
