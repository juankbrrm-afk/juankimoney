import type { FastifyInstance } from 'fastify';
import { chargeCredits, prisma } from '@cantara/db';
import {
  CREDIT_COSTS,
  createSongSchema,
  defaultBpm,
  generateLyricsSchema,
  paginationSchema,
  regenerateSongSchema,
  songCost,
  type Genre,
} from '@cantara/shared';
import { createProviders } from '@cantara/ai';
import { requireAuth } from '../auth.js';
import { badRequest, conflict, notFound } from '../errors.js';
import { enqueueSongGeneration } from '../queue.js';
import { serializeSong } from '../serialize.js';
import type { AppContext } from '../context.js';

const SONG_INCLUDE = {
  versions: true,
  voiceModel: { select: { name: true } },
} as const;

export async function songRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  /**
   * Historial paginado por cursor.
   *
   * Cursor y no offset: el historial crece por delante, y con `skip` una
   * canción nueva desplazaría las páginas y el usuario vería duplicados al
   * desplazarse.
   */
  app.get('/songs', async (request) => {
    const user = await requireAuth(request);
    const { cursor, limit } = paginationSchema.parse(request.query);

    const songs = await prisma.song.findMany({
      where: { userId: user.id, archivedAt: null },
      include: SONG_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = songs.length > limit;
    const page = hasMore ? songs.slice(0, limit) : songs;

    const activeJobs = await activeJobsByVersion(page.flatMap((s) => s.versions.map((v) => v.id)));

    return {
      items: await Promise.all(page.map((song) => serializeSong(song, ctx.storage, activeJobs))),
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
    };
  });

  app.get('/songs/:id', async (request) => {
    const user = await requireAuth(request);
    const { id } = request.params as { id: string };

    const song = await prisma.song.findFirst({
      where: { id, userId: user.id },
      include: SONG_INCLUDE,
    });
    if (!song) throw notFound('Canción no encontrada');

    const activeJobs = await activeJobsByVersion(song.versions.map((v) => v.id));

    return { song: await serializeSong(song, ctx.storage, activeJobs) };
  });

  /** Letra sin generar música: barato y permite iterar antes de componer. */
  app.post(
    '/lyrics',
    { config: { rateLimit: { max: 30, timeWindow: '1 hour' } } },
    async (request) => {
      const user = await requireAuth(request);
      const input = generateLyricsSchema.parse(request.body);

      await chargeCredits({
        userId: user.id,
        amount: CREDIT_COSTS.lyricsOnly,
        reason: 'song_generation',
        description: 'Generación de letra',
      });

      const providers = await createProviders(process.env, app.log);
      const lyrics = await providers.lyrics.generate({
        prompt: input.prompt,
        genre: input.genre,
        language: input.language,
        structure: input.structure,
        title: input.title,
      });

      return { lyrics };
    },
  );

  app.post(
    '/songs',
    { config: { rateLimit: { max: 30, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const user = await requireAuth(request);
      const input = createSongSchema.parse(request.body);

      if (input.voiceModelId) {
        const voice = await prisma.voiceModel.findFirst({
          where: { id: input.voiceModelId, userId: user.id },
        });
        if (!voice) throw badRequest('Ese modelo de voz no existe');
        if (voice.status !== 'READY') {
          throw conflict('Tu modelo de voz aún no está listo. Espera a que termine el entrenamiento.');
        }
      }

      const bpm = input.bpm ?? defaultBpm(input.genre as Genre);
      const cost = songCost({ durationSeconds: input.durationSeconds });

      const { song, version, job } = await prisma.$transaction(async (tx) => {
        const createdSong = await tx.song.create({
          data: {
            userId: user.id,
            title: input.title?.trim() || 'Sin título',
            prompt: input.prompt,
            genre: input.genre,
            language: input.language,
            structure: input.structure,
            timbre: input.timbre,
            bpm,
            instrumental: input.instrumental,
            durationSeconds: input.durationSeconds,
            lyrics: input.lyrics ?? undefined,
            voiceModelId: input.voiceModelId,
          },
        });

        const createdVersion = await tx.songVersion.create({
          data: { songId: createdSong.id, version: 1, status: 'QUEUED' },
        });

        const createdJob = await tx.job.create({
          data: {
            userId: user.id,
            type: 'song-generation',
            status: 'queued',
            message: 'En cola',
            creditsReserved: cost,
            songVersionId: createdVersion.id,
          },
        });

        return { song: createdSong, version: createdVersion, job: createdJob };
      });

      try {
        await chargeCredits({
          userId: user.id,
          amount: cost,
          reason: 'song_generation',
          description: `Canción: ${song.title}`,
          referenceId: job.id,
          referenceType: 'job',
          idempotencyKey: `song:${job.id}`,
        });
      } catch (error) {
        await prisma.song.delete({ where: { id: song.id } }).catch(() => {});
        throw error;
      }

      await enqueueSongGeneration(ctx.config.REDIS_URL, {
        jobId: job.id,
        userId: user.id,
        songVersionId: version.id,
      });

      const full = await prisma.song.findUniqueOrThrow({
        where: { id: song.id },
        include: SONG_INCLUDE,
      });

      return reply.status(202).send({
        song: await serializeSong(full, ctx.storage, new Map([[version.id, job.id]])),
        jobId: job.id,
      });
    },
  );

  /**
   * Regenerar: nueva versión sobre la misma canción.
   *
   * Nada se sobrescribe. El usuario puede comparar tomas y quedarse con la
   * que prefiera, que es como funciona realmente elegir una toma.
   */
  app.post(
    '/songs/:id/regenerate',
    { config: { rateLimit: { max: 30, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const user = await requireAuth(request);
      const { id } = request.params as { id: string };
      const input = regenerateSongSchema.parse(request.body ?? {});

      const song = await prisma.song.findFirst({
        where: { id, userId: user.id },
        include: SONG_INCLUDE,
      });
      if (!song) throw notFound('Canción no encontrada');

      const pending = await prisma.job.findFirst({
        where: {
          songVersionId: { in: song.versions.map((v) => v.id) },
          status: { in: ['queued', 'running'] },
        },
      });
      if (pending) throw conflict('Ya hay una versión generándose para esta canción');

      // Reutilizar la letra abarata la operación: no se vuelve a pagar la
      // etapa de escritura. Reescribirla cuesta como una canción nueva.
      const cost = input.rewriteLyrics
        ? songCost({ durationSeconds: song.durationSeconds })
        : songCost({ isRegeneration: true, durationSeconds: song.durationSeconds });

      const nextVersion = Math.max(...song.versions.map((v) => v.version), 0) + 1;

      const overrides = {
        ...(input.prompt ? { prompt: input.prompt } : {}),
        ...(input.genre ? { genre: input.genre } : {}),
        ...(input.timbre ? { timbre: input.timbre } : {}),
        ...(input.bpm ? { bpm: input.bpm } : {}),
        ...(input.rewriteLyrics ? { rewriteLyrics: true } : {}),
      };

      const { version, job } = await prisma.$transaction(async (tx) => {
        const createdVersion = await tx.songVersion.create({
          data: {
            songId: song.id,
            version: nextVersion,
            status: 'QUEUED',
            overrides: Object.keys(overrides).length > 0 ? overrides : undefined,
          },
        });

        const createdJob = await tx.job.create({
          data: {
            userId: user.id,
            type: 'song-generation',
            status: 'queued',
            message: 'En cola',
            creditsReserved: cost,
            songVersionId: createdVersion.id,
          },
        });

        return { version: createdVersion, job: createdJob };
      });

      try {
        await chargeCredits({
          userId: user.id,
          amount: cost,
          reason: 'song_generation',
          description: `Regeneración v${nextVersion}: ${song.title}`,
          referenceId: job.id,
          referenceType: 'job',
          idempotencyKey: `song:${job.id}`,
        });
      } catch (error) {
        await prisma.songVersion.delete({ where: { id: version.id } }).catch(() => {});
        throw error;
      }

      await enqueueSongGeneration(ctx.config.REDIS_URL, {
        jobId: job.id,
        userId: user.id,
        songVersionId: version.id,
      });

      const full = await prisma.song.findUniqueOrThrow({
        where: { id: song.id },
        include: SONG_INCLUDE,
      });

      return reply.status(202).send({
        song: await serializeSong(full, ctx.storage, new Map([[version.id, job.id]])),
        jobId: job.id,
      });
    },
  );

  /** Archivar en lugar de borrar: el audio sigue existiendo y es recuperable. */
  app.delete('/songs/:id', async (request, reply) => {
    const user = await requireAuth(request);
    const { id } = request.params as { id: string };

    const song = await prisma.song.findFirst({ where: { id, userId: user.id } });
    if (!song) throw notFound('Canción no encontrada');

    await prisma.song.update({ where: { id: song.id }, data: { archivedAt: new Date() } });

    return reply.status(204).send();
  });
}

async function activeJobsByVersion(versionIds: string[]): Promise<Map<string, string>> {
  if (versionIds.length === 0) return new Map();

  const jobs = await prisma.job.findMany({
    where: { songVersionId: { in: versionIds }, status: { in: ['queued', 'running'] } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, songVersionId: true },
  });

  const map = new Map<string, string>();
  for (const job of jobs) {
    if (job.songVersionId && !map.has(job.songVersionId)) map.set(job.songVersionId, job.id);
  }
  return map;
}
