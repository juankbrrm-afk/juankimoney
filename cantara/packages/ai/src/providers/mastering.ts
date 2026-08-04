import { GENRE_PROFILES, type Genre } from '@cantara/shared';
import type { AudioBuffer, MasteringProvider, ProviderContext } from '../ports.js';
import { ffmpegAvailable, loudnorm } from '../audio/ffmpeg.js';

/**
 * Masterización por normalización EBU R128 con ffmpeg.
 *
 * Es el fallback honesto: no iguala el color de una referencia comercial como
 * Matchering, pero deja la sonoridad en el objetivo del género y con margen
 * de pico real correcto, que es lo que impide que la plataforma de streaming
 * de destino aplique su propia corrección de forma impredecible.
 *
 * Si no hay ffmpeg, delega en el proveedor de reserva que reciba.
 */
export class FfmpegMasteringProvider implements MasteringProvider {
  readonly name = 'loudnorm';

  constructor(private readonly fallback: MasteringProvider) {}

  async master(audio: AudioBuffer, genre: Genre, ctx?: ProviderContext): Promise<AudioBuffer> {
    if (!(await ffmpegAvailable())) {
      return this.fallback.master(audio, genre, ctx);
    }

    await ctx?.onProgress?.(0.3);

    const data = await loudnorm(audio.data, {
      targetLufs: GENRE_PROFILES[genre].targetLufs,
      truePeakDb: -1,
      signal: ctx?.signal,
    });

    await ctx?.onProgress?.(1);

    return { ...audio, data, mime: 'audio/wav' };
  }
}
