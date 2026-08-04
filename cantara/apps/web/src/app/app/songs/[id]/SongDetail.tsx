'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import {
  COMMERCIAL_USE_LABELS,
  CREDIT_COSTS,
  EXPORT_SPECS,
  SECTION_LABELS,
  licenseFor,
  type SectionKind,
  type SongDto,
  type SongVersionDto,
} from '@cantara/shared';
import { api, ApiError } from '@/lib/api';
import { Alert, Badge, Button, Card } from '@/components/ui';
import { AudioPlayer } from '@/components/AudioPlayer';
import { JobProgress } from '@/components/JobProgress';

/**
 * Detalle de una canción con todas sus versiones.
 *
 * La versión activa se elige aquí para poder comparar tomas sin recargar. Es
 * la razón de que regenerar no sobrescriba: escuchar dos versiones seguidas
 * es la única forma de decidir cuál es mejor.
 */
export function SongDetail({ song, balance }: { song: SongDto; balance: number }) {
  const router = useRouter();

  const [selectedId, setSelectedId] = useState(song.versions[0]?.id ?? '');
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = song.versions.find((version) => version.id === selectedId) ?? song.versions[0];
  const activeJob = song.versions.find((version) => version.activeJobId);
  const cost = CREDIT_COSTS.regeneration;

  async function regenerate(rewriteLyrics: boolean) {
    setError(null);
    setRegenerating(true);

    try {
      await api.regenerateSong(song.id, { rewriteLyrics });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No se pudo regenerar.');
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      {error && <Alert>{error}</Alert>}

      {activeJob?.activeJobId && (
        <Card>
          <h2 className="text-lg font-semibold">Generando la versión {activeJob.version}</h2>
          <JobProgress
            jobId={activeJob.activeJobId}
            type="song-generation"
            className="mt-5"
            onFinished={() => router.refresh()}
          />
        </Card>
      )}

      {selected && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">
              Versión {selected.version}
              {selected.version === song.versions[0]?.version && (
                <span className="ml-2 text-sm font-normal text-ink-600">(la más reciente)</span>
              )}
            </h2>

            {song.versions.length > 1 && (
              <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Versiones">
                {song.versions.map((version) => (
                  <button
                    key={version.id}
                    type="button"
                    role="tab"
                    aria-selected={version.id === selectedId}
                    onClick={() => setSelectedId(version.id)}
                    className={clsx(
                      'rounded-[--radius-control] border px-3 py-1.5 text-sm transition-colors',
                      version.id === selectedId
                        ? 'border-accent-500 bg-accent-600/15 text-accent-300'
                        : 'border-ink-800 text-ink-400 hover:border-ink-700 hover:text-ink-100',
                    )}
                  >
                    v{version.version}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-5">
            {selected.mp3Url ? (
              <AudioPlayer
                src={selected.mp3Url}
                waveform={selected.waveform}
                durationSeconds={selected.durationSeconds}
                title={song.title}
              />
            ) : selected.status === 'failed' ? (
              <Alert>{selected.failureReason ?? 'Esta versión no se pudo generar.'}</Alert>
            ) : (
              <p className="text-sm text-ink-600">Preparando el audio…</p>
            )}
          </div>

          {selected.status === 'ready' && <Downloads version={selected} title={song.title} />}
        </Card>
      )}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold">¿No te convence?</h2>
            <p className="mt-1 text-sm text-ink-400">
              Genera otra toma. Las anteriores se conservan para que puedas compararlas.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => regenerate(false)}
              loading={regenerating}
              disabled={balance < cost || Boolean(activeJob)}
            >
              Regenerar · {cost} créditos
            </Button>
            {!song.instrumental && (
              <Button
                variant="ghost"
                onClick={() => regenerate(true)}
                disabled={regenerating || Boolean(activeJob)}
              >
                Con letra nueva
              </Button>
            )}
          </div>
        </div>
      </Card>

      {song.lyrics && song.lyrics.sections.length > 0 && (
        <Card>
          <h2 className="text-lg font-semibold">Letra</h2>
          <div className="mt-5 space-y-5">
            {song.lyrics.sections.map((section, index) => (
              <div key={`${section.kind}-${index}`}>
                <p className="mb-1.5 text-xs uppercase tracking-wide text-accent-400">
                  {SECTION_LABELS[section.kind as SectionKind] ?? section.kind}
                </p>
                {section.lines.map((line, lineIndex) => (
                  <p key={lineIndex} className="leading-relaxed text-ink-300">
                    {line}
                  </p>
                ))}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

/**
 * Descargas con su nota de licencia.
 *
 * La licencia se muestra aquí, en el momento de descargar, y no enterrada en
 * unos términos: es cuando el usuario decide qué va a hacer con el archivo.
 */
function Downloads({ version, title }: { version: SongVersionDto; title: string }) {
  const license = licenseFor('local');
  const safeName = title.replace(/[^\p{L}\p{N} -]/gu, '').trim() || 'cancion';

  return (
    <div className="mt-6 border-t border-ink-800 pt-5">
      <div className="flex flex-wrap gap-3">
        {version.mp3Url && (
          <a href={version.mp3Url} download={`${safeName}.mp3`}>
            <Button variant="secondary">
              Descargar {EXPORT_SPECS.mp3.label}
              <span className="text-xs text-ink-600">{EXPORT_SPECS.mp3.detail}</span>
            </Button>
          </a>
        )}
        {version.wavUrl && (
          <a href={version.wavUrl} download={`${safeName}.wav`}>
            <Button variant="secondary">
              Descargar {EXPORT_SPECS.wav.label}
              <span className="text-xs text-ink-600">{EXPORT_SPECS.wav.detail}</span>
            </Button>
          </a>
        )}
      </div>

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-ink-400 hover:text-ink-100">
          Qué puedes hacer con este archivo
        </summary>
        <div className="mt-3 space-y-2 rounded-[--radius-control] border border-ink-800 bg-ink-900 p-4">
          <p className="text-ink-300">{license.summary}</p>
          <ul className="flex flex-wrap gap-2 pt-1">
            <li>
              <Badge tone={license.streaming === 'allowed' ? 'success' : 'warning'}>
                Streaming: {COMMERCIAL_USE_LABELS[license.streaming]}
              </Badge>
            </li>
            <li>
              <Badge tone={license.monetizedVideo === 'allowed' ? 'success' : 'warning'}>
                Vídeo monetizado: {COMMERCIAL_USE_LABELS[license.monetizedVideo]}
              </Badge>
            </li>
            <li>
              <Badge tone={license.advertising === 'allowed' ? 'success' : 'warning'}>
                Publicidad: {COMMERCIAL_USE_LABELS[license.advertising]}
              </Badge>
            </li>
          </ul>
          <p className="pt-1 text-xs text-ink-600">
            Condiciones revisadas el {license.reviewedAt}. Pueden cambiar: consúltalas antes de
            publicar.
          </p>
        </div>
      </details>
    </div>
  );
}
