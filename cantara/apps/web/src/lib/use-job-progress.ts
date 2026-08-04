'use client';

import { useEffect, useRef, useState } from 'react';
import {
  computeProgress,
  isTerminal,
  stageSpecs,
  type JobProgressEvent,
  type JobStatus,
  type JobType,
} from '@cantara/shared';
import { BASE_URL } from './api';

export interface JobProgressState {
  readonly status: JobStatus;
  readonly stage: string | null;
  readonly progress: number;
  readonly message: string;
  readonly error: string | null;
  readonly resultId: string | null;
  /** Etapas ya completadas, para pintar la lista de pasos. */
  readonly completedStages: readonly string[];
  readonly connected: boolean;
}

const INITIAL: JobProgressState = {
  status: 'queued',
  stage: null,
  progress: 0,
  message: 'En cola',
  error: null,
  resultId: null,
  completedStages: [],
  connected: false,
};

/**
 * Sigue un trabajo por Server-Sent Events.
 *
 * `EventSource` reconecta solo cuando se cae la red, que es justo lo que hace
 * falta en un proceso de varios minutos sobre una conexión móvil. Cuando el
 * trabajo termina, se cierra explícitamente: sin eso, el navegador
 * reintentaría indefinidamente contra un stream que el servidor ya cerró.
 */
export function useJobProgress(
  jobId: string | null,
  type: JobType,
  onFinished?: (state: JobProgressState) => void,
): JobProgressState {
  const [state, setState] = useState<JobProgressState>(INITIAL);

  // La callback vive en una ref para que cambiarla no reabra la conexión: un
  // padre que se re-renderiza no debe reiniciar el stream.
  const finishedRef = useRef(onFinished);
  finishedRef.current = onFinished;

  useEffect(() => {
    if (!jobId) {
      setState(INITIAL);
      return;
    }

    const source = new EventSource(`${BASE_URL}/api/jobs/${jobId}/stream`, {
      withCredentials: true,
    });

    source.addEventListener('open', () => {
      setState((previous) => ({ ...previous, connected: true }));
    });

    source.addEventListener('message', (event) => {
      let payload: JobProgressEvent;
      try {
        payload = JSON.parse(event.data as string) as JobProgressEvent;
      } catch {
        return;
      }

      setState((previous) => {
        const specs = stageSpecs(type);
        const index = payload.stage ? specs.findIndex((spec) => spec.id === payload.stage) : -1;

        // Se consideran completadas todas las etapas anteriores a la actual.
        // Reconstruirlo así, en vez de acumular eventos, hace que reconectar
        // a mitad de trabajo muestre el estado correcto en lugar de una lista
        // vacía.
        const completedStages =
          index > 0 ? specs.slice(0, index).map((spec) => spec.id) : previous.completedStages;

        const next: JobProgressState = {
          status: payload.status,
          stage: payload.stage,
          // La barra nunca retrocede: un evento reordenado por la red no debe
          // hacer que el usuario vea perder progreso.
          progress: Math.max(previous.progress, payload.progress),
          message: payload.message,
          error: payload.error ?? null,
          resultId: payload.resultId ?? null,
          completedStages:
            payload.status === 'succeeded' ? specs.map((spec) => spec.id) : completedStages,
          connected: true,
        };

        if (isTerminal(payload.status)) {
          source.close();
          // Se aplaza fuera del setState: invocar una callback del padre
          // durante el render de este componente provocaría un aviso de React.
          queueMicrotask(() => finishedRef.current?.(next));
        }

        return next;
      });
    });

    source.addEventListener('error', () => {
      // No se cierra: EventSource reintenta solo. Solo se refleja en la UI
      // que el enlace está caído, y el trabajo sigue corriendo en el servidor.
      setState((previous) => ({ ...previous, connected: false }));
    });

    return () => source.close();
  }, [jobId, type]);

  return state;
}

/** Progreso estimado de una etapa, para pintar el paso actual sin evento. */
export function estimateStageProgress(type: JobType, stage: string): number {
  return computeProgress(type, stage, 0.5);
}
