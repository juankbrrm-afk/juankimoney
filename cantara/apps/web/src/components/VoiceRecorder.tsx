'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { VOICE_SAMPLE_LIMITS, formatDuration } from '@cantara/shared';
import { Button } from './ui';

/**
 * Grabadora de voz en el navegador.
 *
 * Dos detalles marcan la diferencia entre una grabadora usable y una que
 * produce material inservible para entrenar:
 *
 * 1. **Medidor de nivel en vivo.** Sin él, el usuario descubre que grabó
 *    demasiado bajo (o saturado) tres minutos después, cuando el análisis lo
 *    rechaza. Con él, lo corrige al instante.
 * 2. **Cancelación de eco y supresión de ruido desactivadas.** Están pensadas
 *    para videollamadas y destruyen los matices del timbre que el modelo
 *    necesita aprender. Se pide audio lo más crudo posible.
 */
export function VoiceRecorder({
  onRecorded,
  disabled,
}: {
  onRecorded: (blob: Blob, durationSeconds: number) => void;
  disabled?: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const frameRef = useRef<number>(0);
  const startedAtRef = useRef(0);

  useEffect(() => {
    setSupported(
      typeof navigator !== 'undefined' &&
        typeof navigator.mediaDevices?.getUserMedia === 'function' &&
        typeof MediaRecorder !== 'undefined',
    );
  }, []);

  const cleanup = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void contextRef.current?.close();
    contextRef.current = null;
    setLevel(0);
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = async () => {
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // Estos tres procesados están pensados para inteligibilidad en
          // llamadas, no para clonar un timbre. Activarlos aplana justo lo
          // que hace reconocible una voz.
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
          sampleRate: 44_100,
        },
      });

      streamRef.current = stream;

      // Medidor de nivel: analizador ligero sobre el mismo stream.
      const context = new AudioContext();
      contextRef.current = context;
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      context.createMediaStreamSource(stream).connect(analyser);

      const buffer = new Float32Array(analyser.fftSize);
      const tick = () => {
        analyser.getFloatTimeDomainData(buffer);
        let sum = 0;
        for (const sample of buffer) sum += sample * sample;
        setLevel(Math.min(1, Math.sqrt(sum / buffer.length) * 4));
        frameRef.current = requestAnimationFrame(tick);
      };
      tick();

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 128_000 });
      chunksRef.current = [];

      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      });

      recorder.addEventListener('stop', () => {
        const duration = (Date.now() - startedAtRef.current) / 1000;
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        cleanup();
        setRecording(false);
        setElapsed(0);

        if (duration >= VOICE_SAMPLE_LIMITS.minClipSeconds) {
          onRecorded(blob, duration);
        } else {
          setError(`La grabación debe durar al menos ${VOICE_SAMPLE_LIMITS.minClipSeconds} segundos.`);
        }
      });

      recorder.start(1000);
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setRecording(true);
    } catch (caught) {
      cleanup();
      setError(
        caught instanceof DOMException && caught.name === 'NotAllowedError'
          ? 'Necesitamos permiso para usar el micrófono. Actívalo en los ajustes del navegador.'
          : 'No pudimos acceder al micrófono.',
      );
    }
  };

  const stop = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
  }, []);

  useEffect(() => {
    if (!recording) return;

    const timer = setInterval(() => {
      const seconds = (Date.now() - startedAtRef.current) / 1000;
      setElapsed(seconds);
      // Corte automático: pasado el máximo por clip, seguir grabando produce
      // material que el servidor rechazaría de todos modos.
      if (seconds >= VOICE_SAMPLE_LIMITS.maxClipSeconds) stop();
    }, 200);

    return () => clearInterval(timer);
  }, [recording, stop]);

  if (!supported) {
    return (
      <p className="rounded-[--radius-control] border border-ink-800 bg-ink-900 px-4 py-3 text-sm text-ink-400">
        Tu navegador no permite grabar audio. Puedes subir archivos igualmente.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 rounded-[--radius-card] border border-ink-800 bg-ink-900 p-4">
        <Button
          type="button"
          variant={recording ? 'danger' : 'secondary'}
          size="lg"
          onClick={recording ? stop : start}
          disabled={disabled}
          className="shrink-0"
        >
          {recording ? (
            <>
              <span className="size-3 rounded-sm bg-current" aria-hidden />
              Detener
            </>
          ) : (
            <>
              <span className="size-3 rounded-full bg-danger" aria-hidden />
              Grabar
            </>
          )}
        </Button>

        <div className="min-w-0 flex-1">
          {recording ? (
            <>
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-sm text-ink-100 tabular-nums">
                  {formatDuration(elapsed)}
                </span>
                <span className="text-xs text-ink-600">
                  máx. {formatDuration(VOICE_SAMPLE_LIMITS.maxClipSeconds)}
                </span>
              </div>
              <LevelMeter level={level} />
            </>
          ) : (
            <p className="text-sm text-ink-400">
              Habla o canta con naturalidad. Un sitio silencioso y el micrófono a un palmo dan el
              mejor resultado.
            </p>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Medidor de nivel con zonas.
 *
 * Verde es el rango útil, ámbar avisa de que se acerca al techo y rojo marca
 * saturación — el defecto que más penaliza el análisis de calidad, porque es
 * distorsión irreversible.
 */
function LevelMeter({ level }: { level: number }) {
  const segments = 24;
  const active = Math.round(level * segments);

  return (
    <div className="mt-2 flex h-3 gap-[3px]" aria-hidden>
      {Array.from({ length: segments }, (_, i) => {
        const isActive = i < active;
        const tone =
          i > segments * 0.88 ? 'bg-danger' : i > segments * 0.7 ? 'bg-warning' : 'bg-success';

        return (
          <span
            key={i}
            className={clsx(
              'flex-1 rounded-[2px] transition-colors duration-75',
              isActive ? tone : 'bg-ink-800',
            )}
          />
        );
      })}
    </div>
  );
}
