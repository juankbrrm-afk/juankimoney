/**
 * Tests de la API que no necesitan Postgres ni Redis.
 *
 * Cubren configuración, arranque, cabeceras de seguridad y el mapeo de
 * errores a respuestas — que es donde se decide qué ve el usuario cuando algo
 * va mal, y por tanto donde una regresión duele más.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { z, type ZodError } from 'zod';
import { InsufficientCreditsError } from '@cantara/db';
import { JobError } from '@cantara/shared';
import { loadConfig } from '../src/config.js';
import { HttpError, badRequest, notFound, registerErrorHandler } from '../src/errors.js';

const BASE_ENV = {
  DATABASE_URL: 'postgresql://localhost:5432/test',
  SESSION_SECRET: 'x'.repeat(40),
  NODE_ENV: 'test',
} as NodeJS.ProcessEnv;

describe('configuración', () => {
  it('aplica valores por defecto sensatos', () => {
    const config = loadConfig(BASE_ENV);

    assert.equal(config.API_PORT, 4000);
    assert.equal(config.SESSION_TTL_DAYS, 30);
    assert.equal(config.isProduction, false);
  });

  it('falla si falta DATABASE_URL', () => {
    assert.throws(
      () => loadConfig({ SESSION_SECRET: 'x'.repeat(40) } as NodeJS.ProcessEnv),
      /DATABASE_URL/,
    );
  });

  it('rechaza un SESSION_SECRET corto', () => {
    assert.throws(
      () => loadConfig({ ...BASE_ENV, SESSION_SECRET: 'corto' }),
      /SESSION_SECRET/,
    );
  });

  it('no arranca en producción con la cookie sin Secure', () => {
    assert.throws(
      () => loadConfig({ ...BASE_ENV, NODE_ENV: 'production', COOKIE_SECURE: 'false' }),
      /COOKIE_SECURE/,
    );
  });

  it('arranca en producción con la cookie asegurada', () => {
    const config = loadConfig({ ...BASE_ENV, NODE_ENV: 'production', COOKIE_SECURE: 'true' });
    assert.equal(config.isProduction, true);
    assert.equal(config.COOKIE_SECURE, true);
  });
});

// ── Mapeo de errores ─────────────────────────────────────────

/** Fastify mínimo para capturar lo que el manejador de errores produce. */
function captureHandler() {
  let handler: (error: Error, request: unknown, reply: unknown) => unknown = () => {};

  const app = {
    setErrorHandler(fn: typeof handler) {
      handler = fn;
    },
    setNotFoundHandler() {},
  };

  registerErrorHandler(app as never);

  return async (error: Error) => {
    let status = 200;
    let payload: unknown;

    const reply = {
      status(code: number) {
        status = code;
        return this;
      },
      send(body: unknown) {
        payload = body;
        return this;
      },
    };

    await handler(error, { log: { error() {} } }, reply);

    return { status, payload: payload as { error: { code: string; message: string; fields?: Record<string, string> } } };
  };
}

describe('mapeo de errores a respuestas', () => {
  const run = captureHandler();

  it('conserva el código y el estado de un HttpError', async () => {
    const { status, payload } = await run(notFound('Canción no encontrada'));

    assert.equal(status, 404);
    assert.equal(payload.error.code, 'not_found');
    assert.equal(payload.error.message, 'Canción no encontrada');
  });

  it('aplana los errores de Zod a un mapa por campo', async () => {
    const schema = z.object({ email: z.string().email('Email inválido') });
    const result = schema.safeParse({ email: 'no-es-un-email' });

    const { status, payload } = await run(result.error as ZodError);

    assert.equal(status, 400);
    assert.equal(payload.error.code, 'validation_error');
    assert.equal(payload.error.fields?.email, 'Email inválido');
  });

  it('devuelve 402 y las cifras al faltar créditos', async () => {
    const { status, payload } = await run(new InsufficientCreditsError(30, 10));

    assert.equal(status, 402);
    assert.equal(payload.error.code, 'insufficient_credits');
    assert.match(payload.error.message, /30/);
    assert.match(payload.error.message, /10/);
  });

  it('traduce un JobError a su mensaje para el usuario', async () => {
    const { status, payload } = await run(new JobError('audio_too_noisy'));

    assert.equal(status, 422);
    assert.equal(payload.error.code, 'audio_too_noisy');
    assert.match(payload.error.message, /ruido/i);
  });

  it('no filtra detalles internos en un error inesperado', async () => {
    const { status, payload } = await run(
      new Error('conexión a postgres://usuario:contraseña@host rechazada'),
    );

    assert.equal(status, 500);
    assert.equal(payload.error.code, 'internal_error');
    assert.doesNotMatch(payload.error.message, /postgres/);
    assert.doesNotMatch(payload.error.message, /contraseña/);
  });

  it('adjunta los campos de un badRequest cuando se aportan', async () => {
    const { payload } = await run(badRequest('Revisa el formulario', { name: 'Obligatorio' }));

    assert.equal(payload.error.fields?.name, 'Obligatorio');
  });

  it('mantiene el estado de un HttpError construido a mano', async () => {
    const { status, payload } = await run(new HttpError(418, 'teapot', 'Soy una tetera'));

    assert.equal(status, 418);
    assert.equal(payload.error.code, 'teapot');
  });
});
