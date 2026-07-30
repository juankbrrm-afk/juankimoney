# Flujo 1 — Fulfillment Watchdog

## Qué hace
El fulfillment automático real (crear el pedido en AliExpress + sincronizar
tracking a Shopify) **lo hace DSers nativo** — no hay que construirlo en
n8n porque DSers no expone esa parte por API pública. En vez de fingir un
flujo que no puede conectar a nada real, este workflow cubre lo que sí es
tuyo por API: **vigilar Shopify cada hora y avisarte si un pedido lleva
más de 24h sin fulfillment** (señal de que algo falló del lado de DSers/proveedor).

## Antes de esto: activa DSers nativo
1. Abre la app DSers (dentro de tu Shopify Admin → Apps → DSers).
2. Settings → activa **"Auto order"**.
3. Settings → activa **"Auto sync tracking number"**.

Con esos dos toggles, el 90% del Flujo 1 ya está resuelto sin n8n.

## Setup de este workflow
1. Importa `flow1-fulfillment-watchdog.json` en n8n.
2. Conecta la credencial de Shopify (la misma que ya usas).
3. Crea un bot de Telegram: habla con **@BotFather** en Telegram → `/newbot` → copia el token.
4. Consigue tu `chat_id`: escríbele algo a tu bot y luego abre
   `https://api.telegram.org/bot<TU_TOKEN>/getUpdates` en el navegador — ahí sale tu `chat.id`.
5. En n8n → Settings → Variables, crea:
   - `SHOPIFY_STORE_DOMAIN` = `monea-3929.myshopify.com`
   - `TELEGRAM_CHAT_ID` = tu chat id
6. Crea la credencial de Telegram en n8n con el token del bot.

## Cómo probarlo
- Ejecuta el workflow manualmente ("Execute workflow"). Si no tienes pedidos
  atascados hace 24h+, no debería mandarte nada (correcto).
- Para forzar una prueba: baja `STALE_HOURS` a `0` temporalmente en el nodo
  "Filter Orders Pending > 24h" y ejecútalo con al menos un pedido real en
  la tienda — deberías recibir el mensaje en Telegram.
- Vuelve a subir `STALE_HOURS` a `24` y activa el workflow (`Active: ON`).
