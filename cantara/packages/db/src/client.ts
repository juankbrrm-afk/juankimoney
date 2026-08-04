import { PrismaClient } from './generated/index.js';

export * from './generated/index.js';

/**
 * Cliente Prisma único por proceso.
 *
 * En desarrollo el recargado en caliente reevalúa los módulos y cada
 * reevaluación abriría un pool nuevo, agotando las conexiones de Postgres en
 * pocos minutos. Guardarlo en `globalThis` lo evita.
 */
const globalForPrisma = globalThis as unknown as { __cantaraPrisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.__cantaraPrisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['warn', 'error']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__cantaraPrisma = prisma;
}

export type Db = PrismaClient;

/** Cierre ordenado; lo invocan los manejadores de señales de API y worker. */
export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}
