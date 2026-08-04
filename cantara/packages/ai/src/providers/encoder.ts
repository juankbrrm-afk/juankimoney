import { Mp3Encoder } from '@breezystack/lamejs';
import type { ExportFormat } from '@cantara/shared';
import type { AudioBuffer, AudioEncoder } from '../ports.js';
import { bufferToPcm, pcmToBuffer } from '../audio/buffer.js';
import { resample, toStereo, waveformPeaks, frameCount } from '../audio/pcm.js';
import { ffmpegAvailable, toMp3 } from '../audio/ffmpeg.js';

/** Codificador de producción: delega en ffmpeg/libmp3lame. */
export class FfmpegEncoder implements AudioEncoder {
  readonly name = 'ffmpeg';

  async encode(audio: AudioBuffer, format: ExportFormat): Promise<AudioBuffer> {
    if (format === 'wav') return audio;

    const data = await toMp3(audio.data, { bitrateKbps: 320 });
    return { ...audio, data, mime: 'audio/mpeg' };
  }

  async waveform(audio: AudioBuffer, buckets: number): Promise<number[]> {
    return waveformPeaks(bufferToPcm(audio), buckets);
  }
}

/**
 * Codificador sin dependencias externas.
 *
 * Su razón de ser es que el proyecto arranque en cualquier máquina y que CI
 * ejecute el pipeline completo sin instalar nada. La calidad es correcta
 * (mismo codificador LAME, compilado a WebAssembly) pero es más lento que el
 * binario nativo, así que ffmpeg tiene preferencia cuando existe.
 */
export class PureJsEncoder implements AudioEncoder {
  readonly name = 'purejs';

  async encode(audio: AudioBuffer, format: ExportFormat): Promise<AudioBuffer> {
    if (format === 'wav') return audio;

    const pcm = toStereo(resample(bufferToPcm(audio), 44_100));
    const encoder = new Mp3Encoder(2, 44_100, 320);

    const left = toInt16(pcm.channels[0]!);
    const right = toInt16(pcm.channels[1] ?? pcm.channels[0]!);

    const blocks: Uint8Array[] = [];
    const blockSize = 1152; // tamaño de trama de MPEG-1 Layer III

    for (let offset = 0; offset < left.length; offset += blockSize) {
      const chunk = encoder.encodeBuffer(
        left.subarray(offset, offset + blockSize),
        right.subarray(offset, offset + blockSize),
      );
      if (chunk.length > 0) blocks.push(new Uint8Array(chunk));
    }

    const tail = encoder.flush();
    if (tail.length > 0) blocks.push(new Uint8Array(tail));

    return {
      data: concatBytes(blocks),
      mime: 'audio/mpeg',
      sampleRate: 44_100,
      channels: 2,
      durationSeconds: frameCount(pcm) / 44_100,
    };
  }

  async waveform(audio: AudioBuffer, buckets: number): Promise<number[]> {
    return waveformPeaks(bufferToPcm(audio), buckets);
  }
}

function toInt16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    const value = Math.max(-1, Math.min(1, samples[i]!));
    out[i] = Math.round(value * 32_767);
  }
  return out;
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Elige el mejor codificador disponible en esta máquina. */
export async function resolveEncoder(): Promise<AudioEncoder> {
  return (await ffmpegAvailable()) ? new FfmpegEncoder() : new PureJsEncoder();
}

export { pcmToBuffer };
