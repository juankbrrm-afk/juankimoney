/**
 * Adaptador de ElevenLabs Music.
 *
 * Se usa el *composition plan* en lugar de un prompt suelto: permite fijar
 * intro/verso/estribillo con estilo y duración por sección, que es
 * exactamente la estructura que produce la etapa de letras. Además, según su
 * documentación, construir el plan no consume créditos — solo la composición
 * final.
 *
 * Nota de pipeline: este endpoint devuelve una mezcla, no stems, así que la
 * separación posterior es obligatoria en esta ruta.
 */

import { GENRE_PROFILES, SECTION_LABELS } from '@cantara/shared';
import type {
  CompositionPlan,
  CompositionResult,
  MusicProvider,
  ProviderContext,
} from '../ports.js';
import { requestBytes } from '../http.js';
import { probeDurationSeconds } from '../audio/buffer.js';

export interface ElevenLabsConfig {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly modelId?: string;
}

export class ElevenLabsMusicProvider implements MusicProvider {
  readonly name = 'elevenlabs';

  constructor(private readonly config: ElevenLabsConfig) {}

  async compose(plan: CompositionPlan, ctx?: ProviderContext): Promise<CompositionResult> {
    const base = this.config.baseUrl ?? 'https://api.elevenlabs.io';
    await ctx?.onProgress?.(0.1);

    const data = await requestBytes({
      url: `${base}/v1/music`,
      provider: 'elevenlabs',
      signal: ctx?.signal,
      // Componer una canción entera excede de largo el timeout por defecto.
      timeoutMs: 600_000,
      headers: {
        'xi-api-key': this.config.apiKey,
        accept: 'audio/mpeg',
      },
      body: {
        composition_plan: buildCompositionPlan(plan),
        music_length_ms: plan.durationSeconds * 1000,
        model_id: this.config.modelId ?? 'music_v1',
      },
    });

    await ctx?.onProgress?.(1);

    return {
      mix: {
        data,
        mime: 'audio/mpeg',
        sampleRate: 44_100,
        channels: 2,
        durationSeconds: probeDurationSeconds(data) ?? plan.durationSeconds,
      },
      // Sin stems nativos: el pipeline ejecutará la separación.
      providerTrackId: undefined,
    };
  }
}

interface ElevenSection {
  section_name: string;
  positive_local_styles: string[];
  negative_local_styles: string[];
  duration_ms: number;
  lines: string[];
}

export function buildCompositionPlan(plan: CompositionPlan): {
  positive_global_styles: string[];
  negative_global_styles: string[];
  sections: ElevenSection[];
} {
  const profile = GENRE_PROFILES[plan.genre];

  return {
    positive_global_styles: [
      ...profile.descriptors,
      ...profile.instrumentation,
      `${plan.bpm} bpm`,
      plan.instrumental ? 'instrumental, no vocals' : `vocals in ${plan.language}`,
      plan.prompt,
    ],
    // Se declaran explícitamente los defectos a evitar: sin esto, los
    // motores tienden a devolver material con ruido de vinilo o mezclas
    // apagadas que estropean la separación de stems posterior.
    negative_global_styles: ['low quality', 'distorted', 'muddy mix', 'tape hiss'],
    sections: plan.sections.map((section) => ({
      section_name: SECTION_LABELS[section.kind] ?? section.kind,
      positive_local_styles: localStyles(section.kind, profile.vocalIntensity),
      negative_local_styles: [],
      duration_ms: Math.round(section.durationSeconds * 1000),
      lines: [...section.lines],
    })),
  };
}

function localStyles(kind: string, intensity: string): string[] {
  const byKind: Record<string, string[]> = {
    intro: ['sparse arrangement', 'building anticipation'],
    verse: ['restrained dynamics', 'space for the vocal'],
    'pre-chorus': ['rising tension', 'building energy'],
    chorus: ['full arrangement', 'wide stereo', 'peak energy'],
    bridge: ['harmonic contrast', 'stripped back'],
    outro: ['resolving', 'fading energy'],
  };

  const intensityStyle =
    intensity === 'spoken'
      ? 'rhythmic delivery'
      : intensity === 'powerful'
        ? 'powerful sustained vocal'
        : 'melodic vocal line';

  return [...(byKind[kind] ?? []), intensityStyle];
}
