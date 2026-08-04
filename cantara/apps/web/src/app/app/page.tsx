import Link from 'next/link';
import type { Metadata } from 'next';
import { CREDIT_COSTS } from '@cantara/shared';
import { api } from '@/lib/api';
import { forwardedCookie } from '@/lib/server';
import { AudioPlayer } from '@/components/AudioPlayer';
import { Badge, Button, Card, EmptyState } from '@/components/ui';

export const metadata: Metadata = { title: 'Panel' };

/**
 * Panel de usuario.
 *
 * Server Component: las tres consultas salen en paralelo y la página llega
 * ya renderizada. Un panel que pinta esqueletos y luego rellena da sensación
 * de lentitud aunque tarde lo mismo.
 */
export default async function DashboardPage() {
  const cookie = await forwardedCookie();

  const [dashboard, voices, songs] = await Promise.all([
    api.dashboard(cookie),
    api.listVoices(cookie),
    api.listSongs(undefined, cookie),
  ]);

  const readyVoice = voices.voices.find((voice) => voice.status === 'ready');
  const recentSongs = songs.items.slice(0, 3);
  const canAfford = dashboard.balance >= CREDIT_COSTS.songGeneration;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold sm:text-3xl">Tu estudio</h1>
        <p className="mt-2 text-ink-400">
          {readyVoice
            ? 'Tu voz está lista. Escribe una idea y conviértela en canción.'
            : 'Primer paso: entrena un modelo con tu voz.'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Créditos" value={dashboard.balance} tone="accent" />
        <Stat label="Canciones" value={dashboard.songCount} />
        <Stat label="Voces listas" value={dashboard.readyVoices} />
        <Stat label="En proceso" value={dashboard.activeJobs} tone={dashboard.activeJobs > 0 ? 'warning' : 'neutral'} />
      </div>

      {/* La acción principal depende de dónde esté el usuario en su recorrido:
          sin voz entrenada, crear una canción no es posible todavía. */}
      {!readyVoice ? (
        <Card className="aurora">
          <h2 className="text-lg font-semibold">Entrena tu voz</h2>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-ink-400">
            Graba o sube entre 2 y 10 minutos de tu voz. Analizamos la calidad antes de entrenar y
            te decimos exactamente qué corregir si algo no sirve.
          </p>
          <Link href="/app/voices/new" className="mt-6 inline-block">
            <Button size="lg">Empezar</Button>
          </Link>
        </Card>
      ) : (
        <Card className="aurora">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Crea una canción</h2>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-ink-400">
                Cantará <strong className="text-ink-100">{readyVoice.name}</strong>. Elige género,
                idioma y estructura, y escribe la letra o deja que la IA la escriba.
              </p>
            </div>
            <Badge tone="accent">{CREDIT_COSTS.songGeneration} créditos</Badge>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/app/create">
              <Button size="lg" disabled={!canAfford}>
                Crear canción
              </Button>
            </Link>
            {!canAfford && (
              <Link href="/app/credits">
                <Button variant="secondary" size="lg">
                  Conseguir créditos
                </Button>
              </Link>
            )}
          </div>
        </Card>
      )}

      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Últimas canciones</h2>
          {songs.items.length > 0 && (
            <Link href="/app/songs" className="text-sm text-accent-300 hover:underline">
              Ver todas
            </Link>
          )}
        </div>

        {recentSongs.length === 0 ? (
          <EmptyState
            icon="♪"
            title="Todavía no hay nada aquí"
            description="Cuando generes tu primera canción aparecerá en esta lista, con todas sus versiones."
          />
        ) : (
          <ul className="space-y-3">
            {recentSongs.map((song) => {
              const latest = song.versions[0];
              return (
                <Card key={song.id} as="li">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <Link
                      href={`/app/songs/${song.id}`}
                      className="font-medium hover:text-accent-300"
                    >
                      {song.title}
                    </Link>
                    <Badge tone={latest?.status === 'ready' ? 'success' : 'warning'}>
                      {latest?.status === 'ready' ? 'Lista' : 'Generando'}
                    </Badge>
                  </div>

                  {latest?.mp3Url ? (
                    <AudioPlayer
                      src={latest.mp3Url}
                      waveform={latest.waveform}
                      durationSeconds={latest.durationSeconds}
                      title={song.title}
                      compact
                    />
                  ) : (
                    <p className="text-sm text-ink-600">Preparando el audio…</p>
                  )}
                </Card>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  tone?: 'neutral' | 'accent' | 'warning';
}) {
  const tones = {
    neutral: 'text-ink-100',
    accent: 'text-accent-300',
    warning: 'text-warning',
  } as const;

  return (
    <div className="surface p-4">
      <p className="text-xs uppercase tracking-wide text-ink-600">{label}</p>
      <p className={`mt-1.5 text-2xl font-semibold tabular-nums ${tones[tone]}`}>{value}</p>
    </div>
  );
}
