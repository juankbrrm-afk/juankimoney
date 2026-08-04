/**
 * Cliente de la API.
 *
 * Un único punto de contacto con el backend, con dos responsabilidades que
 * conviene no repartir: enviar siempre las credenciales (la sesión va en
 * cookie `HttpOnly`, no en `localStorage`) y convertir los errores del
 * servidor en un tipo que los formularios puedan pintar campo a campo.
 */

import type {
  CreateSongInput,
  CreateVoiceInput,
  GenerateLyricsInput,
  JobDto,
  LoginInput,
  Lyrics,
  PublicUser,
  RegisterInput,
  SongDto,
  UploadIntentInput,
  UploadIntentResponse,
  VoiceModelDto,
} from '@cantara/shared';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    /** Mensajes por campo, listos para pintar bajo cada input. */
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isAuthError(): boolean {
    return this.status === 401;
  }

  get isCreditsError(): boolean {
    return this.status === 402;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
  /** Cookies reenviadas al llamar desde un Server Component. */
  cookie?: string;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal, cookie } = options;

  let response: Response;

  try {
    response = await fetch(`${BASE_URL}/api${path}`, {
      method,
      // Imprescindible: sin esto la cookie de sesión no viaja y toda la app
      // parecería deslogueada.
      credentials: 'include',
      headers: {
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(cookie ? { cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal,
      cache: 'no-store',
    });
  } catch (error) {
    // La red caída no da respuesta que interpretar: se traduce a un mensaje
    // accionable en vez de dejar escapar un TypeError sin contexto.
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new ApiError(0, 'network_error', 'No pudimos conectar con el servidor.');
  }

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = (payload as { error?: { code: string; message: string; fields?: Record<string, string> } })?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'unknown',
      error?.message ?? 'Algo salió mal.',
      error?.fields,
    );
  }

  return payload as T;
}

export const api = {
  // ── Autenticación ──
  register: (input: RegisterInput) =>
    request<{ user: PublicUser }>('/auth/register', { method: 'POST', body: input }),

  login: (input: LoginInput) =>
    request<{ user: PublicUser }>('/auth/login', { method: 'POST', body: input }),

  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),

  me: (cookie?: string) => request<{ user: PublicUser }>('/auth/me', { cookie }),

  // ── Panel ──
  dashboard: (cookie?: string) =>
    request<{
      balance: number;
      songCount: number;
      voiceCount: number;
      readyVoices: number;
      activeJobs: number;
    }>('/dashboard', { cookie }),

  // ── Subidas ──
  createUpload: (input: UploadIntentInput) =>
    request<UploadIntentResponse>('/uploads', { method: 'POST', body: input }),

  confirmUpload: (id: string, durationSeconds?: number) =>
    request<{ id: string; fileName: string; durationSeconds: number | null; sizeBytes: number }>(
      `/uploads/${id}/confirm`,
      { method: 'POST', body: { durationSeconds } },
    ),

  deleteUpload: (id: string) => request<void>(`/uploads/${id}`, { method: 'DELETE' }),

  // ── Voces ──
  listVoices: (cookie?: string) => request<{ voices: VoiceModelDto[] }>('/voices', { cookie }),

  getVoice: (id: string, cookie?: string) =>
    request<{ voice: VoiceModelDto }>(`/voices/${id}`, { cookie }),

  createVoice: (input: CreateVoiceInput) =>
    request<{ voice: VoiceModelDto; jobId: string }>('/voices', { method: 'POST', body: input }),

  deleteVoice: (id: string) => request<void>(`/voices/${id}`, { method: 'DELETE' }),

  // ── Canciones ──
  listSongs: (cursor?: string, cookie?: string) =>
    request<{ items: SongDto[]; nextCursor: string | null }>(
      `/songs${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
      { cookie },
    ),

  getSong: (id: string, cookie?: string) =>
    request<{ song: SongDto }>(`/songs/${id}`, { cookie }),

  createSong: (input: CreateSongInput) =>
    request<{ song: SongDto; jobId: string }>('/songs', { method: 'POST', body: input }),

  regenerateSong: (id: string, input: { rewriteLyrics?: boolean; prompt?: string } = {}) =>
    request<{ song: SongDto; jobId: string }>(`/songs/${id}/regenerate`, {
      method: 'POST',
      body: input,
    }),

  archiveSong: (id: string) => request<void>(`/songs/${id}`, { method: 'DELETE' }),

  generateLyrics: (input: GenerateLyricsInput) =>
    request<{ lyrics: Lyrics }>('/lyrics', { method: 'POST', body: input }),

  // ── Créditos ──
  credits: (cookie?: string) =>
    request<{
      balance: number;
      packs: Array<{ id: string; name: string; credits: number; priceCents: number; description: string; highlight?: boolean }>;
      history: Array<{ id: string; amount: number; reason: string; description: string; balanceAfter: number; createdAt: string }>;
    }>('/credits', { cookie }),

  purchaseCredits: (packId: string) =>
    request<{ balance: number }>('/credits/purchase', { method: 'POST', body: { packId } }),

  // ── Trabajos ──
  getJob: (id: string) => request<{ job: JobDto }>(`/jobs/${id}`),

  activeJobs: (cookie?: string) => request<{ jobs: JobDto[] }>('/jobs', { cookie }),
};

/**
 * Sube un archivo directamente al almacén con la URL prefirmada.
 *
 * Se usa XMLHttpRequest en lugar de `fetch` porque es la única forma de
 * obtener progreso de subida en el navegador: `fetch` no expone eventos de
 * envío, y sin ellos la barra de una subida de 40 MB sería una mentira.
 */
export function uploadToStorage(
  url: string,
  headers: Record<string, string>,
  file: File | Blob,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);

    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value);
    }

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new ApiError(xhr.status, 'upload_failed', 'No se pudo subir el archivo.'));
    });

    xhr.addEventListener('error', () =>
      reject(new ApiError(0, 'upload_failed', 'Se cortó la subida del archivo.')),
    );

    signal?.addEventListener('abort', () => xhr.abort(), { once: true });

    xhr.send(file);
  });
}

export { BASE_URL };
