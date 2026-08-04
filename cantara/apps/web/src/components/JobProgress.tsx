'use client';

import clsx from 'clsx';
import { stageSpecs, type JobType } from '@cantara/shared';
import { useJobProgress, type JobProgressState } from '@/lib/use-job-progress';
import { Alert, ProgressBar } from './ui';

/**
 * Progreso de un trabajo largo.
 *
 * Muestra la lista completa de etapas, no solo la actual. En un proceso de
 * varios minutos, ver qué falta es lo que convierte la espera en algo
 * comprensible: un porcentaje suelto no dice si quedan diez segundos o tres
 * minutos.
 */
export function JobProgress({
  jobId,
  type,
  onFinished,
  className,
}: {
  jobId: string;
  type: JobType;
  onFinished?: (state: JobProgressState) => void;
  className?: string;
}) {
  const state = useJobProgress(jobId, type, onFinished);
  const specs = stageSpecs(type);

  const currentIndex = state.stage ? specs.findIndex((spec) => spec.id === state.stage) : -1;

  if (state.status === 'failed') {
    return (
      <div className={className}>
        <Alert tone="danger">
          <strong className="block font-medium">No pudimos completarlo</strong>
          <span className="mt-0.5 block">{state.error ?? state.message}</span>
        </Alert>
      </div>
    );
  }

  return (
    <div className={clsx('space-y-4', className)}>
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-sm font-medium text-ink-100">
          {state.message}
          {!state.connected && state.status !== 'succeeded' && (
            // La reconexión es automática; se avisa para que un parón no se
            // interprete como que el trabajo se ha perdido.
            <span className="ml-2 text-xs font-normal text-ink-600">reconectando…</span>
          )}
        </p>
        <span className="font-mono text-sm text-accent-300 tabular-nums">{state.progress}%</span>
      </div>

      <ProgressBar value={state.progress} label={state.message} />

      <ol className="space-y-2">
        {specs.map((spec, index) => {
          const done =
            state.status === 'succeeded' ||
            state.completedStages.includes(spec.id) ||
            (currentIndex >= 0 && index < currentIndex);
          const active = !done && index === currentIndex;

          return (
            <li
              key={spec.id}
              className={clsx(
                'flex items-center gap-3 text-sm transition-colors',
                done ? 'text-ink-400' : active ? 'text-ink-100' : 'text-ink-700',
              )}
            >
              <span
                className={clsx(
                  'flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px]',
                  done
                    ? 'border-success/40 bg-success/15 text-success'
                    : active
                      ? 'border-accent-500 bg-accent-500/15 text-accent-300'
                      : 'border-ink-800 text-ink-700',
                )}
                aria-hidden
              >
                {done ? '✓' : active ? '●' : index + 1}
              </span>
              <span className={clsx(active && 'font-medium')}>{spec.label}</span>
              {active && (
                <span
                  className="ml-auto text-xs text-ink-600"
                  style={{ animation: 'pulse-soft 1.8s ease-in-out infinite' }}
                >
                  en curso
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
