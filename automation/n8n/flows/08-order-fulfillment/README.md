# 08 — Pedidos y Fulfillment (Fase 9)

**Estado:** mayormente nativo de DSers, no necesita construirse.

Cliente → Shopify → DSers (Auto Order, toggle nativo) → proveedor →
tracking (Auto Sync, toggle nativo) → Shopify actualiza el pedido →
Shopify manda el email nativo de envío.

Lo que sí se construye aquí:
- El watchdog de `flow1-fulfillment-watchdog.json` (alerta si algo se atora).
- WhatsApp al cliente cuando cambia el tracking: vía WhatsApp Business
  Cloud API de Meta (gratis hasta 1000 conversaciones/mes), disparado por
  el webhook de Shopify `fulfillment_events/create`. Requiere verificación
  de negocio en Meta — no es instantáneo, hay que iniciarlo temprano.
