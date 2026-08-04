import {
  scoreQuality,
  VOICE_SAMPLE_LIMITS,
  type AudioQualityReport,
} from '@cantara/shared';
import type { AudioAnalyzer, AudioBuffer } from '../ports.js';
import { bufferToPcm, isWavBytes, probeDurationSeconds } from '../audio/buffer.js';
import {
  clippingRatio,
  durationSeconds,
  estimateSnrDb,
  peak,
  rms,
  silenceRatio,
  toDbfs,
  toMono,
  type Pcm,
} from '../audio/pcm.js';
import { ffmpegAvailable, toWav } from '../audio/ffmpeg.js';

/**
 * Analiza la calidad de una grabación antes de entrenar.
 *
 * Este paso es lo que separa el producto de una demo. Un modelo entrenado
 * con audio saturado produce canto metálico y el usuario concluye que la
 * aplicación no funciona. Medir primero permite decir exactamente qué
 * arreglar y en qué muestra.
 *
 * Cuando hay ffmpeg se analiza cualquier formato; sin él, solo WAV se mide de
 * verdad y el resto se acepta con puntuación desconocida en lugar de
 * bloquear al usuario por una carencia de nuestra infraestructura.
 */
export class AudioQualityAnalyzer implements AudioAnalyzer {
  readonly name = 'builtin';

  async analyze(input: AudioBuffer | Uint8Array): Promise<AudioQualityReport> {
    const bytes = input instanceof Uint8Array ? input : input.data;

    const pcm = await this.decode(bytes);
    if (!pcm) return unknownReport(probeDurationSeconds(bytes) ?? 0);

    return measure(pcm);
  }

  private async decode(bytes: Uint8Array): Promise<Pcm | null> {
    if (isWavBytes(bytes)) {
      try {
        return bufferToPcm({
          data: bytes,
          mime: 'audio/wav',
          sampleRate: 0,
          channels: 0,
          durationSeconds: 0,
        });
      } catch {
        return null;
      }
    }

    if (await ffmpegAvailable()) {
      try {
        return bufferToPcm({
          data: await toWav(bytes, { channels: 1, bitDepth: 16 }),
          mime: 'audio/wav',
          sampleRate: 0,
          channels: 0,
          durationSeconds: 0,
        });
      } catch {
        return null;
      }
    }

    return null;
  }
}

function measure(pcm: Pcm): AudioQualityReport {
  const mono = toMono(pcm).channels[0]!;
  const duration = durationSeconds(pcm);

  const metrics = {
    snrDb: estimateSnrDb(mono, pcm.sampleRate),
    clippingRatio: clippingRatio(mono),
    silenceRatio: silenceRatio(mono, pcm.sampleRate),
    rmsDbfs: toDbfs(rms(mono)),
    durationSeconds: duration,
  };

  const { score, issues } = scoreQuality(metrics);

  return {
    durationSeconds: duration,
    sampleRate: pcm.sampleRate,
    channels: pcm.channels.length,
    rmsDbfs: round(metrics.rmsDbfs),
    peakDbfs: round(toDbfs(peak(mono))),
    snrDb: round(metrics.snrDb),
    clippingRatio: Number(metrics.clippingRatio.toFixed(5)),
    silenceRatio: Number(metrics.silenceRatio.toFixed(4)),
    score,
    issues,
  };
}

/**
 * Informe neutro para material que no podemos descodificar.
 *
 * Se puntúa a 60 —utilizable, no excelente— a propósito: rechazar por no
 * poder medir castigaría al usuario por una limitación nuestra, y aprobar
 * con 100 mentiría sobre una calidad que no hemos verificado.
 */
function unknownReport(duration: number): AudioQualityReport {
  return {
    durationSeconds: duration,
    sampleRate: 0,
    channels: 0,
    rmsDbfs: 0,
    peakDbfs: 0,
    snrDb: 0,
    clippingRatio: 0,
    silenceRatio: 0,
    score: duration >= VOICE_SAMPLE_LIMITS.minClipSeconds ? 60 : 20,
    issues: duration >= VOICE_SAMPLE_LIMITS.minClipSeconds ? [] : ['too_short'],
  };
}

function round(value: number): number {
  return Number.isFinite(value) ? Number(value.toFixed(2)) : -99;
}
