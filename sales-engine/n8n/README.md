# Flujos de automatización — Vicina Maris

Se importan en n8n (Workflows → Import from File). La infraestructura de n8n ya
está documentada en `automation/README.md` — es la misma instancia, no hace
falta montar otra.

**Los dos flujos vienen con `active: false` a propósito.** Leer la sección
"Antes de activar" antes de prenderlos.

---

## Flujo A — Respuesta instantánea (`flow-a-respuesta-instantanea.json`)

Entra una consulta por WhatsApp → contesta en segundos con cotización real.

```
Webhook (WhatsApp Cloud API)
  → Normalizar mensaje        (filtra acuses de recibo, quedan solo mensajes)
  → Parsear fechas y personas (texto libre en español → fechas + huéspedes)
  → ¿Tiene fechas?
       sí → Disponibilidad → Cotizar → Redactar
       no → Pedir fechas
  → Enviar por WhatsApp
  → Avisar por Telegram       (para que un humano cierre)
  → Registrar lead en Sheets  (alimenta el Flujo B y el reporte)
  → 200 OK
```

**Por qué importa:** en consultas directas, la primera respuesta se lleva la
reserva. Quien pregunta por WhatsApp está preguntando en 3 o 4 lugares a la vez.
Este flujo no reemplaza al vendedor — le gana tiempo: contesta con precio real
en segundos y el humano entra a cerrar, no a informar.

**Qué NO hace:** confirmar reservas. Cotiza y escala a una persona.

## Flujo B — Seguimiento de leads (`flow-b-seguimiento-leads.json`)

Corre todos los días a las 10 AM, busca consultas que no cerraron y manda el
seguimiento que corresponde (24 h → 72 h → 7 días).

Reglas que trae codificadas:
- Máximo 3 seguimientos, después se para
- Uno por lead por día
- Nada a leads cerrados, perdidos o con check-in ya pasado
- 45 segundos entre envíos

Acá está el volumen que hoy se pierde: la mayoría de las consultas no cierran al
primer mensaje y la mayoría no se vuelve a tocar nunca.

---

## Antes de activar

### 1. El nodo de disponibilidad está simulado 🔴

En el Flujo A, `Consultar disponibilidad (SIMULADO)` **devuelve 9 fijo**. No
consulta ningún calendario real, porque no hay PMS ni channel manager conectado
en este repo.

Tal cual está, el flujo puede cotizar fechas que ya están vendidas.

Por eso el flujo **cotiza pero no confirma**: manda precio, avisa por Telegram y
un humano verifica disponibilidad y cierra. Mientras ese nodo siga simulado, esa
verificación humana es lo único que evita una sobreventa — y una sobreventa
cuesta la reserva, la reseña y, con 2 reseñas de base, buena parte de la
reputación.

Para conectarlo de verdad: reemplazar ese nodo por una consulta al channel
manager / PMS que devuelva `roomsLeft` real.

### 2. Faltan credenciales

Ninguna de estas está en el repo, y con razón — el brief las excluye
explícitamente:

| Qué | Para qué | Cómo se carga |
|---|---|---|
| WhatsApp Cloud API (token + phone number ID) | Enviar y recibir | Credencial Header Auth en n8n |
| Google Sheets | Registro de leads | Credencial Google en n8n |
| Telegram bot | Avisos de lead nuevo | Credencial Telegram en n8n |

Variables a crear en n8n (Settings → Variables):

```
WHATSAPP_PHONE_NUMBER_ID
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
VICINA_LEADS_SHEET_ID
VICINA_PRICING_RULES      (opcional: JSON de pricing-rules.json)
```

Los tokens van **solo** en credenciales de n8n. Nunca en el JSON del workflow,
nunca en el repo, nunca en el chat.

### 3. Plantillas de WhatsApp aprobadas por Meta

Fuera de la ventana de 24 h, WhatsApp Cloud API **solo permite plantillas
pre-aprobadas**. El Flujo B manda casi siempre fuera de esa ventana.

Hay que dar de alta `FU-24`, `FU-72` y `FU-7D` como message templates en Meta
Business y esperar la aprobación (suele ser < 24 h). Sin eso, el Flujo B falla
en el envío.

El Flujo A responde **dentro** de la ventana (el huésped acaba de escribir), así
que puede usar texto libre.

### 4. La hoja de leads

Crear una hoja de Google llamada `leads` con estas columnas exactas:

```
fecha | telefono | nombre | mensaje | check_in | check_out | adultos |
total_cotizado | estado | seguimientos_enviados | ultimo_seguimiento
```

Los nombres tienen que coincidir: los dos flujos leen y escriben por nombre de
columna.

Valores de `estado`: `cotizado`, `en_seguimiento`, `agotado`, `reservado`,
`perdido`, `no_contactar`.

---

## Cómo probarlo sin arriesgar

1. Importar el Flujo A y **dejarlo inactivo**.
2. "Execute workflow" y mandar un POST de prueba al webhook de test:

```bash
curl -X POST "$N8N_TEST_WEBHOOK_URL" \
  -H 'Content-Type: application/json' \
  -d '{"entry":[{"changes":[{"value":{
        "contacts":[{"profile":{"name":"Ana Pérez"}}],
        "messages":[{"from":"50760000000","id":"test1","type":"text",
                     "text":{"body":"Hola, tienen para el 14 y 15 de noviembre? somos 4 personas"}}]
      }}]}]}'
```

Debería cotizar 1 noche del 14 al 15 de noviembre para 4 adultos.

3. Desconectar el nodo de WhatsApp hasta estar seguro del texto, así se ve la
   respuesta en n8n sin mandarle nada a nadie.
4. Recién después, conectar el webhook real de Meta y activar.

Para el Flujo B: ejecutarlo a mano con la hoja cargada con un lead de prueba y
**el nodo de WhatsApp desconectado**. Verificar que elige la plantilla correcta
y que actualiza la fila. Que actualice la fila es lo crítico: si eso falla, el
lead recibe el mismo mensaje todos los días.

---

## Lógica de precios duplicada — mantener sincronizado

El nodo `Cotizar` del Flujo A es **una copia literal** de
`sales-engine/lib/quote.js`. n8n no puede importar módulos del repo, así que la
lógica está pegada adentro del nodo.

**Si se cambia un precio o una regla, hay que cambiarlo en los dos lados.**

Las pruebas cubren el archivo del repo:

```bash
node --test sales-engine/lib/quote.test.js
```

Correlas después de cualquier cambio de precio, y replicá el cambio en el nodo.

---

## Flujos que faltan

No están construidos todavía. En orden de lo que más rendiría:

- **Flujo C — Pedido de reseña post check-out.** Debería ser el próximo. Con
  6.0/10 sobre 2 reseñas, automatizar el pedido de reseña vale más que
  cualquier campaña. Necesita saber cuándo se fue cada huésped, o sea que
  depende de tener los datos de reservas en algún lado.
- **Flujo D — Upsell 3 días antes** (early/late check-out). Depende de lo mismo.
- **Flujo E — Last-minute** para fechas cercanas con habitaciones libres.
  Depende de disponibilidad real: sin eso, ofrecería habitaciones vendidas.

Los tres dependen de la misma pieza faltante: **datos reales de reservas**.
Esa es la dependencia a destrabar, no más workflows.
