# Flujo 3 — Video IA + Publicación en IG/TikTok

## Qué hace
Se dispara automático **cada vez que el Flujo 2 publica un producto nuevo**
en Shopify (vía webhook, sin cron ni espera): revisa que no se haya
publicado antes → Claude escribe gancho/guion/caption → Kling AI (vía
PiAPI) genera un video de un modelo real usando la prenda a partir de la
foto del producto → Ayrshare lo publica en Instagram y TikTok → se registra
en Google Sheets.

## Setup

### 1. Conectar el webhook de Shopify
1. Importa `flow3-content-social.json` en n8n, actívalo, y copia la URL del
   nodo "Webhook" (algo como `https://tu-n8n.com/webhook/monea-product-created`).
2. Shopify Admin → Configuración → Notificaciones → **Webhooks** → Crear webhook.
   - Evento: **Creación de producto**
   - Formato: JSON
   - URL: la que copiaste del nodo Webhook.

### 2. Credenciales
- **PiAPI** (Kling): cuenta gratis en piapi.ai, saca tu API key, créala en n8n como credencial de tipo "Header Auth" (header `Authorization: Bearer TU_KEY` o el que pida su doc).
- **Ayrshare**: cuenta en ayrshare.com (plan gratis: 20 posts/mes), conecta tu Instagram y TikTok de negocio ahí, copia tu API key como credencial "Bearer Auth" en n8n.
- **Google Sheets**: usa la misma hoja `posted_products` de antes (columnas: `product_id, title, posted_at, caption`).
- Reemplaza `PLACEHOLDER_SHEET_ID` (aparece 2 veces) por el ID real de tu sheet.

## Cómo probarlo
1. Crea un producto de prueba manualmente en Shopify (o corre el Flujo 2 una vez).
2. Confirma que el webhook llegó: en n8n, pestaña "Executions", debe aparecer una ejecución nueva.
3. Revisa que el video se generó bien en el paso de PiAPI antes de dejarlo en automático — la calidad varía según la foto del producto.
4. Revisa las primeras 3-4 publicaciones reales en IG/TikTok manualmente antes de confiar 100% en el flujo — evita que salga algo raro sin que lo veas.

## Nota de riesgo
Instagram/TikTok pueden marcar como spam una cuenta nueva que solo postea
contenido de IA sin actividad orgánica. Mezcla esto con posts tuyos reales,
sobre todo las primeras semanas.
