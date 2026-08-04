import { prisma, refundJobCredits } from '@cantara/db';
import {
  JobError,
  lyricsSchema,
  type Genre,
  type Language,
  type SongGenerationJobData,
  type SongStructure,
  type VocalTimbre,
} from '@cantara/shared';
import { generateSong, type Artifacts, type VoiceHandle } from '@cantara/ai';
import { ProgressReporter } from '../progress.js';
import type { HandlerDeps } from './train-voice.js';

/**
 * Trabajo de generación de canción.
 *
 * Compone la petición del pipeline a partir de la canción, sus overrides de
 * versión y el modelo de voz, ejecuta y persiste. Los artefactos intermedios
 * se guardan en la fila de la versión, así que un reintento retoma desde la
 * última etapa completada en vez de recomponer —que es la parte cara.
 */
export async function handleSongGeneration(
  data: SongGenerationJobData,
  deps: HandlerDeps,
  signal?: AbortSignal,
): Promise<void> {
  const { providers, storage, redis, logger } = deps;
  const reporter = new ProgressReporter(redis, data.jobId, 'song-generation');

  const version = await prisma.songVersion.findUnique({
    where: { id: data.songVersionId },
    include: { song: { include: { voiceModel: true } } },
  });

  if (!version) {
    await reporter.failed('internal', 'La versión de la canción ya no existe');
    await refundJobCredits(data.jobId);
    return;
  }

  const { song } = version;

  await reporter.started();
  await prisma.songVersion.update({
    where: { id: version.id },
    data: { status: 'GENERATING', failureReason: null, failureCode: null },
  });

  try {
    const overrides = (version.overrides ?? {}) as {
      prompt?: string;
      genre?: Genre;
      timbre?: VocalTimbre;
      bpm?: number;
      rewriteLyrics?: boolean;
    };

    // Se reutiliza la letra existente salvo que el usuario pida reescribirla.
    // Es lo que hace que regenerar cueste menos: no se paga dos veces por
    // escribir lo mismo.
    const storedLyrics = lyricsSchema.safeParse(song.lyrics);
    const lyrics = overrides.rewriteLyrics
      ? null
      : storedLyrics.success
        ? storedLyrics.data
        : null;

    const voice = resolveVoice(song.voiceModel);

    if (!song.instrumental && !voice) {
      throw new JobError('voice_not_ready');
    }

    const result = await generateSong(
      {
        userId: data.userId,
        versionId: version.id,
        title: song.title,
        prompt: overrides.prompt ?? song.prompt,
        genre: (overrides.genre ?? song.genre) as Genre,
        language: song.language as Language,
        structure: song.structure as SongStructure,
        timbre: (overrides.timbre ?? song.timbre) as VocalTimbre,
        bpm: overrides.bpm ?? song.bpm,
        durationSeconds: song.durationSeconds,
        instrumental: song.instrumental,
        lyrics,
        voice,
      },
      {
        providers,
        storage,
        signal,
        artifacts: (version.artifacts ?? {}) as Artifacts,
        onStage: (stage, fraction, note) => reporter.stage(stage, fraction, note),
      },
    );

    await prisma.$transaction(async (tx) => {
      await tx.songVersion.update({
        where: { id: version.id },
        data: {
          status: 'READY',
          durationSeconds: result.durationSeconds,
          mp3Key: result.mp3Key,
          wavKey: result.wavKey,
          waveform: result.waveform,
          artifacts: result.artifacts as object,
          musicProvider: result.musicProvider,
          readyAt: new Date(),
        },
      });

      // La letra generada se guarda en la canción, no en la versión: es la
      // intención creativa y debe estar disponible para futuras
      // regeneraciones sin volver a pagarla.
      if (!song.lyrics || overrides.rewriteLyrics) {
        await tx.song.update({
          where: { id: song.id },
          data: {
            lyrics: result.lyrics as unknown as object,
            ...(song.title === 'Sin título' && result.lyrics.title
              ? { title: result.lyrics.title }
              : {}),
          },
        });
      }
    });

    await reporter.succeeded(version.id, 'Tu canción está lista');
  } catch (error) {
    const jobError =
      error instanceof JobError
        ? error
        : new JobError('internal', error instanceof Error ? error.message : String(error), true);

    logger.error(
      { err: error, jobId: data.jobId, code: jobError.code },
      'Falló la generación de la canción',
    );

    // Antes de reintentar se guardan los artefactos ya producidos: es lo que
    // permite que el siguiente intento no recomponga desde cero.
    if (jobError.retryable) {
      await persistPartialArtifacts(version.id, error);
      throw error;
    }

    await prisma.songVersion.update({
      where: { id: version.id },
      data: {
        status: 'FAILED',
        failureReason: jobError.userMessage,
        failureCode: jobError.code,
      },
    });

    await reporter.failed(jobError.code, jobError.userMessage, jobError.detail);
    await refundJobCredits(data.jobId);
  }
}

function resolveVoice(
  model: { provider: string; providerModelId: string | null; register: string } | null,
): { handle: VoiceHandle; isLowRegister: boolean } | null {
  if (!model?.providerModelId) return null;

  return {
    handle: { provider: model.provider, modelId: model.providerModelId },
    isLowRegister: model.register !== 'HIGH',
  };
}

/**
 * Rescata las claves de artefactos de un error a medio pipeline.
 *
 * `generateSong` acumula artefactos según avanza; si falla, esa información
 * se perdería con la excepción. Guardarla convierte el reintento en una
 * reanudación.
 */
async function persistPartialArtifacts(versionId: string, error: unknown): Promise<void> {
  const artifacts = (error as { artifacts?: Artifacts }).artifacts;
  if (!artifacts || Object.keys(artifacts).length === 0) return;

  await prisma.songVersion
    .update({ where: { id: versionId }, data: { artifacts: artifacts as object } })
    .catch(() => undefined);
}
