/**
 * Pipeline de generación de canción.
 *
 * Orquesta las siete etapas sin conocer la base de datos, la cola ni HTTP:
 * recibe proveedores y almacenamiento, informa del progreso por callback y
 * devuelve las claves de los entregables. Esa ausencia de dependencias es lo
 * que permite ejecutarlo entero en un test.
 *
 * Reanudación: cada etapa guarda su artefacto y consulta `artifacts` antes de
 * trabajar. Un reintento tras un fallo en masterización no vuelve a componer
 * la canción —lo caro— sino que retoma desde el último artefacto válido.
 */

import {
  GENRE_PROFILES,
  JobError,
  SECTION_BASE_SECONDS,
  STRUCTURE_TEMPLATES,
  pitchShiftFor,
  type Genre,
  type Language,
  type Lyrics,
  type SongStructure,
  type VocalTimbre,
} from '@cantara/shared';
import type {
  AiProviders,
  AudioBuffer,
  CompositionPlan,
  CompositionSection,
  ProviderContext,
  StoragePort,
  VoiceHandle,
} from '../ports.js';
import { ProviderHttpError } from '../http.js';

export interface SongRequest {
  readonly userId: string;
  readonly versionId: string;
  readonly title?: string;
  readonly prompt: string;
  readonly genre: Genre;
  readonly language: Language;
  readonly structure: SongStructure;
  readonly timbre: VocalTimbre;
  readonly bpm: number;
  readonly durationSeconds: number;
  readonly instrumental: boolean;
  /** Letra ya escrita. Si falta, la genera la IA. */
  readonly lyrics?: Lyrics | null;
  readonly voice?: {
    readonly handle: VoiceHandle;
    /** Registro declarado del modelo; evita transponer de más. */
    readonly isLowRegister: boolean;
  } | null;
}

export type StageReporter = (
  stage: string,
  fraction: number,
  note?: string,
) => void | Promise<void>;

/** Claves de artefactos ya producidos, para poder reanudar. */
export type Artifacts = Record<string, string>;

export interface SongResult {
  readonly lyrics: Lyrics;
  readonly mp3Key: string;
  readonly wavKey: string;
  readonly waveform: number[];
  readonly durationSeconds: number;
  readonly musicProvider: string;
  readonly artifacts: Artifacts;
}

export interface PipelineDeps {
  readonly providers: AiProviders;
  readonly storage: StoragePort;
  readonly signal?: AbortSignal;
  readonly onStage: StageReporter;
  /** Artefactos de un intento anterior, para retomar donde se quedó. */
  readonly artifacts?: Artifacts;
}

export async function generateSong(
  request: SongRequest,
  deps: PipelineDeps,
): Promise<SongResult> {
  const { providers, storage, signal } = deps;
  const artifacts: Artifacts = { ...deps.artifacts };

  const keyFor = (name: string) =>
    `users/${request.userId}/songs/${request.versionId}/${name}`;

  /** Guarda un artefacto y anota su clave, para que un reintento lo reutilice. */
  const store = async (name: string, audio: AudioBuffer): Promise<string> => {
    const key = keyFor(name);
    await storage.put(key, audio.data, audio.mime);
    artifacts[name] = key;
    return key;
  };

  const load = async (name: string, mime = 'audio/wav'): Promise<AudioBuffer | null> => {
    const key = artifacts[name];
    if (!key) return null;
    try {
      const data = await storage.get(key);
      return { data, mime, sampleRate: 44_100, channels: 2, durationSeconds: request.durationSeconds };
    } catch {
      // Un artefacto anotado pero ilegible se trata como ausente: se recalcula.
      return null;
    }
  };

  /**
   * Contexto de proveedor con el progreso acotado por debajo de 1.
   *
   * Solo el pipeline declara una etapa terminada, y lo hace después de
   * persistir el artefacto. Sin este tope, un proveedor anunciaría el 100 %
   * de «composición» mientras aún queda subir la mezcla al almacén — y si esa
   * subida falla, el usuario habría visto completarse una etapa que no lo
   * estaba.
   */
  const ctxFor = (stage: string): ProviderContext => ({
    signal,
    onProgress: (fraction, note) => deps.onStage(stage, Math.min(fraction, 0.99), note),
  });

  return wrapProviderErrors(async () => {
    // ── 1. Letra ──────────────────────────────────────────────
    await deps.onStage('lyrics', 0);

    const lyrics: Lyrics = request.instrumental
      ? { title: request.title ?? 'Instrumental', language: request.language, sections: [] }
      : (request.lyrics ??
        (await providers.lyrics.generate(
          {
            prompt: request.prompt,
            genre: request.genre,
            language: request.language,
            structure: request.structure,
            title: request.title,
          },
          ctxFor('lyrics'),
        )));

    await deps.onStage('lyrics', 1);

    // ── 2. Composición ────────────────────────────────────────
    await deps.onStage('composition', 0);

    const plan = buildPlan(request, lyrics);

    let mix = await load('mix', 'audio/wav');
    let nativeStems: { vocals: AudioBuffer; instrumental: AudioBuffer } | undefined;
    let musicProvider = providers.music.name;

    if (!mix) {
      const composition = await providers.music.compose(plan, ctxFor('composition'));
      mix = composition.mix;
      nativeStems = composition.stems;
      await store('mix', composition.mix);

      if (composition.stems) {
        await store('stem-vocals', composition.stems.vocals);
        await store('stem-instrumental', composition.stems.instrumental);
      }
    } else {
      // Al reanudar, los stems guardados evitan repetir la separación.
      const [vocals, instrumental] = await Promise.all([
        load('stem-vocals'),
        load('stem-instrumental'),
      ]);
      if (vocals && instrumental) nativeStems = { vocals, instrumental };
    }

    await deps.onStage('composition', 1);

    // Una instrumental no necesita voz: se salta directamente a masterizar.
    if (request.instrumental) {
      await deps.onStage('separation', 1);
      await deps.onStage('voice-conversion', 1);
      await deps.onStage('mixing', 1);
      return finish(mix);
    }

    // ── 3. Separación de stems ────────────────────────────────
    await deps.onStage('separation', 0);

    // Si el motor musical devolvió stems, esta etapa entera desaparece: es
    // más barata y de más calidad que separar una mezcla ya renderizada.
    const stems =
      nativeStems ??
      (await (async () => {
        const separated = await providers.separator.separate(mix, ctxFor('separation'));
        await store('stem-vocals', separated.vocals);
        await store('stem-instrumental', separated.instrumental);
        return separated;
      })());

    await deps.onStage('separation', 1);

    // ── 4. Conversión a la voz del usuario ────────────────────
    await deps.onStage('voice-conversion', 0);

    if (!request.voice) throw new JobError('voice_not_ready');

    let converted = await load('vocals-converted');
    if (!converted) {
      converted = await providers.converter.convert(
        stems.vocals,
        {
          handle: request.voice.handle,
          pitchShift: pitchShiftFor(request.timbre, request.voice.isLowRegister),
          timbre: request.timbre,
          strength: 0.85,
        },
        ctxFor('voice-conversion'),
      );
      await store('vocals-converted', converted);
    }

    await deps.onStage('voice-conversion', 1);

    // ── 5. Mezcla ─────────────────────────────────────────────
    await deps.onStage('mixing', 0);

    let mixed = await load('mixed');
    if (!mixed) {
      mixed = await providers.mixer.mix(converted, stems.instrumental, {
        // La voz por encima del instrumental: es lo que hace inteligible la
        // letra, y el usuario quiere oírse a sí mismo.
        vocalGainDb: 0,
        instrumentalGainDb: GENRE_PROFILES[request.genre].vocalIntensity === 'spoken' ? -4 : -3,
      });
      await store('mixed', mixed);
    }

    await deps.onStage('mixing', 1);

    return finish(mixed);

    // ── 6 y 7. Masterización y codificación ───────────────────
    async function finish(source: AudioBuffer): Promise<SongResult> {
      await deps.onStage('mastering', 0);

      let mastered = await load('mastered');
      if (!mastered) {
        mastered = await providers.mastering.master(source, request.genre, ctxFor('mastering'));
        await store('mastered', mastered);
      }

      await deps.onStage('mastering', 1);
      await deps.onStage('encoding', 0);

      const [wav, mp3] = await Promise.all([
        providers.encoder.encode(mastered, 'wav'),
        providers.encoder.encode(mastered, 'mp3'),
      ]);

      const wavKey = `users/${request.userId}/songs/${request.versionId}/master.wav`;
      const mp3Key = `users/${request.userId}/songs/${request.versionId}/master.mp3`;

      await Promise.all([
        storage.put(wavKey, wav.data, 'audio/wav'),
        storage.put(mp3Key, mp3.data, 'audio/mpeg'),
      ]);

      const waveform = await providers.encoder.waveform(mastered, 160);

      await deps.onStage('encoding', 1);

      return {
        lyrics,
        mp3Key,
        wavKey,
        waveform,
        durationSeconds: mastered.durationSeconds || request.durationSeconds,
        musicProvider,
        artifacts,
      };
    }
  });
}

/**
 * Reparte la duración pedida entre las secciones de la estructura.
 *
 * Se escala proporcionalmente en lugar de recortar por el final: una canción
 * de 90 segundos debe tener todas sus partes, más cortas, no quedarse a
 * medias del segundo estribillo.
 */
export function buildPlan(request: SongRequest, lyrics: Lyrics): CompositionPlan {
  const template = STRUCTURE_TEMPLATES[request.structure];

  const baseTotal = template.sections.reduce(
    (sum, kind) => sum + SECTION_BASE_SECONDS[kind],
    0,
  );
  const scale = request.durationSeconds / baseTotal;

  // Las secciones de la letra se consumen en orden, emparejándolas por tipo.
  const pending = [...lyrics.sections];

  const sections: CompositionSection[] = template.sections.map((kind) => {
    const matchIndex = pending.findIndex((section) => section.kind === kind);
    const matched = matchIndex >= 0 ? pending.splice(matchIndex, 1)[0] : undefined;

    return {
      kind,
      durationSeconds: Math.max(4, Math.round(SECTION_BASE_SECONDS[kind] * scale)),
      lines: matched?.lines ?? [],
    };
  });

  return {
    title: lyrics.title || request.title || 'Sin título',
    genre: request.genre,
    language: request.language,
    bpm: request.bpm,
    prompt: request.prompt,
    durationSeconds: request.durationSeconds,
    instrumental: request.instrumental,
    sections,
  };
}

/**
 * Traduce fallos de proveedor en errores de dominio.
 *
 * Sin esto, la interfaz mostraría «elevenlabs respondió 503», que no le dice
 * nada al usuario ni sugiere qué hacer. `JobError` distingue además lo
 * transitorio —se reintenta— de lo permanente.
 */
async function wrapProviderErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof JobError) throw error;

    if (error instanceof ProviderHttpError) {
      throw new JobError(
        error.retryable ? 'provider_unavailable' : 'provider_rejected',
        error.message,
        error.retryable,
      );
    }

    if (error instanceof Error && error.name === 'AbortError') throw error;

    throw new JobError('internal', error instanceof Error ? error.message : String(error), true);
  }
}
