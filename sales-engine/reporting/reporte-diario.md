# Reporte diario de ventas

Formato pedido en el brief, §3. **No lleva ocupación ni RevPAR** salvo pedido
explícito.

Se llena todos los días. Cinco minutos.

---

## Plantilla

```
REPORTE DE VENTAS — {fecha}

1. RESERVAS CERRADAS HOY:        {número}
2. DE DÓNDE VINIERON:
     WhatsApp / directo ........  {n}
     Booking ...................  {n}
     Airbnb ....................  {n}
     Otras OTAs ................  {n}
3. VENDIDO HOY (total):          ${monto}
     Habitaciones ..............  ${monto}
     Upsells ...................  ${monto}
4. QUÉ FUNCIONÓ MEJOR:
     {canal / mensaje / oferta, en una línea}
5. QUÉ PRUEBO MAÑANA:
     {una acción concreta}

— Consultas recibidas: {n}   Cotizadas: {n}   Cerradas: {n}
— Seguimientos enviados: {n}
— Reseñas nuevas: {n}        Calificación actual: {x.x}
```

---

## Por qué estas líneas y no otras

**Reservas cerradas, en número.** El brief lo pide así y tiene razón: un
porcentaje de ocupación esconde si el mes fue bueno o malo. Un número no.

**Canal de origen.** Sin esto no se sabe dónde invertir el próximo esfuerzo. Es
además el único dato que dice cuánta comisión se está pagando: 3 reservas por
Booking a $200 dejan $498 y pagan $102 de comisión; las mismas 3 por WhatsApp
dejan $600.

**Upsells separado de habitaciones.** El upsell es margen casi puro. Si la línea
está siempre en $0, hay una conversación que no se está teniendo.

**Consultas → cotizadas → cerradas.** El embudo en tres números. Dice dónde se
rompe: si entran 10 consultas y se cotizan 3, el problema es el tiempo de
respuesta. Si se cotizan 10 y cierra 1, el problema es el precio o el mensaje.

**Reseñas y calificación.** Está en el reporte diario a propósito, aunque se
mueva de a poco. Hoy es la métrica que más limita las ventas: con 6.0/10 sobre
2 reseñas, la ficha queda fuera del filtro "8.0+" que usa la mayoría de los
viajeros en Booking — hay demanda que ni siquiera ve el listado. Tenerlo a la
vista todos los días es lo que hace que se pidan reseñas todos los días.

---

## Ejemplo lleno

```
REPORTE DE VENTAS — 12 de agosto de 2026

1. RESERVAS CERRADAS HOY:        3
2. DE DÓNDE VINIERON:
     WhatsApp / directo ........  2
     Booking ...................  1
     Airbnb ....................  0
     Otras OTAs ................  0
3. VENDIDO HOY (total):          $612.00
     Habitaciones ..............  $587.00
     Upsells ...................  $25.00   (1 late check-out)
4. QUÉ FUNCIONÓ MEJOR:
     El mensaje de last-minute para el finde 15-16 ago. Se mandó a 6 leads
     fríos, contestaron 3, cerraron 2. El gancho fue el total, no el por-noche.
5. QUÉ PRUEBO MAÑANA:
     Pedir reseña por WhatsApp a los 4 huéspedes que salieron esta semana.
     Con 2 reseñas de base, 4 buenas mueven la calificación más que cualquier promo.

— Consultas recibidas: 9    Cotizadas: 7    Cerradas: 3
— Seguimientos enviados: 6
— Reseñas nuevas: 0         Calificación actual: 6.0
```

---

## Estado actual: en cero, y por qué

**Hoy no se puede llenar este reporte con datos reales.** No hay ninguna reserva
que reportar desde acá, y no es que las ventas estén en cero — es que este
entorno no tiene forma de verlas:

- Sin acceso a la extranet de Booking, no hay reservas ni ingresos.
- Sin WhatsApp Business API conectada, no hay consultas ni leads.
- Sin PMS ni hoja de reservas, no hay ocupación ni disponibilidad.

Poner números inventados en un reporte de ventas es peor que no tenerlo:
se toman decisiones de precio y de canal sobre datos falsos.

**Qué se necesita para que este reporte empiece a llenarse solo**, en orden de
esfuerzo:

1. **La hoja `leads`** (Flujo A) — da consultas, cotizaciones y seguimientos.
   Es lo único que no necesita credenciales de terceros.
2. **Una hoja de reservas**, aunque se llene a mano — da reservas, ingresos y
   canal. Con esto ya se llena el reporte completo.
3. **Extranet de Booking (solo lectura)** — automatiza el canal OTA.

Con los pasos 1 y 2, el reporte se genera solo desde n8n y llega por Telegram
cada mañana. El paso 3 lo completa.
