'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CONSENT_VERSION,
  CREDIT_COSTS,
  VOICE_SAMPLE_LIMITS,
  formatBytes,
  formatDuration,
  isSupportedAudioType,
} from '@cantara/shared';
import { api, ApiError, uploadToStorage } from '@/lib/api';
import { Alert, Badge, Button, Card, Field, Input, ProgressBar, Select } from '@/components/ui';
import { VoiceRecorder } from '@/components/VoiceRecorder';
import { JobProgress } from '@/components/JobProgress';

interface Sample {
  id: string;
  fileName: string;
  durationSeconds: number;
  sizeBytes: number;
  /** 0–1 mientras sube; `null` cuando ya está confirmada. */
  uploadProgress: number | null;
  error?: string;
}

/**
 * Estudio de creación de voz.
 *
 * El objetivo de diseño es que el usuario sepa **en todo momento cuánto le
 * falta**: el requisito de 2 minutos es la fuente principal de abandono, y
 * una barra que avanza con cada grabación convierte un requisito opaco en un
 * objetivo alcanzable.
 */
export function VoiceStudio({ balance }: { balance: number }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('Mi voz');
  const [register, setRegister] = useState<'low' | 'high'>('low');
  const [instant, setInstant] = useState(false);
  const [consent, setConsent] = useState(false);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);

  const totalSeconds = samples
    .filter((sample) => !sample.error)
    .reduce((sum, sample) => sum + sample.durationSeconds, 0);

  const cost = instant ? CREDIT_COSTS.instantVoice : CREDIT_COSTS.voiceTraining;
  const hasEnough = totalSeconds >= VOICE_SAMPLE_LIMITS.minTotalSeconds;
  const tooMuch = totalSeconds > VOICE_SAMPLE_LIMITS.maxTotalSeconds;
  const canAfford = balance >= cost;
  const uploading = samples.some((sample) => sample.uploadProgress !== null);

  const addSample = useCallback(async (blob: Blob, fileName: string, durationSeconds: number) => {
    setError(null);

    const contentType = blob.type || 'audio/webm';
    if (!isSupportedAudioType(contentType)) {
      setError(`Formato no soportado: ${contentType}. Usa WAV, MP3, M4A o WEBM.`);
      return;
    }

    if (blob.size > VOICE_SAMPLE_LIMITS.maxBytesPerClip) {
      setError(`Cada archivo debe pesar menos de ${formatBytes(VOICE_SAMPLE_LIMITS.maxBytesPerClip)}.`);
      return;
    }

    // Marcador optimista con id temporal: la fila aparece al instante y el
    // usuario ve la subida progresar en lugar de una pantalla quieta.
    const temporaryId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setSamples((previous) => [
      ...previous,
      { id: temporaryId, fileName, durationSeconds, sizeBytes: blob.size, uploadProgress: 0 },
    ]);

    try {
      const intent = await api.createUpload({
        fileName,
        contentType: contentType as never,
        sizeBytes: blob.size,
        durationSeconds,
      });

      await uploadToStorage(intent.uploadUrl, intent.headers, blob, (fraction) => {
        setSamples((previous) =>
          previous.map((sample) =>
            sample.id === temporaryId ? { ...sample, uploadProgress: fraction } : sample,
          ),
        );
      });

      await api.confirmUpload(intent.uploadId, durationSeconds);

      setSamples((previous) =>
        previous.map((sample) =>
          sample.id === temporaryId
            ? { ...sample, id: intent.uploadId, uploadProgress: null }
            : sample,
        ),
      );
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : 'No se pudo subir el archivo.';
      setSamples((previous) =>
        previous.map((sample) =>
          sample.id === temporaryId ? { ...sample, uploadProgress: null, error: message } : sample,
        ),
      );
    }
  }, []);

  async function handleFiles(files: FileList | null) {
    if (!files) return;

    for (const file of Array.from(files)) {
      if (samples.length >= VOICE_SAMPLE_LIMITS.maxClips) {
        setError(`Máximo ${VOICE_SAMPLE_LIMITS.maxClips} grabaciones.`);
        break;
      }
      // La duración se mide en el navegador para poder mostrar el total sin
      // esperar al servidor; el servidor la vuelve a medir al analizar.
      const duration = await measureDuration(file);
      await addSample(file, file.name, duration);
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function removeSample(id: string) {
    setSamples((previous) => previous.filter((sample) => sample.id !== id));
    if (!id.startsWith('temp-')) await api.deleteUpload(id).catch(() => {});
  }

  async function submit() {
    setError(null);
    setSubmitting(true);

    try {
      const response = await api.createVoice({
        name: name.trim(),
        register,
        instant,
        uploadIds: samples.filter((sample) => !sample.error).map((sample) => sample.id),
        consent: { version: CONSENT_VERSION, ownVoiceConfirmed: true },
      });
      setJobId(response.jobId);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No se pudo iniciar el entrenamiento.');
      setSubmitting(false);
    }
  }

  // Una vez encolado, la pantalla se convierte en el seguimiento del trabajo:
  // mostrar el formulario detrás solo invitaría a reenviarlo.
  if (jobId) {
    return (
      <Card>
        <h2 className="text-lg font-semibold">Entrenando «{name}»</h2>
        <p className="mt-2 text-sm text-ink-400">
          Puedes cerrar esta página: el proceso sigue en el servidor y lo encontrarás en «Mis
          voces».
        </p>

        <JobProgress
          jobId={jobId}
          type="voice-training"
          className="mt-6"
          onFinished={(state) => {
            if (state.status === 'succeeded') {
              router.push('/app/voices');
              router.refresh();
            }
          }}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {error && <Alert>{error}</Alert>}

      <Card>
        <h2 className="text-lg font-semibold">1. Graba o sube tu voz</h2>
        <p className="mt-1.5 text-sm text-ink-400">
          Entre {formatDuration(VOICE_SAMPLE_LIMITS.minTotalSeconds)} y{' '}
          {formatDuration(VOICE_SAMPLE_LIMITS.maxTotalSeconds)} en total. Varias grabaciones
          cortas funcionan mejor que una larga.
        </p>

        <div className="mt-5 space-y-4">
          <VoiceRecorder
            disabled={submitting}
            onRecorded={(blob, duration) =>
              addSample(blob, `grabacion-${samples.length + 1}.webm`, duration)
            }
          />

          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-ink-800" />
            <span className="text-xs uppercase tracking-wide text-ink-700">o sube archivos</span>
            <span className="h-px flex-1 bg-ink-800" />
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            multiple
            className="block w-full cursor-pointer rounded-[--radius-control] border border-dashed border-ink-700 bg-ink-900 p-4 text-sm text-ink-400 file:mr-4 file:cursor-pointer file:rounded-md file:border-0 file:bg-ink-800 file:px-4 file:py-2 file:text-sm file:font-medium file:text-ink-100 hover:border-ink-600"
            onChange={(event) => handleFiles(event.target.files)}
            disabled={submitting}
          />
        </div>

        {/* Progreso hacia el mínimo. Es el indicador que decide si el usuario
            termina el proceso o lo abandona a medias. */}
        <div className="mt-6 space-y-2">
          <div className="flex items-baseline justify-between text-sm">
            <span className={hasEnough ? 'text-success' : 'text-ink-400'}>
              {hasEnough ? '✓ Material suficiente' : 'Material grabado'}
            </span>
            <span className="font-mono tabular-nums text-ink-300">
              {formatDuration(totalSeconds)} / {formatDuration(VOICE_SAMPLE_LIMITS.minTotalSeconds)}
            </span>
          </div>
          <ProgressBar
            value={Math.min(100, (totalSeconds / VOICE_SAMPLE_LIMITS.minTotalSeconds) * 100)}
            label="Progreso hacia el mínimo de grabación"
          />
          {tooMuch && (
            <p className="text-sm text-warning">
              Te has pasado del máximo. Elimina alguna grabación.
            </p>
          )}
        </div>

        {samples.length > 0 && (
          <ul className="mt-5 space-y-2">
            {samples.map((sample) => (
              <li
                key={sample.id}
                className="flex items-center gap-3 rounded-[--radius-control] border border-ink-800 bg-ink-900 px-3.5 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink-100">{sample.fileName}</p>
                  <p className="text-xs text-ink-600">
                    {formatDuration(sample.durationSeconds)} · {formatBytes(sample.sizeBytes)}
                  </p>
                  {sample.uploadProgress !== null && (
                    <ProgressBar value={sample.uploadProgress * 100} className="mt-1.5" />
                  )}
                  {sample.error && <p className="mt-1 text-xs text-danger">{sample.error}</p>}
                </div>

                <button
                  type="button"
                  onClick={() => removeSample(sample.id)}
                  className="shrink-0 rounded-md px-2 py-1 text-sm text-ink-600 transition-colors hover:bg-ink-800 hover:text-danger"
                  aria-label={`Eliminar ${sample.fileName}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="text-lg font-semibold">2. Ajustes</h2>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Field label="Nombre del modelo" htmlFor="voice-name" required>
            <Input
              id="voice-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={60}
              required
            />
          </Field>

          <Field
            label="Registro de tu voz"
            htmlFor="voice-register"
            hint="Nos ayuda a no transponer de más al cambiar de timbre"
          >
            <Select
              id="voice-register"
              value={register}
              onChange={(event) => setRegister(event.target.value as 'low' | 'high')}
            >
              <option value="low">Grave / media</option>
              <option value="high">Aguda</option>
            </Select>
          </Field>
        </div>

        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-[--radius-control] border border-ink-800 bg-ink-900 p-4">
          <input
            type="checkbox"
            checked={instant}
            onChange={(event) => setInstant(event.target.checked)}
            className="mt-0.5 size-4 shrink-0 rounded border-ink-700 bg-ink-950 accent-accent-500"
          />
          <span className="text-sm">
            <span className="flex items-center gap-2 font-medium text-ink-100">
              Voz instantánea
              <Badge tone="accent">{CREDIT_COSTS.instantVoice} créditos</Badge>
            </span>
            <span className="mt-1 block text-ink-400">
              Sin fase de entrenamiento: lista en segundos, con algo menos de fidelidad. Ideal para
              probar antes de invertir en el modelo completo.
            </span>
          </span>
        </label>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold">3. Consentimiento</h2>

        <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            className="mt-0.5 size-4 shrink-0 rounded border-ink-700 bg-ink-900 accent-accent-500"
            required
          />
          <span className="text-ink-300">
            Confirmo que la voz de estas grabaciones es la mía, o que cuento con permiso escrito de
            la persona titular. Entiendo que puedo eliminar el modelo y sus grabaciones en
            cualquier momento.
          </span>
        </label>

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <Button
            size="lg"
            onClick={submit}
            loading={submitting}
            disabled={!hasEnough || tooMuch || !consent || !canAfford || uploading || !name.trim()}
          >
            Entrenar mi voz · {cost} créditos
          </Button>

          {!canAfford && (
            <span className="text-sm text-warning">
              Te faltan {cost - balance} créditos.
            </span>
          )}
          {uploading && <span className="text-sm text-ink-600">Esperando a que suban los archivos…</span>}
        </div>
      </Card>
    </div>
  );
}

/**
 * Duración de un archivo de audio en el navegador.
 *
 * Se apoya en el elemento `<audio>`, que ya sabe descodificar todo lo que el
 * navegador soporta. Ante un archivo ilegible devuelve 0 en lugar de fallar:
 * el servidor lo medirá de nuevo y decidirá.
 */
function measureDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();

    const finish = (value: number) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };

    audio.addEventListener('loadedmetadata', () =>
      finish(Number.isFinite(audio.duration) ? audio.duration : 0),
    );
    audio.addEventListener('error', () => finish(0));

    // Algunos WEBM sin cabecera de duración dejan el evento sin disparar; sin
    // este tope, la interfaz se quedaría esperando para siempre.
    setTimeout(() => finish(Number.isFinite(audio.duration) ? audio.duration : 0), 5000);

    audio.src = url;
  });
}
