'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { VoiceModelDto } from '@cantara/shared';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui';
import { JobProgress } from '@/components/JobProgress';

/**
 * Acciones sobre un modelo de voz.
 *
 * Si el modelo está entrenando, la tarjeta muestra su progreso en vivo. Esto
 * es lo que hace que recargar la página a mitad del entrenamiento no pierda
 * el hilo: el `activeJobId` viene del servidor y el stream se reengancha.
 */
export function VoiceActions({ voice }: { voice: VoiceModelDto }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (voice.activeJobId) {
    return (
      <JobProgress
        jobId={voice.activeJobId}
        type="voice-training"
        onFinished={() => router.refresh()}
      />
    );
  }

  async function remove() {
    setDeleting(true);
    setError(null);

    try {
      await api.deleteVoice(voice.id);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No se pudo eliminar.');
      setDeleting(false);
      setConfirming(false);
    }
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-danger">{error}</p>}

      {confirming ? (
        <div className="rounded-[--radius-control] border border-danger/30 bg-danger/10 p-3">
          <p className="text-sm text-ink-300">
            Se borrarán las grabaciones y el modelo entrenado, también en el proveedor externo. Tus
            canciones ya generadas se conservan. Esto no se puede deshacer.
          </p>
          <div className="mt-3 flex gap-2">
            <Button variant="danger" size="sm" onClick={remove} loading={deleting}>
              Sí, eliminar
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {voice.status === 'ready' && (
            <Link href={{ pathname: '/app/create', query: { voice: voice.id } }}>
              <Button size="sm">Crear canción</Button>
            </Link>
          )}
          <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
            Eliminar
          </Button>
        </div>
      )}
    </div>
  );
}
