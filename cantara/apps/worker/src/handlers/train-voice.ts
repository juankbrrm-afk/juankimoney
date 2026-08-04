import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import { prisma, refundJobCredits } from '@cantara/db';
import { JobError, type VoiceTrainingJobData } from '@cantara/shared';
import {
  trainVoice,
  type AiProviders,
  type StoragePort,
  storageKeys,
} from '@cantara/ai';
import { ProgressReporter } from '../progress.js';

export interface HandlerDeps {
  readonly providers: AiProviders;
  readonly storage: StoragePort;
  readonly redis: Redis;
  readonly logger: Logger;
}

/**
 * Trabajo de entrenamiento de voz.
 *
 * Traduce entre el mundo del pipeline (puro, sin base de datos) y el estado
 * persistente: marca el modelo como entrenando, delega, y guarda el
 * resultado o el fallo. Los créditos se devuelven ante cualquier fallo
 * definitivo — el usuario no paga por un problema nuestro.
 */
export async function handleVoiceTraining(
  data: VoiceTrainingJobData,
  deps: HandlerDeps,
  signal?: AbortSignal,
): Promise<void> {
  const { providers, storage, redis, logger } = deps;
  const reporter = new ProgressReporter(redis, data.jobId, 'voice-training');

  const model = await prisma.voiceModel.findUnique({
    where: { id: data.voiceModelId },
    include: { samples: { include: { upload: true } } },
  });

  if (!model) {
    await reporter.failed('internal', 'El modelo de voz ya no existe');
    await refundJobCredits(data.jobId);
    return;
  }

  await reporter.started();
  await prisma.voiceModel.update({
    where: { id: model.id },
    data: { status: 'TRAINING', failureReason: null },
  });

  try {
    const result = await trainVoice(
      {
        userId: data.userId,
        voiceModelId: model.id,
        instant: model.instant,
        samples: model.samples.map((sample) => ({
          id: sample.id,
          storageKey: sample.upload.storageKey,
          mime: sample.upload.contentType,
        })),
      },
      {
        providers,
        storage,
        signal,
        onStage: (stage, fraction, note) => reporter.stage(stage, fraction, note),
        // Los proveedores de GPU descargan el audio por HTTP; se les firma
        // una URL de vida corta en vez de darles credenciales del bucket.
        signUrl: (key) => storage.signedDownloadUrl(key, 3600),
      },
    );

    // El informe de calidad por muestra se guarda aunque el entrenamiento
    // haya ido bien: es lo que permite explicar después por qué una voz sonó
    // peor de lo esperado.
    await prisma.$transaction(async (tx) => {
      for (const analyzed of result.analyzed) {
        await tx.voiceSample.update({
          where: { id: analyzed.id },
          data: {
            qualityScore: analyzed.quality.score,
            issues: [...analyzed.quality.issues],
            metrics: analyzed.quality as unknown as object,
            includedInTraining: analyzed.includedInTraining,
          },
        });
      }

      await tx.voiceModel.update({
        where: { id: model.id },
        data: {
          status: 'READY',
          provider: result.handle.provider,
          providerModelId: result.handle.modelId,
          providerMeta: (result.handle.meta ?? {}) as object,
          totalSeconds: result.totalSeconds,
          qualityScore: result.qualityScore,
          readyAt: new Date(),
          failureReason: null,
        },
      });
    });

    await generatePreview(model.id, data.userId, result.handle, deps).catch((error) => {
      // La previsualización es un extra: que falle no invalida un modelo que
      // ya está entrenado y utilizable.
      logger.warn({ err: error, voiceModelId: model.id }, 'No se pudo generar la previsualización');
    });

    await reporter.succeeded(model.id, 'Tu voz está lista');
  } catch (error) {
    const jobError =
      error instanceof JobError
        ? error
        : new JobError('internal', error instanceof Error ? error.message : String(error), true);

    logger.error(
      { err: error, jobId: data.jobId, code: jobError.code },
      'Falló el entrenamiento de voz',
    );

    // Un error transitorio deja que BullMQ reintente: no se marca fallido ni
    // se reembolsa todavía, porque el trabajo aún puede salir bien.
    if (jobError.retryable) throw error;

    await prisma.voiceModel.update({
      where: { id: model.id },
      data: { status: 'FAILED', failureReason: jobError.userMessage },
    });

    await reporter.failed(jobError.code, jobError.userMessage, jobError.detail);
    await refundJobCredits(data.jobId);
  }
}

/**
 * Fragmento cantado corto con el modelo recién entrenado.
 *
 * Su valor es que el usuario oye su voz inmediatamente, sin gastar créditos
 * en una canción entera para descubrir si el entrenamiento salió bien.
 */
async function generatePreview(
  voiceModelId: string,
  userId: string,
  handle: { provider: string; modelId: string },
  deps: HandlerDeps,
): Promise<void> {
  const { providers, storage } = deps;

  const composition = await providers.music.compose({
    title: 'Preview',
    genre: 'pop',
    language: 'es',
    bpm: 100,
    prompt: 'short warm vocal phrase, simple piano accompaniment',
    durationSeconds: 10,
    instrumental: false,
    sections: [{ kind: 'chorus', durationSeconds: 10, lines: ['la la la'] }],
  });

  const stems = composition.stems ?? (await providers.separator.separate(composition.mix));

  const converted = await providers.converter.convert(stems.vocals, {
    handle,
    pitchShift: 0,
    timbre: 'natural',
  });

  const mixed = await providers.mixer.mix(converted, stems.instrumental);
  const mp3 = await providers.encoder.encode(mixed, 'mp3');

  const key = storageKeys.voicePreview(userId, voiceModelId);
  await storage.put(key, mp3.data, 'audio/mpeg');

  await prisma.voiceModel.update({ where: { id: voiceModelId }, data: { previewKey: key } });
}
