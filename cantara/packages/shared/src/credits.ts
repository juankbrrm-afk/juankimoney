/**
 * Economía de créditos.
 *
 * Regla de oro: el saldo NO es un número mutable. Es la suma de un libro
 * mayor de solo-inserción (`CreditLedger`). Cobrar es insertar un asiento
 * negativo; reembolsar es insertar uno positivo. Nunca se resta de un
 * contador, así que no hay carrera posible entre dos generaciones
 * simultáneas ni forma de perder la trazabilidad de un cargo.
 *
 * Los precios están calibrados sobre el coste real de proveedor documentado
 * en `docs/01-ai-research.md`, con margen suficiente para absorber
 * reintentos.
 */

export const CREDIT_REASONS = [
  'signup_bonus',
  'purchase',
  'song_generation',
  'voice_training',
  'refund',
  'promotional',
  'admin_adjustment',
] as const;
export type CreditReason = (typeof CREDIT_REASONS)[number];

export const CREDIT_REASON_LABELS: Readonly<Record<CreditReason, string>> = {
  signup_bonus: 'Créditos de bienvenida',
  purchase: 'Compra de créditos',
  song_generation: 'Generación de canción',
  voice_training: 'Entrenamiento de voz',
  refund: 'Reembolso',
  promotional: 'Promoción',
  admin_adjustment: 'Ajuste manual',
};

/** Coste en créditos de cada operación facturable. */
export const CREDIT_COSTS = {
  /** Canción completa hasta 4 minutos, con conversión a la voz del usuario. */
  songGeneration: 30,
  /** Entrenamiento completo de un modelo RVC. Pago único por modelo. */
  voiceTraining: 100,
  /** Voz instantánea zero-shot (seed-vc): sin entrenamiento, calidad algo menor. */
  instantVoice: 20,
  /** Regenerar reusando letra y modelo ya existentes: se ahorra la fase de letra. */
  regeneration: 25,
  /** Solo letra, sin música. */
  lyricsOnly: 3,
} as const;

export type BillableOperation = keyof typeof CREDIT_COSTS;

/**
 * Créditos de bienvenida.
 *
 * La cifra sale de una cuenta concreta, no de un número redondo: el plan
 * gratuito debe cubrir el recorrido completo de la primera sesión, y ese
 * recorrido incluye **volver a intentarlo**.
 *
 *   entrenamiento (100) + canción (30) + regeneración (25) = 155
 *
 * Se dejan 180 para dar margen a una segunda regeneración parcial. Quedarse
 * en 150 dejaba al usuario con 20 créditos justo después de oír su primera
 * canción — sin poder pedir otra toma, que es exactamente lo que uno quiere
 * hacer en ese momento.
 */
export const SIGNUP_CREDITS =
  CREDIT_COSTS.voiceTraining + CREDIT_COSTS.songGeneration + CREDIT_COSTS.regeneration + 25;

export interface CreditPack {
  readonly id: string;
  readonly name: string;
  readonly credits: number;
  /** Precio en céntimos de euro. */
  readonly priceCents: number;
  readonly highlight?: boolean;
  readonly description: string;
}

export const CREDIT_PACKS: readonly CreditPack[] = [
  {
    id: 'starter',
    name: 'Starter',
    credits: 300,
    priceCents: 900,
    description: '10 canciones. Para probar de verdad.',
  },
  {
    id: 'creator',
    name: 'Creator',
    credits: 1000,
    priceCents: 2400,
    highlight: true,
    description: '33 canciones. El mejor precio por crédito.',
  },
  {
    id: 'studio',
    name: 'Studio',
    credits: 3000,
    priceCents: 5900,
    description: '100 canciones. Para publicar en serio.',
  },
];

export function pricePerCredit(pack: CreditPack): number {
  return pack.priceCents / pack.credits;
}

export function formatPrice(cents: number, locale = 'es-ES'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

/**
 * Coste de generar una canción según los parámetros elegidos.
 *
 * Regenerar sale más barato porque no se vuelve a pagar la letra, y las
 * canciones largas cuestan proporcionalmente más porque el motor musical
 * factura por duración.
 */
export function songCost(options: {
  isRegeneration?: boolean;
  durationSeconds?: number;
}): number {
  const base = options.isRegeneration ? CREDIT_COSTS.regeneration : CREDIT_COSTS.songGeneration;
  const duration = options.durationSeconds ?? 180;
  // Hasta 3 minutos va incluido; a partir de ahí, 5 créditos por minuto extra.
  const extraMinutes = Math.max(0, Math.ceil((duration - 180) / 60));
  return base + extraMinutes * 5;
}

export function hasEnoughCredits(balance: number, cost: number): boolean {
  return balance >= cost;
}
