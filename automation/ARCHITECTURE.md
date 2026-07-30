# MONÉA — Arquitectura del Sistema de Automatización

Fase 1: diseño completo, sin código nuevo todavía. Versión navegable e
ilustrada de este documento: ver el artifact publicado en la conversación
(diagrama, tabla de stack y roadmap con estados por fase).

## Resumen ejecutivo

De las 11 fases pedidas, 7 son construibles ahora sin bloqueos. Dos
dependen de una aprobación externa (Meta App Review para mensajería) que
hay que iniciar ya, en paralelo. Una — la búsqueda/descubrimiento de
productos — sigue teniendo un paso humano de minutos por semana porque ni
DSers ni AliExpress exponen una API de catálogo para uso de comerciante.

## Diagrama del sistema

```
Tú (pega link de producto en DSers)
        ↓
       n8n (orquestador, self-hosted)
        ↓
Claude API (scoring, copy, SEO, reportes) · Gemini/Kling (fotos y video) · Ayrshare (redes)
        ↓
     Shopify (tienda MONÉA)
        ↓
DSers (auto-order + auto-tracking, nativo) · WhatsApp/Email al cliente · Telegram (alertas y reporte diario)
```

## Stack técnico

| Servicio | Rol | Costo |
|---|---|---|
| Shopify | Tienda, catálogo, pedidos, emails nativos | Ya pagado |
| n8n | Orquestador de todos los workflows | Self-host gratis (Docker + Oracle Free Tier) |
| DSers | Único proveedor: catálogo, auto-order, auto-tracking | Gratis |
| Claude API | Scoring, copy, SEO, reportes, soporte al cliente | Pago por uso, centavos por llamada |
| Gemini (Nano Banana) | Fotos IA manteniendo la prenda intacta | Tier gratis disponible |
| Kling vía PiAPI | Video IA estilo iPhone/orgánico | Pago por uso, ~$0.10–0.30/video |
| Ayrshare | Publicación en IG/TikTok/FB/Pinterest/Threads | Gratis hasta ~20 posts/mes |
| Google Sheets | Base de datos ligera | Gratis |
| Telegram | Alertas y reporte diario | Gratis |
| WhatsApp Cloud API | Notificación de tracking + soporte | Gratis hasta 1,000 conversaciones/mes |
| Cloudflare Tunnel | HTTPS público para webhooks | Gratis |
| GitHub | Versionado de workflows, prompts y docs | Ya disponible |

## Estructura de carpetas

```
automation/
├── README.md
├── ARCHITECTURE.md
├── n8n/
│   ├── docker-compose.yml
│   ├── .env.example
│   ├── flow1-fulfillment-watchdog.json
│   ├── flow2-product-publish.json      # MVP actual de fases 2-5
│   ├── flow3-content-social.json       # MVP actual de fases 6-8
│   └── flows/
│       ├── 01-sourcing/          # fase 2
│       ├── 02-scoring/           # fase 3
│       ├── 03-import/            # fase 4
│       ├── 04-seo-copy/          # fase 5
│       ├── 05-image-studio/      # fase 6
│       ├── 06-video-studio/      # fase 7
│       ├── 07-social-publish/    # fase 8
│       ├── 08-order-fulfillment/ # fase 9
│       ├── 09-customer-support/  # fase 10
│       └── 10-reporting/         # fase 11
├── prompts/   # templates de prompts, versionados aparte
└── data/      # esquema de las hojas (sourcing, scored, logs)
```

## Fases

### 02 · Sourcing — parcialmente automatizable
Ni DSers ni AliExpress exponen una API de catálogo para comerciantes. Pero
las páginas de producto de AliExpress son públicas (sin login), así que
una vez que pegas el link, n8n sí extrae solo: precio, fotos, descripción,
variantes. Lo único manual es elegir qué producto buscar.

### 03 · Scoring IA — real, construible ahora
Claude puntúa 0-100 en calidad, reviews, precio, tendencia (heurística) y
margen. Solo pasa si score > 90.

### 04 · Import a Shopify — real, construible ahora
Producto con score > 90 se crea directo en Shopify, con el link del
proveedor como metafield para trazabilidad.

### 05 · SEO y copy — real, construible ahora
Título, descripción, beneficios, FAQ (metafield), tags, colección, SEO
title/meta description — todo escrito directo a los campos nativos de
Shopify.

### 06 · Estudio de fotos IA — real, validar calidad antes de confiar 100%
Gemini 2.5 Flash Image ("Nano Banana") preserva color/textura/estampado de
la prenda mientras cambia modelo, fondo, iluminación y escenario
(caminando, Casco Viejo, Costa del Este, café, rooftop, restaurante,
playa).

### 07 · Estudio de video IA — real, ya construido como base
Kling vía PiAPI como motor principal. Runway se descarta: no tiene tier
gratuito real.

### 08 · Publicación multi-red — real, ya construido, se expande
Ayrshare cubre IG/TikTok/FB/Pinterest/Threads en una sola API. Gratis
hasta ~20 posts/mes.

### 09 · Pedidos y fulfillment — mayormente nativo
DSers ya hace Cliente→Shopify→DSers→proveedor→tracking→Shopify de forma
nativa (Auto Order + Auto Sync Tracking). n8n construye: el watchdog de
pedidos atascados, y notificación de WhatsApp al cliente vía WhatsApp
Cloud API.

### 10 · Atención al cliente IA — real, depende de aprobación externa
Meta exige App Review + verificación de negocio para permisos de
mensajería avanzados. Iniciar la solicitud ya, en paralelo.

### 11 · Reportes diarios — real, sin bloqueos
Job diario: ventas/pedidos de Shopify (ShopifyQL) + gasto/ROAS de Meta Ads
si aplica, compilado por Claude, entregado por Telegram.

## Roadmap de implementación

1. **Semana 1** — Fases 2-5 (catálogo en vivo) + Fase 9 core (toggles nativos de DSers) + iniciar Meta App Review en paralelo.
2. **Semana 2** — Fases 6-8 (motor de marketing: fotos, video, publicación).
3. **Semana 2-3** — Fase 11 (reportes diarios).
4. **Semana 3-4+** — Fase 10 + WhatsApp de la fase 9, una vez Meta apruebe.

## Reglas del sistema

- Cada fase es un workflow separado y documentado — nada monolítico.
- Ninguna API key se hardcodea: todo vive en credenciales de n8n o variables de entorno.
- Antes de prometer una integración, se verifica que la API exista de verdad.
- Se reutiliza un template existente de n8n cuando hay uno bueno; se construye desde cero solo cuando no lo hay.
