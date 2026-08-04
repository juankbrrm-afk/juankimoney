/**
 * Autenticación por sesión.
 *
 * Se implementa aquí en lugar de delegar en un proveedor externo porque el
 * flujo es email+contraseña sobre una API sin navegador propio, y eso encaja
 * mal con las librerías pensadas para Next.js. Son ~200 líneas auditables y
 * sin dependencia de terceros.
 *
 * Dos decisiones importan:
 *
 * 1. El token de sesión se guarda **hasheado**. Quien lea la tabla `sessions`
 *    no puede suplantar a nadie: no tiene el token en claro.
 * 2. El login tarda lo mismo exista el usuario o no. Sin eso, el tiempo de
 *    respuesta revela qué emails están registrados.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '@cantara/db';
import type { Config } from './config.js';
import { unauthorized } from './errors.js';

export const SESSION_COOKIE = 'cantara_session';

/**
 * Parámetros de Argon2id según la guía de OWASP: 19 MiB de memoria, 2
 * iteraciones y paralelismo 1. Es el punto donde el coste para un atacante
 * con GPU sube mucho y el del servidor sigue siendo asumible.
 */
const ARGON_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password, ARGON_OPTIONS);
  } catch {
    return false;
  }
}

/**
 * Hash falso con el que comparar cuando el email no existe.
 *
 * Verificar contra él cuesta lo mismo que contra uno real, así que el tiempo
 * de respuesta no delata si la cuenta existe.
 */
let decoyHash: string | null = null;

export async function getDecoyHash(): Promise<string> {
  decoyHash ??= await hashPassword(randomBytes(32).toString('hex'));
  return decoyHash;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface SessionUser {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: string;
}

export async function createSession(
  userId: string,
  config: Config,
  meta: { ip?: string; userAgent?: string } = {},
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + config.SESSION_TTL_DAYS * 86_400_000);

  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      ip: meta.ip ?? null,
      userAgent: meta.userAgent?.slice(0, 500) ?? null,
    },
  });

  return { token, expiresAt };
}

export async function resolveSession(token: string): Promise<SessionUser | null> {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });

  if (!session) return null;

  if (session.expiresAt.getTime() < Date.now()) {
    // Limpieza oportunista: la sesión caducada se borra al tocarla, así no
    // hace falta un barrido periódico para el caso común.
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  // El `lastAccessedAt` se actualiza en segundo plano: no debe añadir latencia
  // a cada petición autenticada.
  void prisma.session
    .update({ where: { id: session.id }, data: { lastAccessedAt: new Date() } })
    .catch(() => {});

  return {
    id: session.user.id,
    email: session.user.email,
    displayName: session.user.displayName,
    role: session.user.role,
  };
}

export async function destroySession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

export function setSessionCookie(reply: FastifyReply, token: string, config: Config): void {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: config.COOKIE_SECURE,
    // `lax` deja pasar la navegación normal y bloquea los envíos entre sitios,
    // que es lo que protege de CSRF sin romper los enlaces entrantes.
    sameSite: 'lax',
    path: '/',
    domain: config.COOKIE_DOMAIN === 'localhost' ? undefined : config.COOKIE_DOMAIN,
    maxAge: config.SESSION_TTL_DAYS * 86_400,
  });
}

export function clearSessionCookie(reply: FastifyReply, config: Config): void {
  reply.clearCookie(SESSION_COOKIE, {
    path: '/',
    domain: config.COOKIE_DOMAIN === 'localhost' ? undefined : config.COOKIE_DOMAIN,
  });
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: SessionUser;
  }
}

/** Adjunta el usuario si hay sesión válida. No exige autenticación. */
export async function attachUser(request: FastifyRequest): Promise<void> {
  const token = request.cookies[SESSION_COOKIE];
  if (!token) return;

  const user = await resolveSession(token);
  if (user) request.user = user;
}

/** Preguarda para rutas que exigen sesión. */
export async function requireAuth(request: FastifyRequest): Promise<SessionUser> {
  await attachUser(request);
  if (!request.user) throw unauthorized();
  return request.user;
}

/**
 * Comparación en tiempo constante para tokens fuera de la sesión (por
 * ejemplo, verificación de email). Longitudes distintas se rechazan sin
 * comparar, que no filtra nada útil.
 */
export function safeCompare(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}
