/**
 * FFT radix-2 iterativa, in-place. Sin dependencias: todo el analisis del
 * estudio (onsets, centroide espectral, tono) se apoya en esta funcion.
 */

const twiddleCache = new Map<number, { cos: Float32Array; sin: Float32Array }>();

function twiddles(n: number) {
  const cached = twiddleCache.get(n);
  if (cached) return cached;
  const half = n >> 1;
  const cos = new Float32Array(half);
  const sin = new Float32Array(half);
  for (let i = 0; i < half; i++) {
    cos[i] = Math.cos((-2 * Math.PI * i) / n);
    sin[i] = Math.sin((-2 * Math.PI * i) / n);
  }
  const entry = { cos, sin };
  twiddleCache.set(n, entry);
  return entry;
}

/** Transformada in-place. `re` e `im` deben tener longitud potencia de dos. */
export function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  if (n <= 1) return;
  if ((n & (n - 1)) !== 0) throw new Error("fft: la longitud debe ser potencia de 2");

  // Reordenado bit-reverse.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }

  const { cos, sin } = twiddles(n);
  for (let len = 2; len <= n; len <<= 1) {
    const step = n / len;
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < half; k++) {
        const tw = k * step;
        const wr = cos[tw];
        const wi = sin[tw];
        const a = i + k;
        const b = a + half;
        const xr = re[b] * wr - im[b] * wi;
        const xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
      }
    }
  }
}

/** Ventana de Hann precalculada. */
export function hann(size: number): Float32Array<ArrayBuffer> {
  const w = new Float32Array(size);
  for (let i = 0; i < size; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size);
  return w;
}

/** Espectro de magnitud de un frame ya enventanado. Devuelve n/2+1 bins. */
export function magnitudeSpectrum(frame: Float32Array): Float32Array<ArrayBuffer> {
  const n = frame.length;
  const re = Float32Array.from(frame);
  const im = new Float32Array(n);
  fft(re, im);
  const bins = (n >> 1) + 1;
  const mag = new Float32Array(bins);
  for (let i = 0; i < bins; i++) mag[i] = Math.hypot(re[i], im[i]);
  return mag;
}
