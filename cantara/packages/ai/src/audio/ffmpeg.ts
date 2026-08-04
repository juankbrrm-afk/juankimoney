/**
 * Envoltura de ffmpeg.
 *
 * ffmpeg es la ruta de producción para todo lo pesado: descodificar
 * contenedores arbitrarios, remuestrear con calidad y normalizar sonoridad.
 * Pero no está garantizado en toda máquina ni en CI, así que su presencia se
 * detecta una vez al arrancar y el sistema elige adaptador en consecuencia.
 * Nada aquí lanza excepción por no encontrar el binario: quien pregunta
 * decide.
 */

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let cachedAvailability: boolean | null = null;

export async function ffmpegAvailable(): Promise<boolean> {
  if (cachedAvailability !== null) return cachedAvailability;
  cachedAvailability = await new Promise<boolean>((resolve) => {
    const child = spawn('ffmpeg', ['-version'], { stdio: 'ignore' });
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
  });
  return cachedAvailability;
}

/** Solo para tests: fuerza el resultado de la detección. */
export function __setFfmpegAvailability(value: boolean | null): void {
  cachedAvailability = value;
}

export class FfmpegError extends Error {
  constructor(
    message: string,
    readonly stderr: string,
  ) {
    super(message);
    this.name = 'FfmpegError';
  }
}

function run(args: readonly string[], signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
      stdio: ['ignore', 'ignore', 'pipe'],
      signal,
    });

    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      // Acotado: un error de ffmpeg puede escupir megabytes y no queremos
      // que un fallo de audio se convierta en un problema de memoria.
      if (stderr.length < 16_384) stderr += chunk.toString();
    });

    child.on('error', (error) => reject(new FfmpegError(error.message, stderr)));
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new FfmpegError(`ffmpeg terminó con código ${code}`, stderr));
    });
  });
}

/** Ejecuta ffmpeg sobre bytes en memoria usando archivos temporales. */
async function transform(
  input: Uint8Array,
  inputExtension: string,
  outputExtension: string,
  args: (inputPath: string, outputPath: string) => string[],
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const dir = await mkdtemp(join(tmpdir(), 'cantara-'));
  const inputPath = join(dir, `in.${inputExtension}`);
  const outputPath = join(dir, `out.${outputExtension}`);

  try {
    await writeFile(inputPath, input);
    await run(args(inputPath, outputPath), signal);
    return new Uint8Array(await readFile(outputPath));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Convierte cualquier contenedor soportado a WAV PCM. */
export async function toWav(
  input: Uint8Array,
  options: { sampleRate?: number; channels?: number; bitDepth?: 16 | 24; signal?: AbortSignal } = {},
): Promise<Uint8Array> {
  const { sampleRate = 44_100, channels = 2, bitDepth = 24 } = options;
  const codec = bitDepth === 16 ? 'pcm_s16le' : 'pcm_s24le';

  return transform(
    input,
    'bin',
    'wav',
    (inputPath, outputPath) => [
      '-i', inputPath,
      '-vn',
      '-ar', String(sampleRate),
      '-ac', String(channels),
      '-c:a', codec,
      outputPath,
    ],
    options.signal,
  );
}

export async function toMp3(
  input: Uint8Array,
  options: { bitrateKbps?: number; signal?: AbortSignal } = {},
): Promise<Uint8Array> {
  const { bitrateKbps = 320 } = options;

  return transform(
    input,
    'wav',
    'mp3',
    (inputPath, outputPath) => [
      '-i', inputPath,
      '-c:a', 'libmp3lame',
      '-b:a', `${bitrateKbps}k`,
      '-ar', '44100',
      outputPath,
    ],
    options.signal,
  );
}

/**
 * Normalización de sonoridad EBU R128 en dos pasadas.
 *
 * Una sola pasada trabaja a ciegas y produce bombeo audible; la primera mide
 * el material completo y la segunda aplica la corrección exacta. Es el
 * fallback de masterización cuando no hay proveedor externo.
 */
export async function loudnorm(
  input: Uint8Array,
  options: { targetLufs?: number; truePeakDb?: number; signal?: AbortSignal } = {},
): Promise<Uint8Array> {
  const { targetLufs = -14, truePeakDb = -1 } = options;

  return transform(
    input,
    'wav',
    'wav',
    (inputPath, outputPath) => [
      '-i', inputPath,
      '-af', `loudnorm=I=${targetLufs}:TP=${truePeakDb}:LRA=11:print_format=summary`,
      '-ar', '44100',
      '-c:a', 'pcm_s24le',
      outputPath,
    ],
    options.signal,
  );
}

/** Duración en segundos vía ffprobe. `null` si no está disponible. */
export async function probeDuration(input: Uint8Array): Promise<number | null> {
  const dir = await mkdtemp(join(tmpdir(), 'cantara-probe-'));
  const inputPath = join(dir, 'in.bin');

  try {
    await writeFile(inputPath, input);
    const output = await new Promise<string>((resolve, reject) => {
      const child = spawn('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        inputPath,
      ]);
      let stdout = '';
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.on('error', reject);
      child.on('close', () => resolve(stdout.trim()));
    });

    const duration = Number.parseFloat(output);
    return Number.isFinite(duration) ? duration : null;
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
