import { disconnect } from '@cantara/db';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { closeQueues } from './queue.js';

const config = loadConfig();
const app = await buildApp(config);

await app.listen({ port: config.API_PORT, host: config.API_HOST });

app.log.info(`API escuchando en ${config.API_PUBLIC_URL}`);

/**
 * Cierre ordenado.
 *
 * Se drenan las peticiones en vuelo antes de soltar Redis y Postgres: cerrar
 * primero las conexiones dejaría a medias a quien estuviera generando una
 * canción en ese momento.
 */
let shuttingDown = false;

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    if (shuttingDown) return;
    shuttingDown = true;

    app.log.info(`${signal} recibido, cerrando…`);

    try {
      await app.close();
      await closeQueues();
      await disconnect();
      process.exit(0);
    } catch (error) {
      app.log.error({ err: error }, 'Error durante el cierre');
      process.exit(1);
    }
  });
}
