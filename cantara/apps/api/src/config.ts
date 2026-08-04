/**
 * Configuración validada al arrancar.
 *
 * Un despliegue con `SESSION_SECRET` ausente debe fallar al iniciar, no tres
 * horas después cuando alguien intente entrar. Zod convierte cada error de
 * configuración en un mensaje concreto sobre qué variable falta.
 */

import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.string().default('info'),

  API_PORT: z.coerce.number().int().default(4000),
  API_HOST: z.string().default('0.0.0.0'),
  API_PUBLIC_URL: z.string().url().default('http://localhost:4000'),
  WEB_PUBLIC_URL: z.string().url().default('http://localhost:3000'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET debe tener al menos 32 caracteres'),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  COOKIE_DOMAIN: z.string().default('localhost'),
  COOKIE_SECURE: z
    .string()
    .default('false')
    .transform((value) => value === 'true'),

  UPLOAD_MAX_BYTES: z.coerce.number().int().default(50 * 1024 * 1024),
  FREE_SIGNUP_CREDITS: z.coerce.number().int().default(150),
});

export type Config = z.infer<typeof schema> & { isProduction: boolean };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuración inválida:\n${details}`);
  }

  const config = parsed.data;

  // Una cookie sin `Secure` en producción viaja en claro por HTTP y expone la
  // sesión a cualquiera en la misma red. No es un aviso: es un fallo de
  // arranque.
  if (config.NODE_ENV === 'production' && !config.COOKIE_SECURE) {
    throw new Error('COOKIE_SECURE debe ser "true" en producción');
  }

  return { ...config, isProduction: config.NODE_ENV === 'production' };
}
