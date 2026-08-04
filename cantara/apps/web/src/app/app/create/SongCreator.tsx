'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import clsx from 'clsx';
import {
  GENRES,
  GENRE_PROFILES,
  LANGUAGES,
  LANGUAGE_LABELS,
  SECTION_LABELS,
  SONG_STRUCTURES,
  STRUCTURE_TEMPLATES,
  TIMBRE_LABELS,
  VOCAL_TIMBRES,
  defaultBpm,
  formatDuration,
  songCost,
  type Genre,
  type Language,
  type Lyrics,
  type SectionKind,
  type SongStructure,
  type VocalTimbre,
  type VoiceModelDto,
} from '@cantara/shared';
import { api, ApiError } from '@/lib/api';
import { Alert, Badge, Button, Card, Field, Input, Select, Textarea } from '@/components/ui';
import { JobProgress } from '@/components/JobProgress';

/**
 * Creador de canciones.
 *
 * El coste se recalcula visiblemente con cada cambio. Descubrir el precio al
 * pulsar «generar» es la forma más rápida de perder la confianza del usuario
 * en un producto de créditos.
 */
export function SongCreator({
  voices,
  balance,
  initialVoiceId,
}: {
  voices: VoiceModelDto[];
  balance: number;
  initialVoiceId?: string;
}) {
  const router = useRouter();
  const readyVoices = voices.filter((voice) => voice.status === 'ready');

  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [genre, setGenre] = useState<Genre>('pop');
  const [language, setLanguage] = useState<Language>('es');
  const [structure, setStructure] = useState<SongStructure>('standard');
  const [timbre, setTimbre] = useState<VocalTimbre>('natural');
  const [voiceId, setVoiceId] = useState(initialVoiceId ?? readyVoices[0]?.id ?? '');
  const [instrumental, setInstrumental] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState(180);
  const [bpm, setBpm] = useState(defaultBpm('pop'));

  const [lyricsMode, setLyricsMode] = useState<'ai' | 'own'>('ai');
  const [lyricsText, setLyricsText] = useState('');
  const [draftLyrics, setDraftLyrics] = useState<Lyrics | null>(null);
  const [writingLyrics, setWritingLyrics] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [songId, setSongId] = useState<string | null>(null);

  const cost = songCost({ durationSeconds });
  const canAfford = balance >= cost;
  const profile = GENRE_PROFILES[genre];

  // Al cambiar de género se reajusta el tempo a su rango. Mantener 140 bpm al
  // pasar de electrónica a balada produciría una balada acelerada.
  function changeGenre(next: Genre) {
    setGenre(next);
    setBpm(defaultBpm(next));
  }

  const parsedOwnLyrics = useMemo(
    () => (lyricsMode === 'own' ? parseLyrics(lyricsText, language, title) : null),
    [lyricsMode, lyricsText, language, title],
  );

  async function writeLyrics() {
    if (prompt.trim().length < 3) {
      setError('Describe primero de qué va la canción.');
      return;
    }

    setError(null);
    setWritingLyrics(true);

    try {
      const { lyrics } = await api.generateLyrics({
        prompt: prompt.trim(),
        genre,
        language,
        structure,
        ...(title.trim() ? { title: title.trim() } : {}),
      });
      setDraftLyrics(lyrics);
      if (!title.trim()) setTitle(lyrics.title);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No pudimos escribir la letra.');
    } finally {
      setWritingLyrics(false);
    }
  }

  async function submit() {
    setError(null);
    setSubmitting(true);

    try {
      const response = await api.createSong({
        ...(title.trim() ? { title: title.trim() } : {}),
        prompt: prompt.trim(),
        genre,
        language,
        structure,
        timbre,
        voiceModelId: instrumental ? null : voiceId || null,
        lyrics: instrumental ? null : (parsedOwnLyrics ?? draftLyrics),
        bpm,
        durationSeconds,
        instrumental,
      });

      setJobId(response.jobId);
      setSongId(response.song.id);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No se pudo crear la canción.');
      setSubmitting(false);
    }
  }

  if (jobId && songId) {
    return (
      <Card>
        <h2 className="text-lg font-semibold">Creando «{title || 'tu canción'}»</h2>
        <p className="mt-2 text-sm text-ink-400">
          Suele tardar un par de minutos. Puedes cerrar la página: seguirá generándose.
        </p>

        <JobProgress
          jobId={jobId}
          type="song-generation"
          className="mt-6"
          onFinished={(state) => {
            if (state.status === 'succeeded') {
              router.push(`/app/songs/${songId}`);
              router.refresh();
            }
          }}
        />
      </Card>
    );
  }

  if (readyVoices.length === 0 && !instrumental) {
    return (
      <Card className="text-center">
        <h2 className="text-lg font-semibold">Primero necesitas una voz</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-400">
          Entrena un modelo con tu voz y podrás usarlo en todas tus canciones. O crea una pista
          instrumental sin voz.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/app/voices/new">
            <Button size="lg">Entrenar mi voz</Button>
          </Link>
          <Button variant="secondary" size="lg" onClick={() => setInstrumental(true)}>
            Crear instrumental
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {error && <Alert>{error}</Alert>}

      <Card>
        <h2 className="text-lg font-semibold">1. La idea</h2>

        <div className="mt-5 space-y-5">
          <Field
            label="Describe la canción"
            htmlFor="prompt"
            hint="Cuanto más concreto, mejor: ambiente, historia, referencias sonoras."
            required
          >
            <Textarea
              id="prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Una canción de verano sobre volver al pueblo después de años fuera. Nostálgica pero luminosa, con guitarra acústica y un estribillo que se pegue."
              maxLength={1500}
              required
            />
          </Field>

          <Field label="Título" htmlFor="title" hint="Opcional: si lo dejas vacío, lo elegimos.">
            <Input
              id="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Luces de agosto"
              maxLength={120}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold">2. El sonido</h2>

        <fieldset className="mt-5">
          <legend className="mb-3 text-sm font-medium text-ink-300">Género</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {GENRES.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => changeGenre(item)}
                aria-pressed={genre === item}
                className={clsx(
                  'flex items-center gap-2 rounded-[--radius-control] border px-3 py-2.5 text-sm transition-all',
                  genre === item
                    ? 'border-accent-500 bg-accent-600/15 text-ink-100'
                    : 'border-ink-800 bg-ink-900 text-ink-400 hover:border-ink-700 hover:text-ink-100',
                )}
              >
                <span aria-hidden>{GENRE_PROFILES[item].icon}</span>
                <span className="truncate">{GENRE_PROFILES[item].label}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Field label="Idioma" htmlFor="language">
            <Select
              id="language"
              value={language}
              onChange={(event) => setLanguage(event.target.value as Language)}
            >
              {LANGUAGES.map((item) => (
                <option key={item} value={item}>
                  {LANGUAGE_LABELS[item]}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Estructura"
            htmlFor="structure"
            hint={STRUCTURE_TEMPLATES[structure].description}
          >
            <Select
              id="structure"
              value={structure}
              onChange={(event) => setStructure(event.target.value as SongStructure)}
            >
              {SONG_STRUCTURES.map((item) => (
                <option key={item} value={item}>
                  {STRUCTURE_TEMPLATES[item].label}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label={`Tempo — ${bpm} bpm`}
            htmlFor="bpm"
            hint={`Habitual en ${profile.label}: ${profile.bpm[0]}–${profile.bpm[1]}`}
          >
            <input
              id="bpm"
              type="range"
              min={40}
              max={200}
              value={bpm}
              onChange={(event) => setBpm(Number(event.target.value))}
              className="h-11 w-full accent-accent-500"
            />
          </Field>

          <Field label={`Duración — ${formatDuration(durationSeconds)}`} htmlFor="duration">
            <input
              id="duration"
              type="range"
              min={30}
              max={240}
              step={15}
              value={durationSeconds}
              onChange={(event) => setDurationSeconds(Number(event.target.value))}
              className="h-11 w-full accent-accent-500"
            />
          </Field>
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold">3. La voz</h2>

        <label className="mt-4 flex cursor-pointer items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={instrumental}
            onChange={(event) => setInstrumental(event.target.checked)}
            className="size-4 rounded border-ink-700 bg-ink-900 accent-accent-500"
          />
          <span className="text-ink-300">Instrumental (sin voz)</span>
        </label>

        {!instrumental && (
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <Field label="Modelo de voz" htmlFor="voice" required>
              <Select
                id="voice"
                value={voiceId}
                onChange={(event) => setVoiceId(event.target.value)}
                required
              >
                {readyVoices.map((voice) => (
                  <option key={voice.id} value={voice.id}>
                    {voice.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Timbre"
              htmlFor="timbre"
              hint="Cambia el registro, no la identidad: sigue siendo tu voz."
            >
              <Select
                id="timbre"
                value={timbre}
                onChange={(event) => setTimbre(event.target.value as VocalTimbre)}
              >
                {VOCAL_TIMBRES.map((item) => (
                  <option key={item} value={item}>
                    {TIMBRE_LABELS[item]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}
      </Card>

      {!instrumental && (
        <Card>
          <h2 className="text-lg font-semibold">4. La letra</h2>

          <div className="mt-4 flex gap-2" role="tablist" aria-label="Origen de la letra">
            {(['ai', 'own'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={lyricsMode === mode}
                onClick={() => setLyricsMode(mode)}
                className={clsx(
                  'rounded-[--radius-control] px-4 py-2 text-sm font-medium transition-colors',
                  lyricsMode === mode
                    ? 'bg-accent-600/15 text-accent-300'
                    : 'text-ink-400 hover:bg-ink-850 hover:text-ink-100',
                )}
              >
                {mode === 'ai' ? 'La escribe la IA' : 'La escribo yo'}
              </button>
            ))}
          </div>

          {lyricsMode === 'ai' ? (
            <div className="mt-5">
              <p className="text-sm text-ink-400">
                Puedes generarla ahora para revisarla antes de componer, o dejarlo y se escribirá
                durante la generación.
              </p>

              <Button
                variant="secondary"
                className="mt-4"
                onClick={writeLyrics}
                loading={writingLyrics}
                disabled={prompt.trim().length < 3}
              >
                Escribir letra ahora · 3 créditos
              </Button>

              {draftLyrics && (
                <div className="mt-5 space-y-4 rounded-[--radius-control] border border-ink-800 bg-ink-900 p-5">
                  <h3 className="font-medium">{draftLyrics.title}</h3>
                  {draftLyrics.sections.map((section, index) => (
                    <div key={`${section.kind}-${index}`}>
                      <p className="mb-1 text-xs uppercase tracking-wide text-accent-400">
                        {SECTION_LABELS[section.kind as SectionKind] ?? section.kind}
                      </p>
                      {section.lines.map((line, lineIndex) => (
                        <p key={lineIndex} className="text-sm leading-relaxed text-ink-300">
                          {line}
                        </p>
                      ))}
                    </div>
                  ))}
                  <Button variant="ghost" size="sm" onClick={writeLyrics} loading={writingLyrics}>
                    Escribir otra
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-5">
              <Field
                label="Tu letra"
                htmlFor="lyrics"
                hint="Separa las secciones con [Verso], [Estribillo], [Puente]… Una línea por verso."
              >
                <Textarea
                  id="lyrics"
                  value={lyricsText}
                  onChange={(event) => setLyricsText(event.target.value)}
                  className="min-h-64 font-mono text-sm"
                  placeholder={`[Verso]\nCamino solo entre las luces de agosto\nY el pueblo sigue donde lo dejé\n\n[Estribillo]\nVuelvo a casa, vuelvo a casa\nAunque ya no sea la misma`}
                />
              </Field>

              {parsedOwnLyrics && (
                <p className="mt-2 text-sm text-ink-600">
                  {parsedOwnLyrics.sections.length} secciones detectadas.
                </p>
              )}
            </div>
          )}
        </Card>
      )}

      <Card className="sticky bottom-20 z-30 sm:bottom-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 font-medium">
              Coste <Badge tone="accent">{cost} créditos</Badge>
            </p>
            <p className="mt-1 text-sm text-ink-600">
              Te quedan {balance} · después, {Math.max(0, balance - cost)}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            {!canAfford && (
              <Link href="/app/credits">
                <Button variant="secondary" size="lg">
                  Conseguir créditos
                </Button>
              </Link>
            )}
            <Button
              size="lg"
              onClick={submit}
              loading={submitting}
              disabled={
                !canAfford ||
                prompt.trim().length < 3 ||
                (!instrumental && !voiceId)
              }
            >
              Generar canción
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

/**
 * Convierte texto plano con marcadores en secciones estructuradas.
 *
 * Acepta las etiquetas en español y en inglés porque la gente pega letras de
 * cualquier sitio, y rechazar `[Chorus]` por no ser `[Estribillo]` sería
 * gratuito. Sin ninguna etiqueta, el texto entero se trata como un verso.
 */
function parseLyrics(text: string, language: Language, title: string): Lyrics | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const sections: Array<{ kind: string; lines: string[] }> = [];
  let current: { kind: string; lines: string[] } | null = null;

  for (const rawLine of trimmed.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    const marker = /^\[(.+?)\]$/.exec(line);
    if (marker) {
      if (current && current.lines.length > 0) sections.push(current);
      current = { kind: normalizeSection(marker[1]!), lines: [] };
      continue;
    }

    current ??= { kind: 'verse', lines: [] };
    current.lines.push(line);
  }

  if (current && current.lines.length > 0) sections.push(current);
  if (sections.length === 0) return null;

  return { title: title.trim() || 'Sin título', language, sections };
}

const SECTION_ALIASES: Record<string, SectionKind> = {
  intro: 'intro',
  verso: 'verse',
  verse: 'verse',
  estribillo: 'chorus',
  coro: 'chorus',
  chorus: 'chorus',
  preestribillo: 'pre-chorus',
  'pre-estribillo': 'pre-chorus',
  'pre-chorus': 'pre-chorus',
  prechorus: 'pre-chorus',
  puente: 'bridge',
  bridge: 'bridge',
  outro: 'outro',
  final: 'outro',
};

function normalizeSection(raw: string): SectionKind {
  const key = raw
    .toLowerCase()
    .trim()
    // Los marcadores suelen llevar número («[Verso 2]»); se descarta.
    .replace(/\s*\d+$/, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

  return SECTION_ALIASES[key] ?? 'verse';
}
