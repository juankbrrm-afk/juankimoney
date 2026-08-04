import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { InsufficientCreditsError } from '@cantara/db';
import { JobError } from '@cantara/shared';

/** Error de aplicación con código estable, pensado para que el cliente actúe. */
export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (message: string, fields?: Record<string, string>) =>
  new HttpError(400, 'bad_request', message, fields);

export const unauthorized = (message = 'Necesitas iniciar sesión') =>
  new HttpError(401, 'unauthorized', message);

export const forbidden = (message = 'No tienes acceso a este recurso') =>
  new HttpError(403, 'forbidden', message);

export const notFound = (message = 'No encontrado') => new HttpError(404, 'not_found', message);

export const conflict = (message: string) => new HttpError(409, 'conflict', message);

/**
 * Manejador global de errores.
 *
 * Convierte errores de dominio en respuestas con código estable y **nunca
 * filtra detalles internos**: un fallo inesperado devuelve un mensaje
 * genérico al cliente y el detalle completo al log, donde sí es útil.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof HttpError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, fields: error.fields },
      });
    }

    // Zod: se aplana a un mapa campo → mensaje, listo para pintar bajo cada
    // input del formulario sin que el cliente tenga que interpretar nada.
    if (error instanceof ZodError) {
      const fields: Record<string, string> = {};
      for (const issue of error.issues) {
        const path = issue.path.join('.') || 'form';
        fields[path] ??= issue.message;
      }
      return reply.status(400).send({
        error: { code: 'validation_error', message: 'Revisa los datos del formulario', fields },
      });
    }

    if (error instanceof InsufficientCreditsError) {
      return reply.status(402).send({
        error: {
          code: 'insufficient_credits',
          message: `Necesitas ${error.required} créditos y tienes ${error.available}.`,
        },
      });
    }

    if (error instanceof JobError) {
      return reply.status(422).send({
        error: { code: error.code, message: error.userMessage },
      });
    }

    // Fastify marca así el exceso de peticiones cuando actúa el rate limit.
    if ((error as { statusCode?: number }).statusCode === 429) {
      return reply.status(429).send({
        error: { code: 'rate_limited', message: 'Demasiadas peticiones. Espera un momento.' },
      });
    }

    request.log.error({ err: error }, 'Error no controlado');

    return reply.status(500).send({
      error: { code: 'internal_error', message: 'Algo falló por nuestra parte.' },
    });
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({ error: { code: 'not_found', message: 'Ruta no encontrada' } });
  });
}
