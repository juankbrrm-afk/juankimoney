import type { FastifyInstance } from 'fastify';
import { getBalance, grantCredits, prisma } from '@cantara/db';
import { loginSchema, registerSchema, type PublicUser } from '@cantara/shared';
import {
  SESSION_COOKIE,
  clearSessionCookie,
  createSession,
  destroySession,
  getDecoyHash,
  hashPassword,
  requireAuth,
  setSessionCookie,
  verifyPassword,
} from '../auth.js';
import { conflict, unauthorized } from '../errors.js';
import type { AppContext } from '../context.js';

export async function authRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { config } = ctx;

  async function toPublicUser(user: {
    id: string;
    email: string;
    displayName: string;
    createdAt: Date;
  }): Promise<PublicUser> {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      credits: await getBalance(user.id),
      createdAt: user.createdAt.toISOString(),
    };
  }

  app.post(
    '/auth/register',
    {
      // Límite estricto: sin él, esta ruta es una fábrica gratuita de cuentas
      // y de créditos de bienvenida.
      config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
    },
    async (request, reply) => {
      const input = registerSchema.parse(request.body);

      const existing = await prisma.user.findUnique({ where: { email: input.email } });
      if (existing) {
        throw conflict('Ya existe una cuenta con ese email');
      }

      const user = await prisma.user.create({
        data: {
          email: input.email,
          passwordHash: await hashPassword(input.password),
          displayName: input.displayName,
        },
      });

      // La clave de idempotencia impide que un reintento regale el bonus dos
      // veces si la respuesta se perdió por el camino.
      await grantCredits({
        userId: user.id,
        amount: config.FREE_SIGNUP_CREDITS,
        reason: 'signup_bonus',
        description: 'Créditos de bienvenida',
        idempotencyKey: `signup:${user.id}`,
      });

      const session = await createSession(user.id, config, {
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      });
      setSessionCookie(reply, session.token, config);

      return reply.status(201).send({ user: await toPublicUser(user) });
    },
  );

  app.post(
    '/auth/login',
    { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } },
    async (request, reply) => {
      const input = loginSchema.parse(request.body);

      const user = await prisma.user.findUnique({ where: { email: input.email } });

      // Se verifica siempre, incluso sin usuario, contra un hash señuelo: el
      // tiempo de respuesta no debe revelar qué emails están registrados.
      const passwordHash = user?.passwordHash ?? (await getDecoyHash());
      const valid = await verifyPassword(passwordHash, input.password);

      if (!user || !valid) {
        throw unauthorized('Email o contraseña incorrectos');
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      const session = await createSession(user.id, config, {
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      });
      setSessionCookie(reply, session.token, config);

      return { user: await toPublicUser(user) };
    },
  );

  app.post('/auth/logout', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token) await destroySession(token);
    clearSessionCookie(reply, config);
    return { ok: true };
  });

  app.get('/auth/me', async (request) => {
    const sessionUser = await requireAuth(request);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: sessionUser.id } });
    return { user: await toPublicUser(user) };
  });

  /** Cierra el resto de sesiones; útil tras un acceso sospechoso. */
  app.post('/auth/sessions/revoke-others', async (request) => {
    const sessionUser = await requireAuth(request);
    const token = request.cookies[SESSION_COOKIE]!;

    const { createHash } = await import('node:crypto');
    const currentHash = createHash('sha256').update(token).digest('hex');

    const { count } = await prisma.session.deleteMany({
      where: { userId: sessionUser.id, tokenHash: { not: currentHash } },
    });

    return { revoked: count };
  });
}
