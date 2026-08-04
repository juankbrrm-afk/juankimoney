import type { Metadata } from 'next';
import Link from 'next/link';
import {
  QUALITY_ISSUE_LABELS,
  formatDuration,
  type QualityIssue,
  type VoiceModelDto,
} from '@cantara/shared';
import { api } from '@/lib/api';
import { forwardedCookie } from '@/lib/server';
import { Badge, Button, Card, EmptyState } from '@/components/ui';
import { VoiceActions } from './VoiceActions';

export const metadata: Metadata = { title: 'Mis voces' };

export default async function VoicesPage() {
  const { voices } = await api.listVoices(await forwardedCookie());

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">Mis voces</h1>
          <p className="mt-2 text-ink-400">
            Cada modelo se entrena una vez y sirve para todas tus canciones.
          </p>
        </div>
        <Link href="/app/voices/new">
          <Button>Nueva voz</Button>
        </Link>
      </div>

      {voices.length === 0 ? (
        <EmptyState
          icon="◍"
          title="Aún no has entrenado ninguna voz"
          description="Graba entre 2 y 10 minutos y tendrás un modelo listo para cantar en cualquier género."
          action={
            <Link href="/app/voices/new">
              <Button size="lg">Entrenar mi voz</Button>
            </Link>
          }
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {voices.map((voice) => (
            <VoiceCard key={voice.id} voice={voice} />
          ))}
        </ul>
      )}
    </div>
  );
}

function VoiceCard({ voice }: { voice: VoiceModelDto }) {
  const rejected = voice.samples.filter((sample) => sample.issues.length > 0);

  return (
    <Card as="li" className="flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-semibold">{voice.name}</h2>
          <p className="mt-1 text-sm text-ink-600">
            {formatDuration(voice.totalSeconds)} · {voice.samples.length} grabaciones
            {voice.instant && ' · instantánea'}
          </p>
        </div>
        <StatusBadge status={voice.status} />
      </div>

      {voice.status === 'ready' && voice.qualityScore !== null && (
        <div className="mt-4">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-ink-400">Calidad del material</span>
            <span className="font-mono tabular-nums text-ink-100">{voice.qualityScore}/100</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-800">
            <div
              className={`h-full rounded-full ${
                voice.qualityScore >= 75
                  ? 'bg-success'
                  : voice.qualityScore >= 50
                    ? 'bg-warning'
                    : 'bg-danger'
              }`}
              style={{ width: `${voice.qualityScore}%` }}
            />
          </div>
        </div>
      )}

      {/* Los defectos detectados se muestran aunque el entrenamiento haya ido
          bien: explican por qué una voz suena peor de lo esperado. */}
      {rejected.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {[...new Set(rejected.flatMap((sample) => sample.issues))].map((issue) => (
            <Badge key={issue} tone="warning">
              {QUALITY_ISSUE_LABELS[issue as QualityIssue] ?? issue}
            </Badge>
          ))}
        </div>
      )}

      {voice.status === 'failed' && voice.failureReason && (
        <p className="mt-4 rounded-[--radius-control] border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {voice.failureReason}
        </p>
      )}

      {voice.previewUrl && (
        <audio
          controls
          src={voice.previewUrl}
          className="mt-4 w-full"
          aria-label={`Previsualización de ${voice.name}`}
        />
      )}

      <div className="mt-auto pt-5">
        <VoiceActions voice={voice} />
      </div>
    </Card>
  );
}

function StatusBadge({ status }: { status: VoiceModelDto['status'] }) {
  const map = {
    ready: { tone: 'success', label: 'Lista' },
    training: { tone: 'warning', label: 'Entrenando' },
    pending: { tone: 'neutral', label: 'En cola' },
    failed: { tone: 'danger', label: 'Falló' },
  } as const;

  const config = map[status];
  return <Badge tone={config.tone}>{config.label}</Badge>;
}
