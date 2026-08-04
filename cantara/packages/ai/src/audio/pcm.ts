/**
 * Primitivas de audio en JavaScript puro.
 *
 * Existen para que el pipeline completo pueda ejecutarse sin ffmpeg ni GPU:
 * el proveedor `local` las usa para sintetizar y procesar audio real, y los
 * tests de integración corren sobre ellas. En producción, los adaptadores de
 * ffmpeg sustituyen las operaciones pesadas — pero el contrato es el mismo.
 */

/** Audio descodificado: un Float32Array por canal, muestras en [-1, 1]. */
export interface Pcm {
  readonly channels: Float32Array[];
  readonly sampleRate: number;
}

export function channelCount(pcm: Pcm): number {
  return pcm.channels.length;
}

export function frameCount(pcm: Pcm): number {
  return pcm.channels[0]?.length ?? 0;
}

export function durationSeconds(pcm: Pcm): number {
  return frameCount(pcm) / pcm.sampleRate;
}

// ── WAV ──────────────────────────────────────────────────────

const RIFF = 0x46464952; // "RIFF" en little-endian
const WAVE = 0x45564157; // "WAVE"

/**
 * Descodifica un WAV PCM (8/16/24/32 bits enteros o 32 bits float).
 *
 * Recorre los chunks en lugar de asumir el layout canónico de 44 bytes:
 * muchos grabadores insertan chunks `LIST` o `fact` antes de `data`, y dar
 * por hecho el offset produce ruido blanco en vez de audio.
 */
export function decodeWav(bytes: Uint8Array): Pcm {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (bytes.byteLength < 12 || view.getUint32(0, true) !== RIFF || view.getUint32(8, true) !== WAVE) {
    throw new Error('No es un archivo WAV válido');
  }

  let offset = 12;
  let format = 1;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let dataStart = -1;
  let dataLength = 0;

  while (offset + 8 <= bytes.byteLength) {
    const chunkId = view.getUint32(offset, true);
    const chunkSize = view.getUint32(offset + 4, true);
    const body = offset + 8;

    // "fmt "
    if (chunkId === 0x20746d66) {
      format = view.getUint16(body, true);
      channels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bitsPerSample = view.getUint16(body + 14, true);
    } else if (chunkId === 0x61746164) {
      // "data"
      dataStart = body;
      dataLength = Math.min(chunkSize, bytes.byteLength - body);
    }

    // Los chunks se alinean a bordes pares.
    offset = body + chunkSize + (chunkSize % 2);
  }

  if (dataStart < 0 || channels === 0 || sampleRate === 0) {
    throw new Error('WAV incompleto: faltan los chunks fmt o data');
  }

  const bytesPerSample = bitsPerSample / 8;
  const frames = Math.floor(dataLength / (bytesPerSample * channels));
  const output = Array.from({ length: channels }, () => new Float32Array(frames));

  for (let frame = 0; frame < frames; frame += 1) {
    for (let ch = 0; ch < channels; ch += 1) {
      const at = dataStart + (frame * channels + ch) * bytesPerSample;
      output[ch]![frame] = readSample(view, at, bitsPerSample, format);
    }
  }

  return { channels: output, sampleRate };
}

function readSample(view: DataView, at: number, bits: number, format: number): number {
  if (format === 3) return view.getFloat32(at, true);

  switch (bits) {
    case 8:
      // WAV de 8 bits es sin signo con offset 128.
      return (view.getUint8(at) - 128) / 128;
    case 16:
      return view.getInt16(at, true) / 32_768;
    case 24: {
      const lo = view.getUint8(at);
      const mid = view.getUint8(at + 1);
      const hi = view.getInt8(at + 2);
      return ((hi << 16) | (mid << 8) | lo) / 8_388_608;
    }
    case 32:
      return view.getInt32(at, true) / 2_147_483_648;
    default:
      throw new Error(`Profundidad de bits no soportada: ${bits}`);
  }
}

/** Codifica PCM a WAV entero (16 o 24 bits). */
export function encodeWav(pcm: Pcm, bitDepth: 16 | 24 = 24): Uint8Array {
  const channels = channelCount(pcm);
  const frames = frameCount(pcm);
  const bytesPerSample = bitDepth / 8;
  const dataSize = frames * channels * bytesPerSample;

  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM entero
  view.setUint16(22, channels, true);
  view.setUint32(24, pcm.sampleRate, true);
  view.setUint32(28, pcm.sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, bitDepth, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let at = 44;
  for (let frame = 0; frame < frames; frame += 1) {
    for (let ch = 0; ch < channels; ch += 1) {
      const value = clamp(pcm.channels[ch]![frame] ?? 0);
      if (bitDepth === 16) {
        view.setInt16(at, Math.round(value * 32_767), true);
      } else {
        const scaled = Math.round(value * 8_388_607);
        view.setUint8(at, scaled & 0xff);
        view.setUint8(at + 1, (scaled >> 8) & 0xff);
        view.setUint8(at + 2, (scaled >> 16) & 0xff);
      }
      at += bytesPerSample;
    }
  }

  return new Uint8Array(buffer);
}

function writeAscii(view: DataView, at: number, text: string): void {
  for (let i = 0; i < text.length; i += 1) view.setUint8(at + i, text.charCodeAt(i));
}

function clamp(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

// ── Transformaciones ─────────────────────────────────────────

export function toMono(pcm: Pcm): Pcm {
  if (channelCount(pcm) === 1) return pcm;

  const frames = frameCount(pcm);
  const mono = new Float32Array(frames);
  const channels = channelCount(pcm);

  for (let i = 0; i < frames; i += 1) {
    let sum = 0;
    for (let ch = 0; ch < channels; ch += 1) sum += pcm.channels[ch]![i]!;
    mono[i] = sum / channels;
  }

  return { channels: [mono], sampleRate: pcm.sampleRate };
}

export function toStereo(pcm: Pcm): Pcm {
  if (channelCount(pcm) >= 2) return pcm;
  const mono = pcm.channels[0] ?? new Float32Array(0);
  return { channels: [mono, Float32Array.from(mono)], sampleRate: pcm.sampleRate };
}

/**
 * Remuestrea por interpolación lineal.
 *
 * Es suficiente para normalizar material de entrada y para el proveedor
 * local. Un remuestreo de calidad de publicación (sinc con ventana) lo hace
 * ffmpeg en el camino de producción.
 */
export function resample(pcm: Pcm, targetRate: number): Pcm {
  if (pcm.sampleRate === targetRate) return pcm;

  const ratio = targetRate / pcm.sampleRate;
  const outFrames = Math.max(1, Math.floor(frameCount(pcm) * ratio));

  const channels = pcm.channels.map((source) => {
    const out = new Float32Array(outFrames);
    for (let i = 0; i < outFrames; i += 1) {
      const position = i / ratio;
      const index = Math.floor(position);
      const fraction = position - index;
      const a = source[index] ?? 0;
      const b = source[index + 1] ?? a;
      out[i] = a + (b - a) * fraction;
    }
    return out;
  });

  return { channels, sampleRate: targetRate };
}

export function applyGain(pcm: Pcm, gainDb: number): Pcm {
  const factor = 10 ** (gainDb / 20);
  return {
    channels: pcm.channels.map((channel) => channel.map((s) => clamp(s * factor))),
    sampleRate: pcm.sampleRate,
  };
}

/**
 * Suma dos señales alineando duración, canales y frecuencia de muestreo.
 *
 * La suma directa puede superar el fondo de escala, así que se aplica un
 * limitador suave (`tanh`) en vez de recortar: recortar introduce armónicos
 * que suenan a distorsión digital, justo lo que se penaliza en el análisis
 * de calidad.
 */
export function mixSignals(a: Pcm, b: Pcm, gainDbA = 0, gainDbB = 0): Pcm {
  const rate = Math.max(a.sampleRate, b.sampleRate);
  const left = toStereo(resample(a, rate));
  const right = toStereo(resample(b, rate));

  const frames = Math.max(frameCount(left), frameCount(right));
  const factorA = 10 ** (gainDbA / 20);
  const factorB = 10 ** (gainDbB / 20);

  const channels = [0, 1].map((ch) => {
    const out = new Float32Array(frames);
    const sourceA = left.channels[ch] ?? left.channels[0]!;
    const sourceB = right.channels[ch] ?? right.channels[0]!;
    for (let i = 0; i < frames; i += 1) {
      const sum = (sourceA[i] ?? 0) * factorA + (sourceB[i] ?? 0) * factorB;
      out[i] = Math.abs(sum) > 0.95 ? Math.tanh(sum) : sum;
    }
    return out;
  });

  return { channels, sampleRate: rate };
}

/** Rampa de entrada y salida para evitar el chasquido en los extremos. */
export function fade(pcm: Pcm, fadeInSeconds = 0.02, fadeOutSeconds = 0.05): Pcm {
  const inFrames = Math.floor(fadeInSeconds * pcm.sampleRate);
  const outFrames = Math.floor(fadeOutSeconds * pcm.sampleRate);
  const total = frameCount(pcm);

  const channels = pcm.channels.map((source) => {
    const out = Float32Array.from(source);
    for (let i = 0; i < Math.min(inFrames, total); i += 1) out[i] = out[i]! * (i / inFrames);
    for (let i = 0; i < Math.min(outFrames, total); i += 1) {
      const index = total - 1 - i;
      out[index] = out[index]! * (i / outFrames);
    }
    return out;
  });

  return { channels, sampleRate: pcm.sampleRate };
}

export function silence(seconds: number, sampleRate: number, channels = 2): Pcm {
  const frames = Math.floor(seconds * sampleRate);
  return {
    channels: Array.from({ length: channels }, () => new Float32Array(frames)),
    sampleRate,
  };
}

export function concat(parts: readonly Pcm[]): Pcm {
  if (parts.length === 0) throw new Error('concat necesita al menos un fragmento');

  const sampleRate = parts[0]!.sampleRate;
  const channels = Math.max(...parts.map(channelCount));
  const normalized = parts.map((part) => resample(part, sampleRate));
  const totalFrames = normalized.reduce((sum, part) => sum + frameCount(part), 0);

  const output = Array.from({ length: channels }, () => new Float32Array(totalFrames));
  let cursor = 0;

  for (const part of normalized) {
    const frames = frameCount(part);
    for (let ch = 0; ch < channels; ch += 1) {
      const source = part.channels[ch] ?? part.channels[0]!;
      output[ch]!.set(source.subarray(0, frames), cursor);
    }
    cursor += frames;
  }

  return { channels: output, sampleRate };
}

// ── Medición ─────────────────────────────────────────────────

export function rms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / samples.length);
}

export function peak(samples: Float32Array): number {
  let max = 0;
  for (const sample of samples) {
    const absolute = Math.abs(sample);
    if (absolute > max) max = absolute;
  }
  return max;
}

export function toDbfs(amplitude: number): number {
  return amplitude <= 1e-9 ? -Infinity : 20 * Math.log10(amplitude);
}

/** Normaliza a un pico objetivo en dBFS (por defecto, −1 dBFS). */
export function normalizePeak(pcm: Pcm, targetDbfs = -1): Pcm {
  const current = Math.max(...pcm.channels.map(peak));
  if (current <= 1e-9) return pcm;

  const target = 10 ** (targetDbfs / 20);
  const factor = target / current;

  return {
    channels: pcm.channels.map((channel) => channel.map((s) => clamp(s * factor))),
    sampleRate: pcm.sampleRate,
  };
}

/** Fracción de muestras pegadas al fondo de escala: indicio de saturación. */
export function clippingRatio(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let clipped = 0;
  for (const sample of samples) if (Math.abs(sample) >= 0.999) clipped += 1;
  return clipped / samples.length;
}

/**
 * Estima la relación señal/ruido comparando la energía de los tramos
 * activos con la del percentil más silencioso.
 *
 * En una grabación de voz, la ventana más silenciosa es ruido de fondo puro;
 * su energía frente a la de la voz es una aproximación honesta del SNR sin
 * necesitar un detector de actividad vocal completo.
 */
export function estimateSnrDb(samples: Float32Array, sampleRate: number): number {
  const windowSize = Math.max(1, Math.floor(sampleRate * 0.02)); // ventanas de 20 ms
  const energies: number[] = [];

  for (let start = 0; start + windowSize <= samples.length; start += windowSize) {
    energies.push(rms(samples.subarray(start, start + windowSize)));
  }
  if (energies.length < 10) return 0;

  const sorted = [...energies].sort((a, b) => a - b);
  const noiseFloor = sorted[Math.floor(sorted.length * 0.1)] ?? 1e-9;
  const signal = sorted[Math.floor(sorted.length * 0.9)] ?? 1e-9;

  if (noiseFloor <= 1e-9) return 60;
  return Math.max(0, Math.min(60, 20 * Math.log10(signal / noiseFloor)));
}

/** Proporción de ventanas por debajo del umbral de actividad. */
export function silenceRatio(samples: Float32Array, sampleRate: number, thresholdDbfs = -45): number {
  const windowSize = Math.max(1, Math.floor(sampleRate * 0.02));
  const threshold = 10 ** (thresholdDbfs / 20);

  let quiet = 0;
  let total = 0;

  for (let start = 0; start + windowSize <= samples.length; start += windowSize) {
    if (rms(samples.subarray(start, start + windowSize)) < threshold) quiet += 1;
    total += 1;
  }

  return total === 0 ? 1 : quiet / total;
}

/** Picos por bucket, normalizados a 0–1, para dibujar la onda. */
export function waveformPeaks(pcm: Pcm, buckets: number): number[] {
  const mono = toMono(pcm).channels[0]!;
  const size = Math.max(1, Math.floor(mono.length / buckets));
  const result: number[] = [];

  for (let i = 0; i < buckets; i += 1) {
    const slice = mono.subarray(i * size, Math.min((i + 1) * size, mono.length));
    result.push(Number(peak(slice).toFixed(4)));
  }

  const max = Math.max(...result, 1e-6);
  return result.map((value) => Number((value / max).toFixed(4)));
}
