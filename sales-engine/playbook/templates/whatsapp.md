# Plantillas de WhatsApp

Variables entre llaves: `{nombre}`, `{total}`, `{noches}`, `{fechas}`, `{habitaciones_libres}`.
El Flujo A las rellena con datos reales del motor de cotización.

**Regla que atraviesa todas:** ningún dato que no esté en `config/property.json`.
Si una plantilla promete algo que el hotel no puede cumplir, genera cancelación
y reseña negativa — y con 2 reseñas de base, eso cuesta más que la venta.

---

## WA-01 · Primera respuesta con disponibilidad

> ¡Hola {nombre}! 🌊 Sí, tengo disponibilidad para {fechas}.
>
> 📅 {noches} · **${total} en total**
>
> Ya viene incluido, sin costo extra:
> ✓ Desayuno para los dos
> ✓ Estacionamiento
> ✓ Kayaks y equipo de snorkel
> ✓ Agua y kiosco
> ✓ 20% de descuento en Mamaniva
>
> Estamos justo frente a la playa en La Angosta, a 15 min de Portobelo.
>
> ¿Te la aparto? Con tu nombre completo te la reservo ahora mismo.

Cierre con **una** pregunta. Sin desglose por noche.

---

## WA-02 · Sin disponibilidad — nunca terminar en "no"

> ¡Hola {nombre}! Para {fechas} ya estoy lleno 😞
>
> Pero te tengo dos opciones cerca:
> · {fecha_alt_1} — ${total_alt_1}
> · {fecha_alt_2} — ${total_alt_2}
>
> Son las mismas habitaciones frente al mar. ¿Alguna te sirve?

Un "no hay" sin alternativa es una venta regalada al competidor.

---

## WA-03 · Consulta vaga ("¿precios?", "info")

> ¡Hola! 🌊 Te cuento: estamos frente a la playa en La Angosta, a 15 min de
> Portobelo. Habitaciones para hasta 4 personas, desde $69 la noche con desayuno,
> estacionamiento, kayaks y snorkel incluidos.
>
> ¿Para qué fechas estabas viendo? Así te paso el precio exacto y te confirmo
> disponibilidad.

Devolver siempre con pregunta de fecha: sin fecha no hay cotización ni cierre.

---

## WA-04 · Grupo de más de 4

> ¡Hola {nombre}! Cada habitación es para máximo 4 personas, así que para
> {cantidad} te armo {habitaciones} habitaciones.
>
> 📅 {noches} · **${total} en total** por las {habitaciones}
>
> Quedan una al lado de la otra, con desayuno incluido para todos.
>
> ¿Te las aparto?

No sobrevender una habitación. El cupo es 4 y se respeta.

---

## WA-FU-24 · Seguimiento a las 24 h

> ¡Hola {nombre}! Te escribo por las fechas de {fechas} 🌊
>
> Todavía te la puedo sostener a ${total}, pero para ese finde me quedan
> {habitaciones_libres}. ¿La dejamos apartada?

Corto y sin descuento. Todavía no toca ceder precio.

---

## WA-FU-72 · Seguimiento a las 72 h — ángulo nuevo

> {nombre}, se me liberó {fecha_alt} y está más tranquilo que el fin de semana
> — misma habitación, ${total_alt} en total.
>
> Si te sirve mejor esa fecha, te la aparto.

Trae información nueva. "¿Pudiste ver?" no aporta nada y se ignora.

---

## WA-FU-7D · Último contacto

> {nombre}, última que te escribo por esto 🙌
>
> Si te decidís esta semana, te dejo {noches} a ${total} y te sumo el
> late check-out sin cargo — así el último día aprovechás la playa completa.
>
> Cualquier cosa quedo por acá.

Acá sí se cede, y en valor (late check-out, costo casi cero) antes que en tarifa.
**Después de esta, no se insiste más.** Insistir hace que te reporten, y una
cuenta bloqueada es cero ventas por este canal.

---

## WA-LM · Last-minute (fecha cerca + habitaciones libres)

> ¡Hola {nombre}! Me quedaron habitaciones para {fechas} 🌊
>
> Por ser sobre la fecha: **${total}** por {noches}, con desayuno, kayaks y
> snorkel incluidos.
>
> Es para las próximas {dias} — si te animás te la aparto ya.

Solo se manda si el motor aplicó `last-minute` (o sea: hay 4+ habitaciones
libres). Con poco inventario el precio sube, no baja.

---

## WA-CONF · Confirmación de reserva

> ¡Listo {nombre}, reserva confirmada! 🎉
>
> 📍 Vicina Maris Beach Lodge — Playa La Angosta, María Chiquita
> 📅 {fechas} · {noches}
> 👥 {huespedes} · 💵 ${total}
>
> Check-in 3:00 PM · Check-out 1:00 PM
>
> Incluye desayuno, estacionamiento, agua, kayaks y snorkel.
> Te llega el link de ubicación un día antes.
>
> ¿Querés que te reserve también la cena en Mamaniva? Con tu 20% de descuento
> sale muy bien.

Confirmar primero, upsell al final. Nunca al revés.

---

## WA-UP3 · Upsell 3 días antes

> ¡{nombre}, ya casi! 🌊 Nos vemos el {fecha_checkin}.
>
> Dos cosas que suelo ofrecer y a la gente le sirven:
> · **Late check-out hasta las 4 PM** — $25, no corrés el último día
> · **Early check-in desde las 11 AM** — $25, llegás y ya estás en la playa
>
> ¿Te sumo alguna? (Sujeto a disponibilidad ese día.)

El "sujeto a disponibilidad" va sí o sí: es una condición real.

---

## WA-REV · Pedido de reseña (post check-out)

> ¡{nombre}, gracias por venir! 🌊 Ojalá hayan descansado.
>
> Te pido un favor chico: somos un lodge familiar y las reseñas nos ayudan
> muchísimo a que otra gente nos encuentre. ¿Nos dejarías una?
>
> 👉 {link_reseña}
>
> Te toma un minuto y para nosotros vale un montón. ¡Gracias!

**La plantilla más importante del set hoy.** Con 2 reseñas, cada una nueva mueve
el promedio de forma que ninguna promoción puede igualar. Ver `audit-2026-08.md`,
Hallazgo #1.

Mandar solo a quien se fue contento. Si hubo un problema, primero se resuelve —
pedirle reseña a alguien molesto es pedirle que documente la queja.

---

## WA-WIN · Reactivación a los 60-90 días

> ¡Hola {nombre}! ¿Cómo va todo? 🌊
>
> Te escribo porque se viene {temporada_o_feriado} y me acordé de tu estadía.
> Para huéspedes que vuelven te reservo directo, sin pasar por la app.
>
> ¿Te tiro fechas y precios?

Este es el mensaje de mayor margen del set: 0% de comisión sobre alguien que
ya sabe que el lugar le gusta.
