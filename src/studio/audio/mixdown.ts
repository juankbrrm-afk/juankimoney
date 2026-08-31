import type { Pattern, Take } from "@/studio/types";
import { DRUM_VOICES } from "@/studio/types";
import { triggerVoice } from "./drums";
import { notasAcorde, triggerAcorde, triggerBajo } from "./instrumentos";
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
      const compas = Math.floor(step / settings.stepsPerBar);
      const acordes = settings.acordes;
      const grado = acordes.length ? acordes[compas % acordes.length] : 0;

      if (acordes.length && step % settings.stepsPerBar === 0) {
        triggerAcorde(
          ctx,
          beatBus,
          notasAcorde(settings.subMidi + grado + 24, settings.modo),
          time,
          barSeconds * 0.95
        );
      }

      for (const voice of DRUM_VOICES) {
        const velocity = pattern[voice]?.[index] ?? 0;
        if (velocity === 0) continue;
        if (voice === "sub") {
          triggerBajo(ctx, beatBus, settings.subMidi + grado, time, stepSeconds * 3, velocity);
        } else {
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
  // Margen largo antes de soltar la URL: en el movil una descarga grande sigue
  // leyendo del blob un rato despues del clic, y revocarla antes la aborta.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** true si el sistema puede abrir su menu de compartir con un archivo de audio. */
export function canShareAudio(): boolean {
  if (typeof navigator === "undefined" || !navigator.share || !navigator.canShare) return false;
  try {
    const probe = new File([new Uint8Array([0])], "prueba.m4a", { type: "audio/mp4" });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

/**
 * Abre el menu de compartir del sistema con la cancion.
 *
 * Tiene que llamarse desde el toque, sin nada esperando por delante: iOS exige
 * que `share` nazca de un gesto. Por eso la cancion se prepara en un paso y se
 * comparte en otro, en vez de hacerlo todo de una.
 */
export async function shareAudio(blob: Blob, filename: string, title: string): Promise<boolean> {
  const file = new File([blob], filename, { type: blob.type || "audio/mp4" });
  if (!navigator.canShare?.({ files: [file] })) return false;
  try {
    await navigator.share({ files: [file], title });
    return true;
  } catch (error) {
    // Cancelar el menu tambien llega aqui, y no es un fallo.
    if ((error as { name?: string } | null)?.name === "AbortError") return true;
    throw error;
  }
}

/**
 * Codifica la mezcla a un formato comprimido pasandola por MediaRecorder.
 *
 * El contexto se recibe prestado a proposito (ver dentro).
 *
 * Hace falta cuando la pagina corre dentro de un visor que solo acepta ciertos
 * formatos: el WAV crudo no esta en esa lista, pero el m4a y el webm si. El
 * inconveniente es que MediaRecorder graba en tiempo real, asi que codificar un
 * tema de dos minutos tarda dos minutos.
 */
export async function encodeCompressed(
  ctx: AudioContext,
  buffer: AudioBuffer,
  onProgress?: (ratio: number) => void
): Promise<{ blob: Blob; extension: "mp4" | "webm"; audioExtension: "m4a" | "webm" } | null> {
  if (typeof MediaRecorder === "undefined") return null;
  // `extension` es la que admite el puente de descargas del visor; `audioExtension`
  // es la que quieres en el movil, donde un .m4a se reconoce como cancion y un
  // .mp4 se abre esperando video.
  const candidates: [string, "mp4" | "webm", "m4a" | "webm"][] = [
    ["audio/mp4", "mp4", "m4a"],
    ["audio/webm;codecs=opus", "webm", "webm"],
    ["audio/webm", "webm", "webm"],
  ];
  const picked = candidates.find(([type]) => MediaRecorder.isTypeSupported(type));
  if (!picked) return null;
  const [mimeType, extension, audioExtension] = picked;

  // Se reutiliza el contexto que ya está sonando en vez de abrir otro. Abrir un
  // segundo AudioContext mientras el micrófono sigue capturando deja el nuevo
  // sin arrancar en algunos navegadores: su reloj no avanza y la codificación
  // se queda esperando para siempre.
  if (ctx.state === "suspended") await ctx.resume();
  try {
    const destination = ctx.createMediaStreamDestination();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(destination);

    const recorder = new MediaRecorder(destination.stream, { mimeType, audioBitsPerSecond: 192000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });

    recorder.start();
    const startedAt = ctx.currentTime;
    source.start();

    await new Promise<void>((resolve) => {
      const tick = () => {
        const ratio = Math.min(1, (ctx.currentTime - startedAt) / buffer.duration);
        onProgress?.(ratio);
        if (ratio >= 1) resolve();
        else setTimeout(tick, 200);
      };
      tick();
    });
    // Un respiro para que entre la ultima cola antes de cerrar.
    await new Promise((resolve) => setTimeout(resolve, 250));
    recorder.stop();
    await stopped;

    source.disconnect();
    destination.disconnect();
    return { blob: new Blob(chunks, { type: mimeType }), extension, audioExtension };
  } finally {
    // El contexto es prestado: no se cierra aquí.
  }
}

/** El puente de descarga del visor, si lo hay. Fuera de el, null. */
export async function viewerDownloads() {
  try {
    return (await window.claude?.use("downloads")) ?? null;
  } catch {
    return null;
  }
}
