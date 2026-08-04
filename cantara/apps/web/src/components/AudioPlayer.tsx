'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { formatDuration } from '@cantara/shared';

/**
 * Reproductor con forma de onda.
 *
 * La onda se dibuja a partir de los picos que el pipeline ya calculó y guardó
 * en base de datos: analizar el audio en el navegador obligaría a descargar
 * el archivo completo antes de poder mostrar nada, y con MP3 de varios megas
 * eso es medio segundo de pantalla vacía por cada canción del historial.
 *
 * El canvas se redibuja solo cuando cambia el bucket bajo el cursor, no en
 * cada frame: un `requestAnimationFrame` continuo por cada canción visible
 * calentaría el móvil sin que se note diferencia alguna.
 */
export function AudioPlayer({
  src,
  waveform,
  durationSeconds,
  title,
  compact = false,
}: {
  src: string;
  waveform: number[] | null;
  durationSeconds: number | null;
  title?: string;
  compact?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationSeconds ?? 0);
  const [loading, setLoading] = useState(false);

  const peaks = waveform ?? FALLBACK_WAVEFORM;
  const progress = duration > 0 ? currentTime / duration : 0;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    // El canvas se dimensiona en píxeles físicos; sin esto la onda se ve
    // borrosa en pantallas de alta densidad.
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    if (canvas.width !== width * ratio || canvas.height !== height * ratio) {
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      context.scale(ratio, ratio);
    }

    context.clearRect(0, 0, width, height);

    const barCount = peaks.length;
    const gap = compact ? 1 : 2;
    const barWidth = Math.max(1, width / barCount - gap);
    const playedUntil = progress * barCount;

    for (let i = 0; i < barCount; i += 1) {
      const peak = peaks[i] ?? 0;
      // Altura mínima para que los silencios sigan dibujando una línea y la
      // onda no aparezca cortada.
      const barHeight = Math.max(2, peak * height * 0.9);
      const x = i * (barWidth + gap);
      const y = (height - barHeight) / 2;

      context.fillStyle = i <= playedUntil ? '#a855f7' : 'rgba(255,255,255,0.16)';
      context.beginPath();
      context.roundRect(x, y, barWidth, barHeight, barWidth / 2);
      context.fill();
    }
  }, [peaks, progress, compact]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const observer = new ResizeObserver(() => draw());
    if (canvasRef.current) observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, [draw]);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (playing) {
      audio.pause();
      return;
    }

    // Otra canción sonando a la vez es siempre un error del usuario, nunca su
    // intención: se pausan las demás antes de arrancar esta.
    for (const other of document.querySelectorAll('audio')) {
      if (other !== audio) other.pause();
    }

    setLoading(true);
    try {
      await audio.play();
    } catch {
      // El navegador puede bloquear la reproducción automática; el usuario
      // volverá a pulsar y entonces sí habrá gesto que lo permita.
    } finally {
      setLoading(false);
    }
  };

  const seek = (event: React.MouseEvent<HTMLDivElement> | React.KeyboardEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || duration === 0) return;

    if ('key' in event) {
      // Flechas: saltos de 5 segundos, el estándar de facto en reproductores.
      const delta = event.key === 'ArrowRight' ? 5 : event.key === 'ArrowLeft' ? -5 : 0;
      if (delta === 0) return;
      event.preventDefault();
      audio.currentTime = Math.max(0, Math.min(duration, audio.currentTime + delta));
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    audio.currentTime = ((event.clientX - rect.left) / rect.width) * duration;
  };

  return (
    <div className={clsx('flex items-center gap-3', compact ? 'gap-2.5' : 'gap-4')}>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrentTime(0);
        }}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => {
          const value = event.currentTarget.duration;
          if (Number.isFinite(value)) setDuration(value);
        }}
      />

      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? `Pausar ${title ?? 'canción'}` : `Reproducir ${title ?? 'canción'}`}
        className={clsx(
          'flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent-500 to-accent-600 text-white',
          'shadow-lg shadow-accent-600/25 transition-transform hover:scale-105 active:scale-95',
          compact ? 'size-9' : 'size-12',
        )}
      >
        {loading ? (
          <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.3" />
            <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
        ) : playing ? (
          <svg className={compact ? 'size-3.5' : 'size-5'} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        ) : (
          <svg
            className={clsx(compact ? 'size-3.5' : 'size-5', 'ml-0.5')}
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden
          >
            <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14Z" />
          </svg>
        )}
      </button>

      <div
        role="slider"
        tabIndex={0}
        aria-label="Posición de reproducción"
        aria-valuenow={Math.round(progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${formatDuration(currentTime)} de ${formatDuration(duration)}`}
        onClick={seek}
        onKeyDown={seek}
        className="min-w-0 flex-1 cursor-pointer"
      >
        <canvas ref={canvasRef} className={clsx('w-full', compact ? 'h-8' : 'h-14')} />
      </div>

      <span
        className={clsx(
          // Cifras tabulares: sin esto el tiempo baila al pasar de 0:09 a 0:10.
          'shrink-0 font-mono text-xs text-ink-400 tabular-nums',
          compact ? 'w-16' : 'w-24',
        )}
      >
        {formatDuration(currentTime)}
        {!compact && ` / ${formatDuration(duration)}`}
      </span>
    </div>
  );
}

/** Onda de reserva para versiones antiguas sin picos guardados. */
const FALLBACK_WAVEFORM = Array.from({ length: 120 }, (_, i) =>
  Number((0.25 + 0.45 * Math.abs(Math.sin(i / 6))).toFixed(3)),
);
