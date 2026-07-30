# MONÉA — Infraestructura de automatización (Shopify + n8n + DSers)

## 1. Setup inicial de n8n

### Decisión: self-hosted con Docker (gratis), no n8n Cloud

n8n Cloud cobra desde ~$20-24/mes (solo tiene trial gratis de 14 días). Como
el presupuesto inicial es cero, usamos **self-hosted con Docker**, que es
gratis para siempre — solo pagas si usas un VPS de pago, pero se puede correr
100% gratis con:

- **Servidor**: [Oracle Cloud Free Tier](https://www.oracle.com/cloud/free/)
  (VM ARM gratis para siempre, 4 OCPU / 24GB RAM) o tu propia máquina/mini PC
  si la vas a dejar prendida 24/7.
- **HTTPS + webhooks públicos sin comprar dominio**: [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
  (gratis, cuenta Cloudflare + un tunnel).

### Pasos

1. Crea la VM en Oracle Cloud Free Tier (o usa cualquier servidor con Docker).
2. Instala Docker y Docker Compose en el servidor.
3. Clona este repo en el servidor y entra a `automation/n8n/`.
4. Copia `.env.example` a `.env` y llena los valores (ver comentarios en el archivo).
5. Crea un túnel en Cloudflare Zero Trust → Networks → Tunnels, apunta el
   hostname público al puerto `5678` interno, copia el token al `.env`.
6. `docker compose up -d`
7. Entra a `https://TU_HOST_PUBLICO`, crea tu cuenta de owner de n8n (usuario/clave propios de n8n, distintos al basic auth).

### Conectar Shopify a n8n

1. Shopify Admin → **Configuración** → **Apps y canales de venta** → **Desarrollar apps** → **Crear una app** (nómbrala "n8n Automation").
2. **Configurar Admin API scopes** → activa mínimo: `read_products`, `write_products`, `read_orders`, `write_orders`, `read_fulfillments`, `write_fulfillments`.
3. **Instalar app** → pestaña **API credentials** → copia el **Admin API access token** (`shpat_...`).
4. En n8n: Credentials → New → busca "Shopify" → pega tu dominio (`monea-3929.myshopify.com`) y el token.

Ese token nunca se pega en el chat conmigo ni se hardcodea en ningún workflow — vive solo dentro de las credenciales de n8n.

---

## 2. Diagnóstico real de los 3 flujos (leer antes de construir)

Antes de armar nodos falsos que luego no conectan a nada real, investigué qué
API expone DSers de verdad. Esto es lo que hay:

### Flujo 1 — Fulfillment automático: **más fácil de lo que pensabas, no necesita n8n**

DSers ya escucha los pedidos de Shopify de forma nativa (es una app instalada
en tu tienda) y tiene dos toggles ya construidos:
- **Auto order** (crea el pedido en AliExpress automático cuando entra una venta)
- **Auto sync tracking** (sincroniza el tracking de vuelta a Shopify solo)

Ambos se activan directo en DSers → Settings, sin escribir nada en n8n. Te
guío a activarlos cuando lleguemos a esa parte — es más rápido que construir
un webhook custom.

Lo que SÍ tiene sentido construir en n8n para este flujo es una capa de
**vigilancia/alerta** (lo que pediste de notificación): un workflow que cada
hora revise pedidos de Shopify sin fulfillment después de X horas, y te avise
por Telegram/email si algo se atoró (producto agotado, fallo de DSers, etc.).
Esto sí lo armamos en n8n porque es información que Shopify sí expone por
API — no depende de que DSers tenga una API que no tiene.

### Flujo 2 — Selección y publicación automática de productos: **bloqueo real, igual que con Dropi**

La API pública de DSers (`dsers.dev`) es para que **proveedores o
marketplaces construyan integraciones que se conectan a DSers** (ej. un
proveedor nuevo que quiere aparecer en su catálogo) — **no es una API para
que tú, como comerciante, busques/filtres productos de AliExpress de forma
programática.** No existe el endpoint "dame productos de ropa de mujer bajo
$10 con buen rating" para uso de automatización personal.

Dos caminos reales, ninguno es "n8n hace clic solo hoy mismo":
1. **Selección manual semanal (lo que hace todo el mundo en este negocio):** tú
   navegas DSers/AliExpress 10-15 min, agregas candidatos a tu import list, y
   ahí sí n8n/yo tomamos el relevo: calculamos precio con margen y publicamos
   en Shopify automático.
2. **API oficial de afiliados de AliExpress (Open Platform):** existe y sí
   permite búsqueda de productos por API, pero requiere aplicar y ser
   aprobado como partner — no es instantáneo. Si quieres, te ayudo a armar esa
   solicitud, pero no la tendremos lista esta semana.

### Flujo 3 — Contenido para TikTok/IG: **100% construible, ya lo tengo armado**

Esto no depende de ninguna API rota. Ya construí el motor completo (Claude
para el copy + Kling AI para el video del modelo + Ayrshare para publicar en
IG/TikTok) en un workflow anterior. Solo falta cambiar el disparador de
"todos los días a las 3pm" a **"cuando se crea un producto nuevo en
Shopify"** (webhook nativo de Shopify, funciona perfecto). Te lo entrego en
cuanto lleguemos a este flujo.

---

## 3. Variables de entorno / seguridad

- Ninguna API key se hardcodea en ningún workflow — todo vive en las
  Credentials de n8n o en `.env` (que está en `.gitignore`, nunca se sube a git).
- `.env.example` documenta qué variables hacen falta sin exponer valores reales.
