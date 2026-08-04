/**
 * Conversión de filas de base de datos a DTO de API.
 *
 * Existe para que ninguna ruta devuelva una entidad de Prisma directamente:
 * eso filtraría `passwordHash`, `providerModelId` y claves internas de
 * almacenamiento en cuanto alguien añadiera un campo al modelo.
 */

import { lyricsSchema, type SongDto, type SongVersionDto, type VoiceModelDto } from '@cantara/shared';
import type { StoragePort } from '@cantara/ai';
import type { Prisma } from '@cantara/db';

type VoiceModelWithSamples = Prisma.VoiceModelGetPayload<{
  include: { samples: { include: { upload: true } } };
}>;

type SongWithVersions = Prisma.SongGetPayload<{
  include: { versions: true; voiceModel: { select: { name: true } } };
}>;

const STATUS_TO_DTO = {
  PENDING: 'pending',
  TRAINING: 'training',
  READY: 'ready',
  FAILED: 'failed',
} as const;

const VERSION_STATUS_TO_DTO = {
  QUEUED: 'queued',
  GENERATING: 'generating',
  READY: 'ready',
  FAILED: 'failed',
} as const;

export async function serializeVoiceModel(
  model: VoiceModelWithSamples,
  storage: StoragePort,
  activeJobId: string | null = null,
): Promise<VoiceModelDto> {
  return {
    id: model.id,
    name: model.name,
    status: STATUS_TO_DTO[model.status],
    register: model.register === 'HIGH' ? 'high' : 'low',
    instant: model.instant,
    totalSeconds: model.totalSeconds,
    qualityScore: model.qualityScore,
    provider: model.provider,
    failureReason: model.failureReason,
    // Se firma bajo demanda: guardar URLs en base de datos las convertiría en
    // enlaces caducados que fallan justo cuando el usuario pulsa.
    previewUrl: model.previewKey ? await storage.signedDownloadUrl(model.previewKey) : null,
    createdAt: model.createdAt.toISOString(),
    readyAt: model.readyAt?.toISOString() ?? null,
    samples: model.samples.map((sample) => ({
      id: sample.id,
      fileName: sample.upload.fileName,
      durationSeconds: sample.durationSeconds,
      sizeBytes: sample.upload.sizeBytes,
      qualityScore: sample.qualityScore,
      issues: sample.issues,
    })),
    activeJobId,
  };
}

export async function serializeSongVersion(
  version: SongWithVersions['versions'][number],
  storage: StoragePort,
  activeJobId: string | null = null,
): Promise<SongVersionDto> {
  const [mp3Url, wavUrl] = await Promise.all([
    version.mp3Key ? storage.signedDownloadUrl(version.mp3Key) : null,
    version.wavKey ? storage.signedDownloadUrl(version.wavKey) : null,
  ]);

  return {
    id: version.id,
    version: version.version,
    status: VERSION_STATUS_TO_DTO[version.status],
    durationSeconds: version.durationSeconds,
    mp3Url,
    wavUrl,
    waveform: version.waveform.length > 0 ? version.waveform : null,
    failureReason: version.failureReason,
    createdAt: version.createdAt.toISOString(),
    readyAt: version.readyAt?.toISOString() ?? null,
    activeJobId,
  };
}

export async function serializeSong(
  song: SongWithVersions,
  storage: StoragePort,
  activeJobs: ReadonlyMap<string, string> = new Map(),
): Promise<SongDto> {
  const lyrics = lyricsSchema.safeParse(song.lyrics);

  const versions = await Promise.all(
    [...song.versions]
      .sort((a, b) => b.version - a.version)
      .map((version) => serializeSongVersion(version, storage, activeJobs.get(version.id) ?? null)),
  );

  return {
    id: song.id,
    title: song.title,
    prompt: song.prompt,
    genre: song.genre as SongDto['genre'],
    language: song.language as SongDto['language'],
    structure: song.structure as SongDto['structure'],
    timbre: song.timbre as SongDto['timbre'],
    instrumental: song.instrumental,
    bpm: song.bpm,
    // Una letra que ya no valida contra el esquema se devuelve como nula en
    // lugar de romper la respuesta entera del historial.
    lyrics: lyrics.success ? lyrics.data : null,
    voiceModelId: song.voiceModelId,
    voiceModelName: song.voiceModel?.name ?? null,
    createdAt: song.createdAt.toISOString(),
    versions,
  };
}
