import type { FastifyInstance } from 'fastify';
import { LocalDiskStorage } from '@cantara/ai';
import { EXPORT_SPECS, isSupportedAudioType } from '@cantara/shared';
import { badRequest, notFound } from '../errors.js';
import type { AppContext } from '../context.js';

/**
 * Servidor de archivos para el almacenamiento en disco de desarrollo.
 *
 * Con S3 estas rutas no se registran: el navegador habla directamente con el
 * almacén mediante URLs prefirmadas, que es como debe ser en producción.
 * Existen solo para que `npm run dev` funcione sin levantar MinIO.
 */
export async function fileRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  if (!(ctx.storage instanceof LocalDiskStorage)) return;

  app.log.warn('Sirviendo archivos desde disco: modo desarrollo, no apto para producción');

  const storage = ctx.storage;

  app.get('/files/*', async (request, reply) => {
    const key = decodeURIComponent((request.params as Record<string, string>)['*'] ?? '');
    if (!key) throw badRequest('Falta la ruta del archivo');

    try {
      const data = await storage.get(key);
      return reply.type(contentTypeFor(key)).send(Buffer.from(data));
    } catch {
      throw notFound('Archivo no encontrado');
    }
  });

  app.put('/files/*', {
    // El límite global de la API (2 MB) está pensado para cuerpos JSON: en
    // producción el audio nunca pasa por aquí, va directo al almacén con una
    // URL prefirmada. En desarrollo sí atraviesa esta ruta, así que necesita
    // su propio límite o cualquier grabación de más de dos minutos rompería
    // la conexión a mitad de subida.
    bodyLimit: ctx.config.UPLOAD_MAX_BYTES,
  }, async (request, reply) => {
    const key = decodeURIComponent((request.params as Record<string, string>)['*'] ?? '');
    if (!key) throw badRequest('Falta la ruta del archivo');

    const contentType = request.headers['content-type'] ?? 'application/octet-stream';
    if (!isSupportedAudioType(contentType)) {
      throw badRequest(`Tipo de archivo no soportado: ${contentType}`);
    }

    const body = request.body;
    if (!Buffer.isBuffer(body)) throw badRequest('Se esperaba el cuerpo binario del archivo');

    // El almacén en disco no guarda el tipo de contenido: se deduce de la
    // extensión al servir, que es suficiente para el modo desarrollo.
    await storage.put(key, new Uint8Array(body));

    return reply.status(200).send({ ok: true });
  });
}

function contentTypeFor(key: string): string {
  const extension = key.split('.').pop()?.toLowerCase() ?? '';
  if (extension === 'mp3') return EXPORT_SPECS.mp3.mime;
  if (extension === 'wav') return EXPORT_SPECS.wav.mime;
  if (extension === 'webm') return 'audio/webm';
  if (extension === 'm4a') return 'audio/mp4';
  return 'application/octet-stream';
}
