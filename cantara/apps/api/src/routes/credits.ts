import type { FastifyInstance } from 'fastify';
import { getBalance, grantCredits, listLedger, prisma } from '@cantara/db';
import { CREDIT_PACKS, CREDIT_REASON_LABELS, type CreditReason } from '@cantara/shared';
import { requireAuth } from '../auth.js';
import { badRequest } from '../errors.js';
import type { AppContext } from '../context.js';

export async function creditRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get('/credits', async (request) => {
    const user = await requireAuth(request);

    const [balance, entries] = await Promise.all([getBalance(user.id), listLedger(user.id, 100)]);

    return {
      balance,
      packs: CREDIT_PACKS,
      history: entries.map((entry) => ({
        id: entry.id,
        amount: entry.amount,
        reason: entry.reason,
        description:
          entry.description || CREDIT_REASON_LABELS[entry.reason as CreditReason] || entry.reason,
        balanceAfter: entry.balanceAfter,
        createdAt: entry.createdAt.toISOString(),
      })),
    };
  });

  /**
   * Compra de créditos.
   *
   * La pasarela de pago no está integrada: eso requiere credenciales y una
   * cuenta verificada. Lo que sí está es todo lo que la rodea —packs, ledger,
   * idempotencia— así que conectar Stripe se reduce a validar su webhook aquí
   * y llamar a `grantCredits` con el `idempotencyKey` del evento de pago.
   *
   * Fuera de desarrollo la ruta responde 501 en lugar de regalar créditos.
   */
  app.post('/credits/purchase', async (request, reply) => {
    const user = await requireAuth(request);
    const { packId } = (request.body ?? {}) as { packId?: string };

    const pack = CREDIT_PACKS.find((item) => item.id === packId);
    if (!pack) throw badRequest('Pack de créditos desconocido');

    if (ctx.config.isProduction) {
      return reply.status(501).send({
        error: {
          code: 'payments_not_configured',
          message: 'Los pagos aún no están habilitados en este despliegue.',
        },
      });
    }

    await grantCredits({
      userId: user.id,
      amount: pack.credits,
      reason: 'purchase',
      description: `Pack ${pack.name} (simulado en desarrollo)`,
      referenceId: pack.id,
      referenceType: 'credit_pack',
      // Sin clave de idempotencia real de pasarela, se usa el instante: en
      // desarrollo interesa poder comprar el mismo pack varias veces.
      idempotencyKey: `dev-purchase:${user.id}:${pack.id}:${Date.now()}`,
    });

    return { balance: await getBalance(user.id) };
  });

  /** Resumen del panel: saldo, contadores y trabajos en curso. */
  app.get('/dashboard', async (request) => {
    const user = await requireAuth(request);

    const [balance, songCount, voiceCount, readyVoices, activeJobs] = await Promise.all([
      getBalance(user.id),
      prisma.song.count({ where: { userId: user.id, archivedAt: null } }),
      prisma.voiceModel.count({ where: { userId: user.id } }),
      prisma.voiceModel.count({ where: { userId: user.id, status: 'READY' } }),
      prisma.job.count({ where: { userId: user.id, status: { in: ['queued', 'running'] } } }),
    ]);

    return { balance, songCount, voiceCount, readyVoices, activeJobs };
  });
}
