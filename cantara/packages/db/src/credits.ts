import type { CreditReason } from '@cantara/shared';
import { prisma } from './client.js';
import type { Prisma, PrismaClient } from './generated/index.js';

export class InsufficientCreditsError extends Error {
  constructor(
    readonly required: number,
    readonly available: number,
  ) {
    super(`Se necesitan ${required} créditos y solo hay ${available}`);
    this.name = 'InsufficientCreditsError';
  }
}

type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * Saldo actual = suma del libro mayor.
 *
 * No hay campo `credits` en `User` a propósito. Un contador mutable se
 * desincroniza del historial en cuanto algo falla a medias; una suma no
 * puede mentir.
 */
export async function getBalance(userId: string, tx: Tx = prisma): Promise<number> {
  const result = await tx.creditLedger.aggregate({
    where: { userId },
    _sum: { amount: true },
  });
  return result._sum.amount ?? 0;
}

export interface LedgerEntryInput {
  userId: string;
  amount: number;
  reason: CreditReason;
  description?: string;
  referenceId?: string;
  referenceType?: string;
  idempotencyKey?: string;
}

/**
 * Cobra créditos de forma atómica.
 *
 * El bloqueo de la fila del usuario (`FOR UPDATE`) es lo que hace segura la
 * operación: sin él, dos generaciones lanzadas a la vez leerían el mismo
 * saldo y ambas pasarían la comprobación, dejando el saldo en negativo.
 *
 * Nótese que el bloqueo se toma sobre `users` aunque escribamos en
 * `credit_ledger`: es la fila que ambas transacciones comparten, y por tanto
 * el punto donde deben serializarse.
 */
export async function chargeCredits(input: LedgerEntryInput & { amount: number }) {
  if (input.amount <= 0) {
    throw new Error('chargeCredits espera un importe positivo; lo convierte a cargo internamente');
  }

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${input.userId} FOR UPDATE`;

    if (input.idempotencyKey) {
      const existing = await tx.creditLedger.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      // Un reintento de red no debe cobrar dos veces: se devuelve el
      // asiento original tal cual, como si la operación acabara de ocurrir.
      if (existing) return existing;
    }

    const balance = await getBalance(input.userId, tx);
    if (balance < input.amount) {
      throw new InsufficientCreditsError(input.amount, balance);
    }

    return tx.creditLedger.create({
      data: {
        userId: input.userId,
        amount: -input.amount,
        reason: input.reason,
        description: input.description ?? '',
        balanceAfter: balance - input.amount,
        referenceId: input.referenceId ?? null,
        referenceType: input.referenceType ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
      },
    });
  });
}

/** Abona créditos (bonus de registro, compra, promoción o reembolso). */
export async function grantCredits(input: LedgerEntryInput) {
  if (input.amount <= 0) {
    throw new Error('grantCredits espera un importe positivo');
  }

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${input.userId} FOR UPDATE`;

    if (input.idempotencyKey) {
      const existing = await tx.creditLedger.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) return existing;
    }

    const balance = await getBalance(input.userId, tx);

    return tx.creditLedger.create({
      data: {
        userId: input.userId,
        amount: input.amount,
        reason: input.reason,
        description: input.description ?? '',
        balanceAfter: balance + input.amount,
        referenceId: input.referenceId ?? null,
        referenceType: input.referenceType ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
      },
    });
  });
}

/**
 * Devuelve los créditos reservados por un trabajo fallido.
 *
 * La marca `creditsRefunded` en el trabajo, comprobada dentro de la misma
 * transacción, es lo que garantiza que un reintento del worker no reembolse
 * dos veces.
 */
export async function refundJobCredits(jobId: string): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const job = await tx.job.findUnique({ where: { id: jobId } });
    if (!job || job.creditsRefunded || job.creditsReserved <= 0) return 0;

    await tx.$queryRaw`SELECT id FROM users WHERE id = ${job.userId} FOR UPDATE`;

    const balance = await getBalance(job.userId, tx);

    await tx.creditLedger.create({
      data: {
        userId: job.userId,
        amount: job.creditsReserved,
        reason: 'refund',
        description: 'Reembolso automático por trabajo fallido',
        balanceAfter: balance + job.creditsReserved,
        referenceId: jobId,
        referenceType: 'job',
        idempotencyKey: `refund:${jobId}`,
      },
    });

    await tx.job.update({ where: { id: jobId }, data: { creditsRefunded: true } });

    return job.creditsReserved;
  });
}

export async function listLedger(userId: string, limit = 50) {
  return prisma.creditLedger.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}
