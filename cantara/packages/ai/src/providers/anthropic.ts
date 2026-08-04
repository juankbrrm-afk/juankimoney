/**
 * Generación de letras con Claude.
 *
 * La letra no es prosa libre: alimenta al motor musical como estructura
 * (`[Verse]`, `[Chorus]`…), así que se exige JSON validado. Si el modelo se
 * sale del esquema, se reintenta con el error como corrección en lugar de
 * dejar pasar una letra malformada que rompería la etapa siguiente.
 */

import { lyricsSchema, GENRE_PROFILES, LANGUAGE_LABELS, STRUCTURE_TEMPLATES, type Lyrics } from '@cantara/shared';
import type { LyricsBrief, LyricsProvider, ProviderContext } from '../ports.js';
import { requestJson } from '../http.js';

interface AnthropicResponse {
  content: Array<{ type: string; text?: string }>;
}

export interface AnthropicConfig {
  readonly apiKey: string;
  readonly model?: string;
  readonly baseUrl?: string;
}

export class AnthropicLyricsProvider implements LyricsProvider {
  readonly name = 'anthropic';

  constructor(private readonly config: AnthropicConfig) {}

  async generate(brief: LyricsBrief, ctx?: ProviderContext): Promise<Lyrics> {
    const template = STRUCTURE_TEMPLATES[brief.structure];
    const profile = GENRE_PROFILES[brief.genre];

    let correction = '';

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      ctx?.signal?.throwIfAborted();
      await ctx?.onProgress?.(attempt === 1 ? 0.4 : 0.7);

      const response = await requestJson<AnthropicResponse>({
        url: `${this.config.baseUrl ?? 'https://api.anthropic.com'}/v1/messages`,
        provider: 'anthropic',
        signal: ctx?.signal,
        headers: {
          'x-api-key': this.config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: {
          model: this.config.model ?? 'claude-opus-5',
          max_tokens: 2000,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: buildPrompt(brief, template.sections, profile.label) + correction,
            },
          ],
        },
      });

      const text = response.content.find((block) => block.type === 'text')?.text ?? '';
      const parsed = tryParse(text);

      if (parsed.success) {
        await ctx?.onProgress?.(1);
        return parsed.data;
      }

      correction = `\n\nTu respuesta anterior no era válida: ${parsed.error}. Devuelve ÚNICAMENTE el objeto JSON pedido.`;
    }

    throw new Error('Claude no devolvió una letra con la estructura esperada tras dos intentos');
  }
}

const SYSTEM_PROMPT = `Eres letrista profesional. Escribes letras cantables: métrica regular, rimas naturales y lenguaje concreto en lugar de abstracciones genéricas.

Devuelves SIEMPRE y ÚNICAMENTE un objeto JSON con esta forma exacta, sin texto antes ni después, sin bloques de código:

{"title": string, "language": string, "sections": [{"kind": string, "lines": [string]}]}

Reglas:
- El estribillo ("chorus") debe repetirse con las MISMAS líneas cada vez que aparece.
- Cada línea es un verso cantable, de 6 a 14 sílabas.
- Nada de acotaciones, ni indicaciones de producción, ni emojis.
- Escribes en el idioma pedido, con su naturalidad propia; no traduces literalmente del inglés.`;

function buildPrompt(brief: LyricsBrief, sections: readonly string[], genreLabel: string): string {
  return `Escribe la letra de una canción.

Tema del usuario: ${brief.prompt}
Género: ${genreLabel}
Idioma: ${LANGUAGE_LABELS[brief.language] ?? brief.language} (código "${brief.language}")
${brief.title ? `Título obligatorio: ${brief.title}` : 'Elige un título breve y memorable.'}

Estructura exacta, en este orden (usa estos valores en "kind"):
${sections.map((section, index) => `${index + 1}. ${section}`).join('\n')}

El campo "language" debe ser exactamente "${brief.language}".`;
}

function tryParse(text: string): { success: true; data: Lyrics } | { success: false; error: string } {
  // El modelo a veces envuelve el JSON en prosa o en un bloque de código;
  // se extrae el objeto en lugar de fallar por un envoltorio inofensivo.
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return { success: false, error: 'no se encontró ningún objeto JSON' };

  try {
    const parsed = lyricsSchema.safeParse(JSON.parse(text.slice(start, end + 1)));
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join('; ') };
    }
    return { success: true, data: parsed.data };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'JSON ilegible' };
  }
}
