/**
 * Publicación del progreso.
 *
 * Cada transición se escribe en Postgres **y** se publica en Redis. La
 * duplicidad es deliberada: Redis da inmediatez a quien está mirando la
 * pantalla ahora mismo, y Postgres permite que quien recarga cinco minutos
 * después recupere el estado exacto. Perder Redis pierde fluidez; perder la
 * escritura en Postgres perdería el trabajo.
 */

import type { Redis } from 'ioredis';
import { prisma } from '@cantara/db';
import {
  computeProgress,
  progressChannel,
  stageLabel,
  type JobProgressEvent,
  type JobStatus,
  type JobType,
} from '@cantara/shared';

export class ProgressReporter {
  /**
   * Último porcentaje publicado. Sirve para dos cosas: no publicar dos veces
   * el mismo valor —el ruido en Redis no aporta nada— y garantizar que la
   * barra jamás retroceda aunque una etapa reporte fuera de orden.
   */
  private lastProgress = -1;

  constructor(
    private readonly redis: Redis,
    private readonly jobId: string,
    private readonly type: JobType,
  ) {}

  async stage(stage: string, fraction: number, note?: string): Promise<void> {
    const progress = computeProgress(this.type, stage, fraction);
    if (progress <= this.lastProgress) return;

    this.lastProgress = progress;
    const message = note ?? stageLabel(this.type, stage);

    await prisma.job.update({
      where: { id: this.jobId },
      data: { stage, progress, message, status: 'running' },
    });

    await this.publish({
      jobId: this.jobId,
      type: this.type,
      status: 'running',
      stage,
      progress,
      message,
      at: new Date().toISOString(),
    });
  }

  async started(): Promise<void> {
    await prisma.job.update({
      where: { id: this.jobId },
      data: { status: 'running', startedAt: new Date(), message: 'Empezando' },
    });

    await this.publish({
      jobId: this.jobId,
      type: this.type,
      status: 'running',
      stage: null,
      progress: 0,
      message: 'Empezando',
      at: new Date().toISOString(),
    });
  }

  async succeeded(resultId: string, message = 'Listo'): Promise<void> {
    await prisma.job.update({
      where: { id: this.jobId },
      data: { status: 'succeeded', progress: 100, message, finishedAt: new Date() },
    });

    await this.publish({
      jobId: this.jobId,
      type: this.type,
      status: 'succeeded',
      stage: null,
      progress: 100,
      message,
      resultId,
      at: new Date().toISOString(),
    });
  }

  async failed(code: string, userMessage: string, detail?: string): Promise<void> {
    await prisma.job.update({
      where: { id: this.jobId },
      data: {
        status: 'failed',
        message: userMessage,
        errorCode: code,
        // Solo el mensaje para el usuario sale de aquí; el detalle técnico va
        // al log, no a la pantalla de nadie.
        errorMessage: userMessage,
        finishedAt: new Date(),
      },
    });

    void detail;

    await this.publish({
      jobId: this.jobId,
      type: this.type,
      status: 'failed',
      stage: null,
      progress: this.lastProgress < 0 ? 0 : this.lastProgress,
      message: userMessage,
      error: userMessage,
      at: new Date().toISOString(),
    });
  }

  private async publish(event: JobProgressEvent): Promise<void> {
    // Un fallo al publicar no debe tumbar el trabajo: el estado ya está en
    // Postgres y el cliente lo recuperará al reconectar.
    await this.redis
      .publish(progressChannel(this.jobId), JSON.stringify(event))
      .catch(() => undefined);
  }
}

/** Estado terminal del trabajo, para decidir si aún hay que reembolsar. */
export async function jobStatus(jobId: string): Promise<JobStatus | null> {
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { status: true } });
  return (job?.status as JobStatus) ?? null;
}
