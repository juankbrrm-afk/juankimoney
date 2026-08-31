import { useEffect, useRef } from "react";
import { peaks, toMono } from "@/studio/audio/buffers";

export interface WaveMarker {
  time: number;
  color: string;
  label?: string;
}

/**
 * Forma de onda en canvas con la rejilla del tema encima: sirve para ver de un
 * vistazo si las silabas caen sobre el beat o entre medias.
 */
export function Waveform({
  buffer,
  markers = [],
  gridSeconds,
  gridOffset = 0,
  height = 96,
}: {
  buffer: AudioBuffer;
  markers?: WaveMarker[];
  /** Separacion de la rejilla en segundos (una semicorchea, normalmente). */
  gridSeconds?: number;
  /** Desfase de la rejilla respecto al inicio del buffer. */
  gridOffset?: number;
  height?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.floor(height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const duration = buffer.duration || 1;
    const middle = height / 2;

    if (gridSeconds && gridSeconds > 0) {
      let index = 0;
      for (let t = gridOffset; t < duration; t += gridSeconds, index++) {
        const x = (t / duration) * width;
        ctx.strokeStyle = index % 4 === 0 ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.07)";
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
    }

    const columns = Math.max(1, Math.floor(width));
    const envelope = peaks(toMono(buffer), columns);
    ctx.fillStyle = "rgba(163,230,53,0.85)";
    for (let c = 0; c < columns; c++) {
      const min = envelope[c * 2];
      const max = envelope[c * 2 + 1];
      const top = middle - max * middle * 0.92;
      const bottom = middle - min * middle * 0.92;
      ctx.fillRect(c, top, 1, Math.max(1, bottom - top));
    }

    for (const marker of markers) {
      const x = (marker.time / duration) * width;
      ctx.strokeStyle = marker.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      if (marker.label) {
        ctx.fillStyle = marker.color;
        ctx.font = "10px ui-monospace, monospace";
        ctx.fillText(marker.label, x + 3, 11);
      }
    }
  }, [buffer, markers, gridSeconds, gridOffset, height]);

  return <canvas ref={ref} className="w-full rounded-lg bg-neutral-950" style={{ height }} />;
}
