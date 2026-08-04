/**
 * Contratos de la API: un único esquema Zod por operación, del que se derivan
 * el tipo de TypeScript y la validación en runtime.
 *
 * El navegador valida antes de enviar (feedback inmediato) y la API valida al
 * recibir (no se confía en el cliente). Ambos usan literalmente este archivo,
 * así que no pueden desincronizarse.
 */

import { z } from 'zod';
import { GENRES, LANGUAGES, SONG_STRUCTURES, VOCAL_TIMBRES } from './music';
import { AUDIO_MIME_TYPES, VOICE_SAMPLE_LIMITS } from './audio';
import { JOB_STATUSES, JOB_TYPES } from './jobs';

// ── Primitivas ───────────────────────────────────────────────

export const idSchema = z.string().min(1).max(64);

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Introduce un email válido')
  .max(254);

export const passwordSchema = z
  .string()
  .min(10, 'La contraseña debe tener al menos 10 caracteres')
  .max(200, 'La contraseña es demasiado larga');

export const displayNameSchema = z
  .string()
  .trim()
  .min(2, 'El nombre debe tener al menos 2 caracteres')
  .max(60, 'El nombre es demasiado largo');

// ── Autenticación ────────────────────────────────────────────

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: displayNameSchema,
  acceptedTerms: z.literal(true, {
    errorMap: () => ({ message: 'Debes aceptar los términos para crear una cuenta' }),
  }),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Introduce tu contraseña'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const publicUserSchema = z.object({
  id: idSchema,
  email: z.string(),
  displayName: z.string(),
  credits: z.number().int(),
  createdAt: z.string(),
});
export type PublicUser = z.infer<typeof publicUserSchema>;

// ── Subidas ──────────────────────────────────────────────────

export const uploadIntentSchema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.enum(AUDIO_MIME_TYPES),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(VOICE_SAMPLE_LIMITS.maxBytesPerClip, 'El archivo supera los 50 MB'),
  /** Duración medida en el cliente; el servidor la vuelve a medir al analizar. */
  durationSeconds: z.number().positive().max(VOICE_SAMPLE_LIMITS.maxClipSeconds).optional(),
});
export type UploadIntentInput = z.infer<typeof uploadIntentSchema>;

export const uploadIntentResponseSchema = z.object({
  uploadId: idSchema,
  /** PUT directo del navegador al almacén: el audio no atraviesa la API. */
  uploadUrl: z.string().url(),
  storageKey: z.string(),
  headers: z.record(z.string()),
  expiresAt: z.string(),
});
export type UploadIntentResponse = z.infer<typeof uploadIntentResponseSchema>;

// ── Modelos de voz ───────────────────────────────────────────

export const VOICE_MODEL_STATUSES = ['pending', 'training', 'ready', 'failed'] as const;
export type VoiceModelStatus = (typeof VOICE_MODEL_STATUSES)[number];

/** Versión vigente del texto de consentimiento. Ver docs/05-legal-and-consent.md. */
export const CONSENT_VERSION = '2026-08-01';

export const createVoiceSchema = z.object({
  name: z.string().trim().min(2, 'Ponle un nombre a tu voz').max(60),
  /** Registro declarado; afina la transposición al cambiar de timbre. */
  register: z.enum(['low', 'high']).default('low'),
  /** Zero-shot: sin entrenamiento, resultado inmediato y algo menos fiel. */
  instant: z.boolean().default(false),
  uploadIds: z
    .array(idSchema)
    .min(1, 'Sube al menos una grabación')
    .max(VOICE_SAMPLE_LIMITS.maxClips, `Máximo ${VOICE_SAMPLE_LIMITS.maxClips} grabaciones`),
  consent: z.object({
    version: z.string(),
    /**
     * No es una casilla decorativa: la API rechaza el entrenamiento sin ella,
     * y se guarda con IP y fecha.
     */
    ownVoiceConfirmed: z.literal(true, {
      errorMap: () => ({
        message: 'Debes confirmar que la voz es tuya o que tienes permiso para usarla',
      }),
    }),
  }),
});
export type CreateVoiceInput = z.infer<typeof createVoiceSchema>;

export const voiceSampleSchema = z.object({
  id: idSchema,
  fileName: z.string(),
  durationSeconds: z.number(),
  sizeBytes: z.number(),
  qualityScore: z.number().nullable(),
  issues: z.array(z.string()),
});
export type VoiceSampleDto = z.infer<typeof voiceSampleSchema>;

export const voiceModelSchema = z.object({
  id: idSchema,
  name: z.string(),
  status: z.enum(VOICE_MODEL_STATUSES),
  register: z.enum(['low', 'high']),
  instant: z.boolean(),
  totalSeconds: z.number(),
  qualityScore: z.number().nullable(),
  provider: z.string(),
  failureReason: z.string().nullable(),
  previewUrl: z.string().nullable(),
  createdAt: z.string(),
  readyAt: z.string().nullable(),
  samples: z.array(voiceSampleSchema),
  activeJobId: idSchema.nullable(),
});
export type VoiceModelDto = z.infer<typeof voiceModelSchema>;

// ── Letras ───────────────────────────────────────────────────

export const lyricsSectionSchema = z.object({
  kind: z.string(),
  lines: z.array(z.string()),
});
export type LyricsSection = z.infer<typeof lyricsSectionSchema>;

export const lyricsSchema = z.object({
  title: z.string(),
  language: z.enum(LANGUAGES),
  sections: z.array(lyricsSectionSchema).min(1),
});
export type Lyrics = z.infer<typeof lyricsSchema>;

export const generateLyricsSchema = z.object({
  prompt: z.string().trim().min(3, 'Describe de qué va la canción').max(1500),
  genre: z.enum(GENRES),
  language: z.enum(LANGUAGES),
  structure: z.enum(SONG_STRUCTURES).default('standard'),
  /** Opcional: un título propio ancla el tema de la letra. */
  title: z.string().trim().max(120).optional(),
});
export type GenerateLyricsInput = z.infer<typeof generateLyricsSchema>;

// ── Canciones ────────────────────────────────────────────────

export const createSongSchema = z
  .object({
    title: z.string().trim().max(120).optional(),
    prompt: z
      .string()
      .trim()
      .min(3, 'Describe el estilo que buscas')
      .max(1500, 'El prompt es demasiado largo'),
    genre: z.enum(GENRES),
    language: z.enum(LANGUAGES),
    structure: z.enum(SONG_STRUCTURES).default('standard'),
    timbre: z.enum(VOCAL_TIMBRES).default('natural'),
    voiceModelId: idSchema.nullable().default(null),
    /** Ausente ⇒ la letra la escribe la IA a partir del prompt. */
    lyrics: lyricsSchema.nullable().default(null),
    bpm: z.number().int().min(40).max(200).optional(),
    durationSeconds: z.number().int().min(30).max(240).default(180),
    /** Instrumental: sin voz, así que no requiere modelo de voz. */
    instrumental: z.boolean().default(false),
  })
  .refine((value) => value.instrumental || value.voiceModelId !== null, {
    message: 'Elige un modelo de voz o marca la canción como instrumental',
    path: ['voiceModelId'],
  });
export type CreateSongInput = z.infer<typeof createSongSchema>;

export const SONG_VERSION_STATUSES = ['queued', 'generating', 'ready', 'failed'] as const;
export type SongVersionStatus = (typeof SONG_VERSION_STATUSES)[number];

export const songVersionSchema = z.object({
  id: idSchema,
  version: z.number().int(),
  status: z.enum(SONG_VERSION_STATUSES),
  durationSeconds: z.number().nullable(),
  mp3Url: z.string().nullable(),
  wavUrl: z.string().nullable(),
  waveform: z.array(z.number()).nullable(),
  failureReason: z.string().nullable(),
  createdAt: z.string(),
  readyAt: z.string().nullable(),
  activeJobId: idSchema.nullable(),
});
export type SongVersionDto = z.infer<typeof songVersionSchema>;

export const songSchema = z.object({
  id: idSchema,
  title: z.string(),
  prompt: z.string(),
  genre: z.enum(GENRES),
  language: z.enum(LANGUAGES),
  structure: z.enum(SONG_STRUCTURES),
  timbre: z.enum(VOCAL_TIMBRES),
  instrumental: z.boolean(),
  bpm: z.number().int(),
  lyrics: lyricsSchema.nullable(),
  voiceModelId: idSchema.nullable(),
  voiceModelName: z.string().nullable(),
  createdAt: z.string(),
  versions: z.array(songVersionSchema),
});
export type SongDto = z.infer<typeof songSchema>;

export const regenerateSongSchema = z.object({
  /** Ajustes opcionales; lo que no se envía se hereda de la canción original. */
  prompt: z.string().trim().min(3).max(1500).optional(),
  genre: z.enum(GENRES).optional(),
  timbre: z.enum(VOCAL_TIMBRES).optional(),
  bpm: z.number().int().min(40).max(200).optional(),
  /** Reescribir la letra en lugar de reutilizarla (cuesta más créditos). */
  rewriteLyrics: z.boolean().default(false),
});
export type RegenerateSongInput = z.infer<typeof regenerateSongSchema>;

// ── Créditos ─────────────────────────────────────────────────

export const creditEntrySchema = z.object({
  id: idSchema,
  amount: z.number().int(),
  reason: z.string(),
  description: z.string(),
  balanceAfter: z.number().int(),
  createdAt: z.string(),
});
export type CreditEntryDto = z.infer<typeof creditEntrySchema>;

// ── Trabajos ─────────────────────────────────────────────────

export const jobSchema = z.object({
  id: idSchema,
  type: z.enum(JOB_TYPES),
  status: z.enum(JOB_STATUSES),
  stage: z.string().nullable(),
  progress: z.number().int().min(0).max(100),
  message: z.string(),
  error: z.string().nullable(),
  resultId: idSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type JobDto = z.infer<typeof jobSchema>;

// ── Paginación y errores ─────────────────────────────────────

export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationInput = z.infer<typeof paginationSchema>;

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    /** Errores de validación por campo, listos para pintar bajo cada input. */
    fields: z.record(z.string()).optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
