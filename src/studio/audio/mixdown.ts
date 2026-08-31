import type { Pattern, Take } from "@/studio/types";
import { DRUM_VOICES } from "@/studio/types";
import { triggerVoice } from "./drums";
import type { EngineSettings } from "./engine";

export interface MixOptions {
  pattern: Pattern;
  takes: Take[];
  settings: EngineSettings;
  includeBeat: boolean;
  /** Cola de silencio al final, en segundos. */
  tail?: number;
}

/** Renderiza el tema entero (beat + tomas) fuera de tiempo real. */
export async function renderMix({
  pattern,
  takes,
  settings,
  includeBeat,
  tail = 1.5,
}: MixOptions): Promise<AudioBuffer> {
  const sampleRate = takes[0]?.buffer.sampleRate ?? 48000;
  const stepSeconds = ((60 / settings.bpm) * 4) / settings.stepsPerBar;
  const barSeconds = stepSeconds * settings.stepsPerBar;

  let lastTakeEnd = 0;
  for (const take of takes) {
    lastTakeEnd = Math.max(lastTakeEnd, Math.max(0, take.offset) + take.buffer.duration);
  }
  const bars = Math.max(settings.bars, Math.ceil(lastTakeEnd / barSeconds) || settings.bars);
  const duration = Math.max(bars * barSeconds, lastTakeEnd) + tail;

  const ctx = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate);
  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);

  const beatBus = ctx.createGain();
  beatBus.gain.value = 0.85;
  beatBus.connect(master);
  const takeBus = ctx.createGain();
  takeBus.gain.value = 1;
  takeBus.connect(master);

  if (includeBeat) {
    const loopSteps = settings.stepsPerBar * settings.bars;
    const totalSteps = settings.stepsPerBar * bars;
    for (let step = 0; step < totalSteps; step++) {
      const swing = step % 2 === 1 ? settings.swing * 0.5 * stepSeconds : 0;
      const time = step * stepSeconds + swing;
      const index = step % loopSteps;
      for (const voice of DRUM_VOICES) {
        const velocity = pattern[voice]?.[index] ?? 0;
        if (velocity > 0) {
          triggerVoice(ctx, beatBus, voice, time, { velocity, subMidi: settings.subMidi });
        }
      }
    }
  }

  const anySolo = takes.some((t) => t.soloed);
  for (const take of takes) {
    const audible = anySolo ? take.soloed : !take.muted;
    if (!audible) continue;
    const source = ctx.createBufferSource();
    source.buffer = take.buffer;
    const gain = ctx.createGain();
    gain.gain.value = take.gain;
    source.connect(gain).connect(takeBus);
    // Una toma que empieza antes del compas 1 (cuenta de entrada) se recorta.
    if (take.offset >= 0) source.start(take.offset);
    else source.start(0, Math.min(take.buffer.duration, -take.offset));
  }

  return ctx.startRendering();
}

/** Empaqueta un AudioBuffer como WAV PCM 16 bits. */
export function encodeWav(buffer: AudioBuffer): Blob {
  const channels = Math.min(2, buffer.numberOfChannels);
  const length = buffer.length;
  const bytes = 44 + length * channels * 2;
  const view = new DataView(new ArrayBuffer(bytes));

  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeString(0, "RIFF");
  view.setUint32(4, bytes - 8, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, length * channels * 2, true);

  const data: Float32Array[] = [];
  for (let ch = 0; ch < channels; ch++) data.push(buffer.getChannelData(ch));

  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < channels; ch++) {
      const sample = Math.max(-1, Math.min(1, data[ch][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([view], { type: "audio/wav" });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
