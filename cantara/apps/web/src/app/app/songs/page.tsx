import type { Metadata } from 'next';
import Link from 'next/link';
import { GENRE_PROFILES, LANGUAGE_LABELS, type Genre, type Language } from '@cantara/shared';
import { api } from '@/lib/api';
import { forwardedCookie } from '@/lib/server';
import { AudioPlayer } from '@/components/AudioPlayer';
import { Badge, Button, Card, EmptyState } from '@/components/ui';

export const metadata: Metadata = { title: 'Mis canciones' };

export default async function SongsPage() {
  const { items } = await api.listSongs(undefined, await forwardedCookie());

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">Mis canciones</h1>
          <p className="mt-2 text-ink-400">
            Cada regeneración guarda una versión nueva, así puedes comparar tomas.
          </p>
        </div>
        <Link href="/app/create">
          <Button>Nueva canción</Button>
        </Link>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon="♪"
          title="Tu historial está vacío"
          description="Genera tu primera canción y aparecerá aquí, con todas sus versiones y descargas."
          action={
            <Link href="/app/create">
              <Button size="lg">Crear canción</Button>
            </Link>
          }
        />
      ) : (
        <ul className="space-y-4">
          {items.map((song) => {
            const latest = song.versions[0];

            return (
              <Card key={song.id} as="li">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/app/songs/${song.id}`}
                      className="text-lg font-semibold hover:text-accent-300"
                    >
                      {song.title}
                    </Link>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-600">
                      <span>{GENRE_PROFILES[song.genre as Genre]?.label ?? song.genre}</span>
                      <span aria-hidden>·</span>
                      <span>{LANGUAGE_LABELS[song.language as Language] ?? song.language}</span>
                      <span aria-hidden>·</span>
                      <span>{song.bpm} bpm</span>
                      {song.voiceModelName && (
                        <>
                          <span aria-hidden>·</span>
                          <span>{song.voiceModelName}</span>
                        </>
                      )}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {song.versions.length > 1 && (
                      <Badge>{song.versions.length} versiones</Badge>
                    )}
                    <Badge tone={statusTone(latest?.status)}>{statusLabel(latest?.status)}</Badge>
                  </div>
                </div>

                <div className="mt-4">
                  {latest?.mp3Url ? (
                    <AudioPlayer
                      src={latest.mp3Url}
                      waveform={latest.waveform}
                      durationSeconds={latest.durationSeconds}
                      title={song.title}
                    />
                  ) : latest?.status === 'failed' ? (
                    <p className="text-sm text-danger">
                      {latest.failureReason ?? 'No se pudo generar.'}
                    </p>
                  ) : (
                    <p className="text-sm text-ink-600">Generando…</p>
                  )}
                </div>
              </Card>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function statusTone(status?: string) {
  if (status === 'ready') return 'success' as const;
  if (status === 'failed') return 'danger' as const;
  return 'warning' as const;
}

function statusLabel(status?: string) {
  if (status === 'ready') return 'Lista';
  if (status === 'failed') return 'Falló';
  return 'Generando';
}
