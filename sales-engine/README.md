# Motor de ventas — Vicina Maris Beach Lodge

Playa La Angosta, María Chiquita · Portobelo, Colón, Panamá
9 habitaciones · hasta 4 personas c/u · desde $69

Objetivo único: **cerrar reservas**. Todo lo que está acá existe para eso.

---

## Empezá por acá

| Si querés... | Abrí |
|---|---|
| Saber qué está roto y qué arreglar primero | **`channels/audit-2026-08.md`** |
| Saber qué contestar y cómo cerrar | `playbook/SALES-PLAYBOOK.md` |
| Copiar un mensaje ya escrito | `playbook/templates/` |
| Cotizar una estadía | `lib/quote.js` |
| Cambiar un precio o una regla | `config/` |
| Montar la automatización | `n8n/README.md` |
| El reporte diario del brief | `reporting/reporte-diario.md` |

---

## Lo primero, sin vueltas

Investigué la presencia real de la propiedad antes de escribir nada. **Lo que
más está frenando las ventas hoy no es la falta de canales ni de promociones:**

### 🔴 La calificación es 6.0/10 sobre 2 reseñas

El filtro más usado por los viajeros en Booking es **8.0+**. Con 6.0 la
propiedad **no aparece** para esa gente. No aparece cara, ni abajo: no aparece.
Ningún descuento y ninguna campaña cambian eso.

Lo bueno: con solo 2 reseñas de base, **6-8 reseñas buenas mueven el promedio a
8+ en semanas**. Es el arreglo más barato y más rápido que hay, y no cuesta
dinero — cuesta pedirlas.

**Gastar en anuncios antes de arreglar esto es pagar para llevar tráfico a una
ficha que convierte mal.** Por eso la propuesta de presupuesto pago va después,
no antes.

Los otros cuatro hallazgos (tarifa publicada bajo el piso, nombre partido entre
Portobelo y María Chiquita, web sin motor de reservas, canales sin cubrir) están
en `channels/audit-2026-08.md` con su nivel de confianza y qué hacer con cada uno.

---

## Qué hay construido

```
sales-engine/
├── config/
│   ├── property.json          Producto, tarifas y políticas — fuente única de verdad
│   └── pricing-rules.json     Precio dinámico: temporada, día, feriados PA, escasez
├── lib/
│   ├── quote.js               Motor de cotización (ESM, sin dependencias)
│   └── quote.test.js          27 pruebas — node --test
├── channels/
│   ├── audit-2026-08.md       Qué está publicado hoy y qué está roto
│   └── CHANNELS.md            Estrategia de canales y prioridades
├── playbook/
│   ├── SALES-PLAYBOOK.md      Cómo se cotiza, se objeta y se cierra
│   └── templates/             WhatsApp · email · redes y bandeja de OTA
├── n8n/
│   ├── flow-a-respuesta-instantanea.json
│   ├── flow-b-seguimiento-leads.json
│   └── README.md              Setup, credenciales y cómo probarlo sin riesgo
└── reporting/
    └── reporte-diario.md      El formato del brief §3
```

### El motor de cotización

```bash
node --test sales-engine/lib/quote.test.js     # 27 pruebas, todas pasan
```

Un solo cálculo de precio para todos los canales. Si WhatsApp y la web cotizan
distinto, el huésped lo nota y se cae la venta.

Precios que produce hoy:

| Escenario | Promedio/noche | Total |
|---|---|---|
| Martes, temporada baja, hotel vacío | $69.00 | $69.00 |
| Sábado, temporada baja | $86.94 | $86.94 |
| Sábado, temporada seca, quedan 2 hab. | $133.31 | $133.31 |
| Día de Colón (5-nov), última habitación, 2 noches | $122.92 | $245.84 |
| Carnaval 2027, 4 noches, 4 personas | $185.24 | $740.97 |
| Familia, 7 noches en julio, 2+2 y perro | $67.66 | $473.60 |

Sube donde tiene que subir: fines de semana, temporada seca, feriados y poca
disponibilidad. **El Día de Colón (5 de noviembre) tiene el multiplicador más
alto del calendario** — el hotel está en la provincia de Colón y ese día la
provincia entera se llena. Es el día de mayor poder de precio del año.

El último caso avisa: el descuento por 7 noches deja la noche efectiva en $67.66,
abajo del piso de $69. No se bloquea — 7 noches vendidas es buen negocio — pero
se avisa para que sea una decisión y no una fuga silenciosa.

---

## Lo que NO se pudo hacer, y por qué

Esto es lo más importante de este README. El brief pide ejecutar sin pedir
permiso en varios frentes. **En este entorno eso no fue posible**, y decirlo
claro vale más que un reporte con números inventados.

### No hay ninguna cuenta conectada

Este repo es el storefront de MONÉA (Shopify, ropa). No tiene ninguna
credencial, cuenta ni acceso de Vicina Maris. Concretamente **no pude**:

- Entrar a Booking, Airbnb, Expedia ni ninguna extranet — no hay credenciales
- Publicar en Instagram, Facebook, TikTok ni Google Business — no hay cuentas conectadas
- Responder consultas reales de huéspedes — no hay WhatsApp Business API conectada
- Ver reservas, ingresos o disponibilidad — no hay PMS ni acceso a datos

Las herramientas de Shopify que sí tengo apuntan a la tienda de ropa de MONÉA,
que no tiene nada que ver con el hotel.

### Por eso el reporte de ventas va en cero

**Reservas cerradas hoy: 0.** No porque no se venda, sino porque desde acá no
hay forma de cerrar ni de ver una venta. Inventar el número sería inútil: se
tomarían decisiones de precio y de canal sobre datos falsos.

### Y por eso esto es un motor, no una campaña

Lo que sí se podía hacer sin credenciales — y está hecho y probado — es **toda
la maquinaria que cierra ventas apenas se enchufe una cuenta**: el motor de
precios, los mensajes, la estrategia de canales, la auditoría de lo que está
roto y los flujos de automatización.

La investigación de canales sí se pudo hacer con fuentes públicas, y de ahí
salieron los cinco hallazgos. Ese es el trabajo con valor inmediato: **los
cuatro primeros no necesitan ninguna credencial nueva, solo entrar a la extranet
que ya existe.**

---

## Datos que faltan para completar el motor

Ninguno bloquea lo que ya está construido, pero cada uno destraba algo:

| Falta | Destraba |
|---|---|
| Precio y costo del **snorkel guiado** | Cotizarlo automático. Sin costo real no se puede fijar precio sin arriesgar margen negativo. |
| Ticket promedio de **Mamaniva** y si hay comisión | Idem, y saber cuánto vale de verdad el 20% |
| **Disponibilidad real** (PMS o channel manager) | Que el Flujo A confirme en vez de solo cotizar. Hoy está simulado. |
| **Número de WhatsApp Business** | Ponerlo en las plantillas y en las fichas de OTA |
| Si existen cuentas de **IG / FB / Google Business** | Verificar antes de crear (crear duplicados penaliza) |

---

## Necesita tu aprobación

Según el brief, §4:

1. **Presupuesto pago (Google/Meta Ads).** Propuesta: **esperar.** Con 6.0/10 el
   tráfico pago convierte mal y se quema plata. Primero reseñas, después
   anuncios. Cuando la calificación pase de 8.0, propongo presupuesto y objetivo
   concretos.
2. **Altas en OTAs nuevas** (Airbnb, Despegar). Alta prioridad, pero requiere
   crear cuentas — necesita tu ok y tus credenciales.
3. **Cualquier acción con `a-connect@vicinamarisbeachlodge.com`.** No la toqué.
4. **Channel manager.** Cuando haya 3+ canales activos deja de ser opcional: con
   9 habitaciones, dos reservas para la última es cuestión de tiempo. Es gasto
   recurrente — conviene decidirlo *antes* de abrir el tercer canal.

---

## Si mañana solo se puede hacer una cosa

**Pedirle reseña a todos los huéspedes que se fueron contentos este mes.**

Es gratis, toma una tarde, y es lo único que destraba todo lo demás. Mientras la
calificación siga en 6.0, cada dólar y cada hora que se pongan en los otros
canales rinden menos de lo que podrían.
