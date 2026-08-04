import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { createStorage } from '@cantara/ai';
import { AUDIO_MIME_TYPES } from '@cantara/shared';
import { loadConfig, type Config } from './config.js';
import { registerErrorHandler } from './errors.js';
import { attachUser } from './auth.js';
import type { AppContext } from './context.js';
import { authRoutes } from './routes/auth.js';
import { uploadRoutes } from './routes/uploads.js';
import { voiceRoutes } from './routes/voices.js';
import { songRoutes } from './routes/songs.js';
import { jobRoutes } from './routes/jobs.js';
import { creditRoutes } from './routes/credits.js';
import { fileRoutes } from './routes/files.js';

export async function buildApp(config: Config = loadConfig()): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      // En desarrollo interesa leer los logs; en producción, poder
      // indexarlos, así que se dejan en JSON de una línea.
      ...(config.isProduction
        ? {}
        : { transport: { target: 'pino-pretty', options: { colorize: true } } }),
      redact: ['req.headers.cookie', 'req.headers.authorization', 'password'],
    },
    // El límite protege la memoria del proceso; las subidas de audio no pasan
    // por aquí, van directas al almacén con URL prefirmada.
    bodyLimit: 2 * 1024 * 1024,
    trustProxy: config.isProduction,
  });

  registerErrorHandler(app);

  await app.register(cors, {
    // Solo el frontend conocido, y con credenciales: la cookie de sesión no
    // viaja a orígenes arbitrarios.
    origin: [config.WEB_PUBLIC_URL],
    credentials: true,
  });

  await app.register(cookie, { secret: config.SESSION_SECRET });

  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    // Por usuario cuando hay sesión, por IP cuando no: así una oficina tras
    // una única IP no se penaliza a sí misma.
    keyGenerator: (request) => request.user?.id ?? request.ip,
  });

  // El PUT de archivos en desarrollo llega como binario crudo, que Fastify no
  // sabe parsear por defecto.
  app.addContentTypeParser(
    [...AUDIO_MIME_TYPES],
    { parseAs: 'buffer' },
    (_request, body, done) => done(null, body),
  );

  const storage = createStorage(process.env, app.log);
  const ctx: AppContext = { config, storage };

  // Adjunta el usuario a toda petición; `requireAuth` es quien exige sesión.
  app.addHook('onRequest', attachUser);

  app.get('/health', async () => ({ status: 'ok', at: new Date().toISOString() }));

  await app.register(async (instance) => authRoutes(instance, ctx), { prefix: '/api' });
  await app.register(async (instance) => uploadRoutes(instance, ctx), { prefix: '/api' });
  await app.register(async (instance) => voiceRoutes(instance, ctx), { prefix: '/api' });
  await app.register(async (instance) => songRoutes(instance, ctx), { prefix: '/api' });
  await app.register(async (instance) => jobRoutes(instance, ctx), { prefix: '/api' });
  await app.register(async (instance) => creditRoutes(instance, ctx), { prefix: '/api' });
  await app.register(async (instance) => fileRoutes(instance, ctx));

  return app;
}
