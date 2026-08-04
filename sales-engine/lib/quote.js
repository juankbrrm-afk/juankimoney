/**
 * Motor de cotización de Vicina Maris Beach Lodge.
 *
 * ESM sin dependencias, a propósito: el mismo archivo corre en `node --test`
 * y se pega tal cual dentro de un nodo Code de n8n. Un solo cálculo de precio
 * para todos los canales — si WhatsApp y la web cotizan distinto, el huésped
 * lo nota y se cae la venta.
 *
 * Orden de cálculo (el orden importa y no es intercambiable):
 *   1. base × temporada × día de semana × feriado × escasez × anticipación
 *   2. piso por noche  ← se fuerza ANTES de sumar personas extra
 *   3. + adultos extra + mascota
 *   4. − descuento por estadía larga
 *
 * El piso se aplica en el paso 2 y no al final: es un piso de *tarifa de
 * habitación*, no de valor de la factura. Si se aplicara al final, una
 * estadía de 7 noches con 4 personas podría hundir la tarifa de habitación
 * muy por debajo de $69 y quedar tapada por los cargos de personas extra.
 */

/** @typedef {{ roomRate: number, date: string, weekday: number, multipliers: Record<string, number>, holiday: string|null, floored: boolean }} NightBreakdown */

/**
 * Parsea 'YYYY-MM-DD' como fecha civil, sin zona horaria.
 *
 * `new Date('2026-11-05')` se interpreta como UTC medianoche, que en Panamá
 * (UTC−5) es el 4 de noviembre a las 7 PM — o sea, el motor cobraría tarifa
 * normal el Día de Colón, el día más caro del calendario. Por eso construimos
 * la fecha por componentes y trabajamos siempre en hora local.
 *
 * @param {string} iso
 * @returns {Date}
 */
export function parseCivilDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`Fecha inválida: ${iso} (se espera YYYY-MM-DD)`);
  const [, y, mo, d] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  if (
    date.getFullYear() !== Number(y) ||
    date.getMonth() !== Number(mo) - 1 ||
    date.getDate() !== Number(d)
  ) {
    throw new Error(`Fecha inexistente en el calendario: ${iso}`);
  }
  return date;
}

/** @param {Date} d @returns {string} */
export function toISODate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Noches entre check-in y check-out.
 * @param {string} checkIn @param {string} checkOut @returns {number}
 */
export function nightsBetween(checkIn, checkOut) {
  const a = parseCivilDate(checkIn);
  const b = parseCivilDate(checkOut);
  const ms = b.getTime() - a.getTime();
  const nights = Math.round(ms / 86400000);
  if (nights < 1) {
    throw new Error('El check-out tiene que ser al menos una noche después del check-in.');
  }
  return nights;
}

/**
 * ¿Cae `date` dentro de un rango estacional 'MM-DD'..'MM-DD'?
 * Soporta rangos que cruzan el año nuevo (ej. 12-15 → 04-15).
 *
 * @param {Date} date @param {string} from @param {string} to @returns {boolean}
 */
export function inSeasonRange(date, from, to) {
  const p = (n) => String(n).padStart(2, '0');
  const md = `${p(date.getMonth() + 1)}-${p(date.getDate())}`;
  return from <= to ? md >= from && md <= to : md >= from || md <= to;
}

/**
 * Multiplicador de escasez según habitaciones libres.
 * @param {number} roomsLeft @param {{tiers: {maxRoomsLeft:number, multiplier:number}[]}} scarcity
 */
export function scarcityMultiplier(roomsLeft, scarcity) {
  const tiers = [...scarcity.tiers].sort((a, b) => a.maxRoomsLeft - b.maxRoomsLeft);
  for (const t of tiers) {
    if (roomsLeft <= t.maxRoomsLeft) return t.multiplier;
  }
  return 1.0;
}

/** Redondeo monetario a 2 decimales, sin errores de coma flotante acumulados. */
const money = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Cotiza una estadía completa.
 *
 * @param {object} req
 * @param {string} req.checkIn                 'YYYY-MM-DD'
 * @param {string} req.checkOut                'YYYY-MM-DD'
 * @param {number} [req.adults=2]              huéspedes de 11 años o más
 * @param {number} [req.children=0]            menores de 11 — gratis, pero ocupan cupo
 * @param {boolean} [req.pet=false]
 * @param {number} [req.roomsLeft=9]           disponibilidad real para esas fechas
 * @param {string} [req.today]                 'YYYY-MM-DD', para anticipación (default: hoy)
 * @param {object} rules                       pricing-rules.json
 * @param {object} property                    property.json
 * @returns {{
 *   nights: number, nightly: NightBreakdown[], roomTotal: number,
 *   extraAdults: number, extraAdultTotal: number, petTotal: number,
 *   lengthOfStayDiscount: number, total: number, averageNightly: number,
 *   currency: string, warnings: string[]
 * }}
 */
export function quote(req, rules, property) {
  const {
    checkIn,
    checkOut,
    adults = 2,
    children = 0,
    pet = false,
    roomsLeft = property.inventory.totalRooms,
    today,
  } = req;

  const warnings = [];
  const nights = nightsBetween(checkIn, checkOut);
  const maxGuests = property.rates.maxGuests;

  if (adults < 1) throw new Error('Se necesita al menos un adulto.');
  if (adults + children > maxGuests) {
    throw new Error(
      `Máximo ${maxGuests} personas por habitación (pediste ${adults + children}). ` +
        `Para grupos más grandes se venden 2 habitaciones — no se sobrevende una.`,
    );
  }
  if (roomsLeft < 1) throw new Error('Sin disponibilidad para esas fechas.');

  const todayDate = today ? parseCivilDate(today) : parseCivilDate(toISODate(new Date()));
  const leadDays = Math.round(
    (parseCivilDate(checkIn).getTime() - todayDate.getTime()) / 86400000,
  );
  if (leadDays < 0) warnings.push('El check-in está en el pasado — verificá la fecha.');

  // Índice de feriados por fecha.
  const holidayByDate = new Map(rules.holidays.dates.map((h) => [h.date, h]));

  /** @type {NightBreakdown[]} */
  const nightly = [];
  const cursor = parseCivilDate(checkIn);

  for (let i = 0; i < nights; i++) {
    const iso = toISODate(cursor);
    const weekday = cursor.getDay();
    /** @type {Record<string, number>} */
    const multipliers = {};

    const season = rules.seasons.find((s) => inSeasonRange(cursor, s.from, s.to));
    if (season) multipliers[`temporada:${season.code}`] = season.multiplier;

    multipliers[`dia:${weekday}`] = rules.dayOfWeek[String(weekday)] ?? 1.0;

    const holiday = holidayByDate.get(iso) ?? null;
    if (holiday) {
      multipliers[`feriado:${holiday.name}`] = holiday.multiplier ?? rules.holidays.multiplier;
    }

    const scarcity = scarcityMultiplier(roomsLeft, rules.scarcity);
    if (scarcity !== 1.0) multipliers['escasez'] = scarcity;

    // Anticipación. El last-minute solo descuenta si de verdad sobra inventario;
    // si queda poco, la escasez ya subió el precio y descontar sería regalarlo.
    const { lastMinute, earlyBird } = rules.leadTime;
    if (
      leadDays >= 0 &&
      leadDays <= lastMinute.withinDays &&
      roomsLeft >= lastMinute.onlyIfRoomsLeftAtLeast
    ) {
      multipliers['last-minute'] = lastMinute.multiplier;
    } else if (leadDays > earlyBird.beyondDays) {
      multipliers['reserva-anticipada'] = earlyBird.multiplier;
    }

    let rate = rules.baseRate;
    for (const m of Object.values(multipliers)) rate *= m;

    const floorPrice = rules.floor.perNight;
    const floored = rate < floorPrice;
    if (floored) rate = floorPrice;

    nightly.push({
      roomRate: money(rate),
      date: iso,
      weekday,
      multipliers,
      holiday: holiday ? holiday.name : null,
      floored,
    });

    cursor.setDate(cursor.getDate() + 1);
  }

  // Mínimo de noches en feriado: se avisa, no se bloquea en silencio.
  const holidayNights = nightly.filter((n) => n.holiday);
  if (holidayNights.length > 0 && nights < rules.holidays.minimumNights) {
    warnings.push(
      `Fecha de feriado (${holidayNights[0].holiday}) con mínimo de ` +
        `${rules.holidays.minimumNights} noches — la estadía pedida es de ${nights}.`,
    );
  }

  const roomTotal = money(nightly.reduce((sum, n) => sum + n.roomRate, 0));

  const extraAdults = Math.max(0, adults - property.rates.includedGuests);
  const extraAdultTotal = money(extraAdults * property.rates.extraAdult * nights);
  const petTotal = pet ? property.rates.petPerStay : 0; // por estadía, no por noche

  const subtotal = roomTotal + extraAdultTotal + petTotal;

  const losTier = [...rules.lengthOfStay.tiers]
    .sort((a, b) => b.minNights - a.minNights)
    .find((t) => nights >= t.minNights);
  const lengthOfStayDiscount = losTier ? money(subtotal * losTier.discount) : 0;

  const total = money(subtotal - lengthOfStayDiscount);

  // El piso protege la tarifa por noche, pero el descuento por estadía larga
  // se aplica sobre el total y puede hundir el promedio efectivo por debajo
  // del piso. No lo bloqueamos — 7 noches vendidas es buen negocio aunque el
  // promedio baje — pero se avisa para que sea una decisión y no una fuga.
  const effectiveNightly = money((total - extraAdultTotal - petTotal) / nights);
  if (lengthOfStayDiscount > 0 && effectiveNightly < rules.floor.perNight) {
    warnings.push(
      `El descuento por estadía deja la noche efectiva en $${effectiveNightly.toFixed(2)}, ` +
        `por debajo del piso de $${rules.floor.perNight.toFixed(2)}. ` +
        `Es rentable por volumen de noches, pero es una excepción al piso — aprobala a conciencia.`,
    );
  }

  return {
    nights,
    nightly,
    roomTotal,
    extraAdults,
    extraAdultTotal,
    petTotal,
    lengthOfStayDiscount,
    total,
    averageNightly: money(total / nights),
    currency: property.identity.currency,
    warnings,
  };
}

/**
 * Convierte una cotización en el mensaje que de verdad se manda al huésped.
 *
 * La regla de venta que codifica: se muestra el TOTAL de la estadía y lo que
 * ya viene incluido, no un desglose noche por noche. El desglose invita a
 * comparar noche contra noche con la competencia; el total con incluidos
 * invita a comparar valor, que es donde esta propiedad gana (desayuno,
 * kayaks, snorkel y estacionamiento ya adentro).
 *
 * La urgencia solo se agrega si `roomsLeft` es real. Escasez inventada es la
 * clase de promesa que termina en review negativa.
 *
 * @param {ReturnType<typeof quote>} q
 * @param {object} property
 * @param {{ roomsLeft?: number, guestName?: string }} [ctx]
 * @returns {string}
 */
export function formatQuoteMessage(q, property, ctx = {}) {
  const { roomsLeft, guestName } = ctx;
  const saludo = guestName ? `Hola ${guestName}! ` : '¡Hola! ';
  const noches = q.nights === 1 ? '1 noche' : `${q.nights} noches`;

  const lines = [
    `${saludo}Te confirmo disponibilidad en Vicina Maris, frente a la playa en ${property.location.beach}.`,
    '',
    `📅 ${noches} · ${q.currency} $${q.total.toFixed(2)} en total`,
    `   (promedio $${q.averageNightly.toFixed(2)} por noche)`,
    '',
    'Ya viene incluido, sin costo extra:',
    ...property.includedInBaseRate.map((i) => `  ✓ ${i}`),
  ];

  if (q.lengthOfStayDiscount > 0) {
    lines.push('', `Te apliqué $${q.lengthOfStayDiscount.toFixed(2)} de descuento por la estadía.`);
  }

  if (typeof roomsLeft === 'number' && roomsLeft <= 3) {
    lines.push(
      '',
      roomsLeft === 1
        ? '⚠️ Es la última habitación que queda para esas fechas.'
        : `⚠️ Quedan ${roomsLeft} habitaciones para esas fechas.`,
    );
  }

  lines.push('', '¿Te la aparto? Con el nombre completo te la reservo ahora mismo.');
  return lines.join('\n');
}
