import type { AudioBuffer } from '../ports.js';
import { decodeWav, encodeWav, durationSeconds, channelCount, type Pcm } from './pcm.js';

/** Envuelve PCM como `AudioBuffer` WAV, la moneda de cambio entre etapas. */
export function pcmToBuffer(pcm: Pcm, bitDepth: 16 | 24 = 24): AudioBuffer {
  return {
    data: encodeWav(pcm, bitDepth),
    mime: 'audio/wav',
    sampleRate: pcm.sampleRate,
    channels: channelCount(pcm),
    durationSeconds: durationSeconds(pcm),
  };
}

/**
 * Descodifica un `AudioBuffer` a PCM.
 *
 * Solo el WAV se descodifica en JavaScript puro. Para MP3/M4A/WEBM hace falta
 * ffmpeg — el adaptador correspondiente los convierte antes de llegar aquí,
 * así que este error indica un fallo de encaminamiento en el pipeline, no una
 * entrada inválida del usuario.
 */
export function bufferToPcm(buffer: AudioBuffer): Pcm {
  if (buffer.mime !== 'audio/wav' && !isWavBytes(buffer.data)) {
    throw new Error(
      `Se esperaba WAV y llegó ${buffer.mime}. Convierte con el adaptador ffmpeg antes de procesar.`,
    );
  }
  return decodeWav(buffer.data);
}

export function isWavBytes(bytes: Uint8Array): boolean {
  return (
    bytes.length > 12 &&
    bytes[0] === 0x52 && // R
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x46 // F
  );
}

export function isMp3Bytes(bytes: Uint8Array): boolean {
  if (bytes.length < 3) return false;
  // Etiqueta ID3v2 al inicio…
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return true;
  // …o sincronización de trama MPEG.
  return bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0;
}

const MPEG1_BITRATES = [
  0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0,
] as const;
const MPEG1_RATES = [44_100, 48_000, 32_000, 0] as const;

/**
 * Duración de un MP3 recorriendo sus tramas.
 *
 * Se recorren de verdad en lugar de dividir tamaño entre bitrate porque los
 * archivos con bitrate variable —lo habitual en grabaciones de móvil— darían
 * una duración muy desviada, y esa cifra decide si aceptamos el material del
 * usuario para entrenar.
 */
export function mp3DurationSeconds(bytes: Uint8Array): number {
  let offset = 0;

  // Saltar la etiqueta ID3v2 si existe (tamaño en 4 bytes syncsafe).
  if (bytes.length > 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    const size =
      ((bytes[6]! & 0x7f) << 21) |
      ((bytes[7]! & 0x7f) << 14) |
      ((bytes[8]! & 0x7f) << 7) |
      (bytes[9]! & 0x7f);
    offset = 10 + size;
  }

  let duration = 0;
  let guard = 0;

  while (offset + 4 <= bytes.length && guard < 500_000) {
    guard += 1;

    if (bytes[offset] !== 0xff || (bytes[offset + 1]! & 0xe0) !== 0xe0) {
      offset += 1;
      continue;
    }

    const header = bytes[offset + 2]!;
    const bitrate = MPEG1_BITRATES[(header >> 4) & 0x0f] ?? 0;
    const sampleRate = MPEG1_RATES[(header >> 2) & 0x03] ?? 0;
    const padding = (header >> 1) & 0x01;

    if (bitrate === 0 || sampleRate === 0) {
      offset += 1;
      continue;
    }

    const frameLength = Math.floor((144 * bitrate * 1000) / sampleRate) + padding;
    if (frameLength <= 0) {
      offset += 1;
      continue;
    }

    duration += 1152 / sampleRate; // muestras por trama en MPEG-1 Layer III
    offset += frameLength;
  }

  return duration;
}

/**
 * Duración aproximada sin descodificar.
 *
 * Exacta para WAV y MP3. Para contenedores que requieren ffmpeg devuelve
 * `null`, y quien llama decide: pedir la duración medida en el navegador o
 * delegar en ffmpeg.
 */
export function probeDurationSeconds(bytes: Uint8Array): number | null {
  if (isWavBytes(bytes)) {
    try {
      return durationSeconds(decodeWav(bytes));
    } catch {
      return null;
    }
  }
  if (isMp3Bytes(bytes)) {
    const duration = mp3DurationSeconds(bytes);
    return duration > 0 ? duration : null;
  }
  return null;
}
