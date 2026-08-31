/** Utilidades sobre AudioBuffer: mezcla a mono, picos para dibujar, RMS. */

export function toMono(buffer: AudioBuffer): Float32Array {
  const { numberOfChannels, length } = buffer;
  if (numberOfChannels === 1) return buffer.getChannelData(0).slice();
  const out = new Float32Array(length);
  for (let ch = 0; ch < numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) out[i] += data[i];
  }
  for (let i = 0; i < length; i++) out[i] /= numberOfChannels;
  return out;
}

/** Envolvente de picos (min/max por columna) para pintar una forma de onda. */
export function peaks(samples: Float32Array, columns: number): Float32Array {
  const out = new Float32Array(columns * 2);
  const per = samples.length / columns;
  for (let c = 0; c < columns; c++) {
    const start = Math.floor(c * per);
    const end = Math.min(samples.length, Math.floor((c + 1) * per));
    let min = 0;
    let max = 0;
    for (let i = start; i < end; i++) {
      const v = samples[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    out[c * 2] = min;
    out[c * 2 + 1] = max;
  }
  return out;
}

export function rms(samples: Float32Array, from = 0, to = samples.length): number {
  let sum = 0;
  const end = Math.min(to, samples.length);
  for (let i = from; i < end; i++) sum += samples[i] * samples[i];
  const n = Math.max(1, end - from);
  return Math.sqrt(sum / n);
}

export function peakLevel(samples: Float32Array): number {
  let max = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = Math.abs(samples[i]);
    if (v > max) max = v;
  }
  return max;
}

/** Construye un AudioBuffer mono a partir de trozos Float32 consecutivos. */
export function chunksToBuffer(
  ctx: BaseAudioContext,
  chunks: Float32Array[],
  sampleRate: number
): AudioBuffer {
  let total = 0;
  for (const c of chunks) total += c.length;
  const buffer = ctx.createBuffer(1, Math.max(1, total), sampleRate);
  const data = buffer.getChannelData(0);
  let offset = 0;
  for (const c of chunks) {
    data.set(c, offset);
    offset += c.length;
  }
  return buffer;
}
