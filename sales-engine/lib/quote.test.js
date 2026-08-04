/**
 * node --test sales-engine/lib/
 *
 * Foco de estas pruebas: los casos donde equivocarse cuesta plata de verdad.
 * No busca cobertura de líneas, busca los bordes que rompen una cotización
 * frente a un huésped.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  quote,
  nightsBetween,
  inSeasonRange,
  scarcityMultiplier,
  parseCivilDate,
  formatQuoteMessage,
} from './quote.js';

const here = dirname(fileURLToPath(import.meta.url));
const load = (f) => JSON.parse(readFileSync(join(here, '..', 'config', f), 'utf8'));
const rules = load('pricing-rules.json');
const property = load('property.json');

/** Cotización con contexto neutro, para aislar la variable bajo prueba. */
const q = (over = {}) =>
  quote({ checkIn: '2026-09-14', checkOut: '2026-09-15', today: '2026-08-04', ...over }, rules, property);

describe('fechas', () => {
  test('cuenta noches, no días', () => {
    assert.equal(nightsBetween('2026-09-14', '2026-09-15'), 1);
    assert.equal(nightsBetween('2026-09-14', '2026-09-21'), 7);
  });

  test('rechaza estadías de cero o negativas', () => {
    assert.throws(() => nightsBetween('2026-09-14', '2026-09-14'), /al menos una noche/);
    assert.throws(() => nightsBetween('2026-09-15', '2026-09-14'), /al menos una noche/);
  });

  test('rechaza fechas que no existen en el calendario', () => {
    assert.throws(() => parseCivilDate('2026-02-30'), /inexistente/);
    assert.throws(() => parseCivilDate('14/09/2026'), /inválida/);
  });

  test('parsea como fecha civil, no como UTC', () => {
    // La regresión que esto protege: new Date('2026-11-05') en UTC−5 cae el día 4,
    // y el motor cobraría tarifa normal el Día de Colón.
    const d = parseCivilDate('2026-11-05');
    assert.equal(d.getDate(), 5);
    assert.equal(d.getMonth(), 10);
  });
});

describe('temporadas', () => {
  test('rango normal dentro del mismo año', () => {
    assert.equal(inSeasonRange(parseCivilDate('2026-10-01'), '09-01', '11-15'), true);
    assert.equal(inSeasonRange(parseCivilDate('2026-08-31'), '09-01', '11-15'), false);
  });

  test('rango que cruza el año nuevo', () => {
    // Temporada seca: 12-15 → 04-15. El bug clásico es que diciembre quede afuera.
    assert.equal(inSeasonRange(parseCivilDate('2026-12-20'), '12-15', '04-15'), true);
    assert.equal(inSeasonRange(parseCivilDate('2027-02-10'), '12-15', '04-15'), true);
    assert.equal(inSeasonRange(parseCivilDate('2027-06-01'), '12-15', '04-15'), false);
  });
});

describe('escasez', () => {
  test('sube el precio a medida que baja el inventario', () => {
    assert.equal(scarcityMultiplier(9, rules.scarcity), 1.0);
    assert.equal(scarcityMultiplier(4, rules.scarcity), 1.08);
    assert.equal(scarcityMultiplier(2, rules.scarcity), 1.2);
    assert.equal(scarcityMultiplier(1, rules.scarcity), 1.35);
  });

  test('la última habitación cuesta más que con el hotel vacío', () => {
    const lleno = q({ roomsLeft: 9 }).total;
    const ultima = q({ roomsLeft: 1 }).total;
    assert.ok(ultima > lleno, `última ($${ultima}) debería superar a vacío ($${lleno})`);
  });
});

describe('piso de tarifa', () => {
  test('nunca cotiza por debajo de $69 la noche', () => {
    // Peor combinación posible: temporada baja × martes × last-minute con inventario libre.
    const r = q({ checkIn: '2026-09-15', checkOut: '2026-09-16', today: '2026-09-14', roomsLeft: 9 });
    assert.ok(r.nightly[0].roomRate >= 69, `cotizó $${r.nightly[0].roomRate}`);
    assert.equal(r.nightly[0].floored, true);
  });

  test('el descuento por estadía larga no rompe el piso de habitación', () => {
    const r = q({ checkIn: '2026-09-14', checkOut: '2026-09-21', roomsLeft: 9 });
    for (const n of r.nightly) assert.ok(n.roomRate >= 69);
  });
});

describe('ocupación', () => {
  test('2 personas no pagan extra', () => {
    assert.equal(q({ adults: 2 }).extraAdultTotal, 0);
  });

  test('adulto extra: +$20 por noche, por persona', () => {
    const r = q({ checkIn: '2026-09-14', checkOut: '2026-09-16', adults: 4 });
    assert.equal(r.extraAdults, 2);
    assert.equal(r.extraAdultTotal, 80); // 2 adultos × $20 × 2 noches
  });

  test('menores de 11 son gratis pero ocupan cupo', () => {
    const conNinos = q({ adults: 2, children: 2 });
    const sinNinos = q({ adults: 2, children: 0 });
    assert.equal(conNinos.total, sinNinos.total);
    assert.equal(conNinos.extraAdultTotal, 0);
  });

  test('rechaza más de 4 personas en vez de sobrevender', () => {
    assert.throws(() => q({ adults: 4, children: 1 }), /Máximo 4 personas/);
    assert.throws(() => q({ adults: 5 }), /Máximo 4 personas/);
  });
});

describe('mascota', () => {
  test('se cobra por estadía, no por noche', () => {
    const unaNoche = q({ checkIn: '2026-09-14', checkOut: '2026-09-15', pet: true });
    const cincoNoches = q({ checkIn: '2026-09-14', checkOut: '2026-09-19', pet: true });
    assert.equal(unaNoche.petTotal, 15);
    assert.equal(cincoNoches.petTotal, 15);
  });
});

describe('feriados', () => {
  test('el Día de Colón cobra más que un día normal', () => {
    const colon = q({ checkIn: '2026-11-05', checkOut: '2026-11-06', roomsLeft: 9 }).nightly[0];
    const normal = q({ checkIn: '2026-11-17', checkOut: '2026-11-18', roomsLeft: 9 }).nightly[0];
    assert.equal(colon.holiday, 'Día de Colón');
    assert.ok(colon.roomRate > normal.roomRate);
  });

  test('avisa cuando la estadía no llega al mínimo de noches del feriado', () => {
    const r = q({ checkIn: '2026-12-25', checkOut: '2026-12-26' });
    assert.ok(r.warnings.some((w) => /mínimo de 2 noches/.test(w)));
  });

  test('Carnaval 2027 está cargado y se cobra', () => {
    const r = q({ checkIn: '2027-02-08', checkOut: '2027-02-09', today: '2027-01-05' });
    assert.match(r.nightly[0].holiday, /Carnaval/);
  });
});

describe('anticipación', () => {
  test('last-minute descuenta solo si sobra inventario', () => {
    const conInventario = q({ checkIn: '2026-09-16', checkOut: '2026-09-17', today: '2026-09-14', roomsLeft: 9 });
    assert.ok('last-minute' in conInventario.nightly[0].multipliers);

    const sinInventario = q({ checkIn: '2026-09-16', checkOut: '2026-09-17', today: '2026-09-14', roomsLeft: 2 });
    assert.ok(!('last-minute' in sinInventario.nightly[0].multipliers));
  });

  test('reserva anticipada premia comprar con mucha antelación', () => {
    const r = q({ checkIn: '2026-12-01', checkOut: '2026-12-02', today: '2026-08-04', roomsLeft: 9 });
    assert.ok('reserva-anticipada' in r.nightly[0].multipliers);
  });
});

describe('estadía larga', () => {
  test('7 noches salen más baratas por noche que 1', () => {
    const una = q({ checkIn: '2026-09-14', checkOut: '2026-09-15', roomsLeft: 9 });
    const siete = q({ checkIn: '2026-09-14', checkOut: '2026-09-21', roomsLeft: 9 });
    assert.ok(siete.averageNightly < una.averageNightly);
    assert.ok(siete.lengthOfStayDiscount > 0);
  });

  test('2 noches no gatillan descuento', () => {
    assert.equal(q({ checkIn: '2026-09-14', checkOut: '2026-09-16' }).lengthOfStayDiscount, 0);
  });

  test('avisa cuando el descuento hunde la noche efectiva bajo el piso', () => {
    const r = q({ checkIn: '2027-07-10', checkOut: '2027-07-17', roomsLeft: 6 });
    assert.ok(
      r.warnings.some((w) => /por debajo del piso/.test(w)),
      'una estadía de 7 noches con descuento del 15% debería avisar la excepción al piso',
    );
  });
});

describe('fin de semana', () => {
  test('sábado cuesta más que miércoles', () => {
    const sab = q({ checkIn: '2026-09-19', checkOut: '2026-09-20', roomsLeft: 9 }).nightly[0];
    const mie = q({ checkIn: '2026-09-16', checkOut: '2026-09-17', roomsLeft: 9 }).nightly[0];
    assert.ok(sab.roomRate >= mie.roomRate);
  });
});

describe('mensaje al huésped', () => {
  test('muestra total e incluidos, sin desglose noche por noche', () => {
    const r = q({ checkIn: '2026-09-14', checkOut: '2026-09-16' });
    const msg = formatQuoteMessage(r, property, { guestName: 'Ana' });
    assert.match(msg, /Ana/);
    assert.match(msg, /Desayuno/);
    assert.match(msg, new RegExp(r.total.toFixed(2).replace('.', '\\.')));
    assert.match(msg, /¿Te la aparto\?/);
  });

  test('la urgencia solo aparece si la escasez es real', () => {
    const r = q({ roomsLeft: 9 });
    assert.ok(!/última habitación/.test(formatQuoteMessage(r, property, { roomsLeft: 9 })));
    assert.match(formatQuoteMessage(r, property, { roomsLeft: 1 }), /última habitación/);
  });
});

describe('coherencia del total', () => {
  test('total = habitación + extras − descuento', () => {
    const r = q({ checkIn: '2026-09-14', checkOut: '2026-09-18', adults: 3, pet: true });
    const esperado = r.roomTotal + r.extraAdultTotal + r.petTotal - r.lengthOfStayDiscount;
    assert.ok(Math.abs(r.total - esperado) < 0.01);
  });
});
