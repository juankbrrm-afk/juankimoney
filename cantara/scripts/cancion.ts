#!/usr/bin/env -S npx tsx
/**
 * Cantara CLI — una carpeta con tus grabaciones, un comando, tu canción.
 *
 * Sin cuentas, sin base de datos, sin servidor. Reutiliza exactamente el
 * mismo pipeline que la aplicación web (`packages/ai`), que no sabe nada de
 * HTTP ni de Postgres — por eso puede ejecutarse así.
 *
 *   npm run cancion -- --voz ./mi-voz --prompt "reguetón de verano"
 *
 * La primera vez entrena tu voz y guarda el modelo en `.mi-voz.json`. Las
 * siguientes lo reutiliza, así que solo esperas una vez.
 */

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import {
  GENRES,
  GENRE_PROFILES,
  LANGUAGES,
  MIN_USABLE_SCORE,
  SONG_STRUCTURES,
  VOCAL_TIMBRES,
  VOICE_SAMPLE_LIMITS,
  defaultBpm,
  formatDuration,
  stageLabel,
  type Genre,
  type Language,
  type SongStructure,
  type VocalTimbre,
} from '@cantara/shared';
import {
  createProviders,
  generateSong,
  trainVoice,
  type StoragePort,
  type VoiceHandle,
} from '@cantara/ai';

// ── Almacenamiento en disco, sin S3 ──────────────────────────

const AUDIO = new Set(['.wav', '.mp3', '.m4a', '.aac', '.ogg', '.webm', '.flac']);

const MIME: Record<string, string> = {
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.webm': 'audio/webm',
  '.flac': 'audio/flac',
};

/**
 * Los archivos van a una carpeta local. El pipeline solo necesita un
 * `StoragePort`; que detrás haya S3 o el disco de tu portátil le da igual.
 */
class CarpetaLocal implements StoragePort {
  constructor(private readonly raiz: string) {}

  private ruta(clave: string): string {
    return join(this.raiz, clave.replaceAll('/', '__'));
  }

  async put(clave: string, datos: Uint8Array): Promise<void> {
    await mkdir(this.raiz, { recursive: true });
    await writeFile(this.ruta(clave), datos);
  }
  async get(clave: string): Promise<Uint8Array> {
    return new Uint8Array(await readFile(this.ruta(clave)));
  }
  async delete(): Promise<void> {}
  async exists(clave: string): Promise<boolean> {
    return existsSync(this.ruta(clave));
  }
  /**
   * URL que un proveedor externo puede descargar.
   *
   * Aquí no hay servidor ni bucket, así que `file://` no le sirve a nadie:
   * Replicate corre en otra máquina. Se devuelve el audio como data URI, que
   * sus APIs aceptan igual que una URL http. Es lo que hace posible usar
   * proveedores de GPU reales desde un CLI sin infraestructura.
   */
  async signedDownloadUrl(clave: string): Promise<string> {
    const datos = await this.get(clave);
    const tipo = MIME[extname(clave).toLowerCase()] ?? 'audio/wav';
    return `data:${tipo};base64,${Buffer.from(datos).toString('base64')}`;
  }
  async signedUploadUrl(clave: string) {
    return { url: `file://${this.ruta(clave)}`, headers: {} };
  }
}

// ── Barra de progreso en la terminal ─────────────────────────

const interactivo = process.stdout.isTTY === true;
let ultimaEtapa = '';

function barra(etiqueta: string, fraccion: number): void {
  // Fuera de una terminal —redirigido a un archivo, en CI, tras un pipe— el
  // `\r` no borra nada y las cien actualizaciones se apilan en una sola línea
  // ilegible. Ahí basta con una línea por etapa.
  if (!interactivo) {
    if (etiqueta !== ultimaEtapa) {
      ultimaEtapa = etiqueta;
      console.log(`  · ${etiqueta}`);
    }
    return;
  }

  const ancho = 28;
  const lleno = Math.round(Math.min(1, Math.max(0, fraccion)) * ancho);
  const linea = `  ${'█'.repeat(lleno)}${'░'.repeat(ancho - lleno)} ${String(
    Math.round(fraccion * 100),
  ).padStart(3)}%  ${etiqueta}`;

  process.stdout.write(`\r${linea.padEnd(78)}`);
}

async function main() {
  const { values } = parseArgs({
    options: {
      voz: { type: 'string', default: './mi-voz' },
      prompt: { type: 'string' },
      letra: { type: 'string' },
      titulo: { type: 'string' },
      genero: { type: 'string', default: 'reggaeton' },
      idioma: { type: 'string', default: 'es' },
      estructura: { type: 'string', default: 'standard' },
      timbre: { type: 'string', default: 'natural' },
      duracion: { type: 'string', default: '180' },
      salida: { type: 'string', default: './canciones' },
      reentrenar: { type: 'boolean', default: false },
      ayuda: { type: 'boolean', short: 'h', default: false },
    },
  });

  if (values.ayuda || !values.prompt) {
    ayuda();
    process.exit(values.prompt ? 0 : 1);
  }

  const genero = values.genero as Genre;
  if (!GENRES.includes(genero)) {
    fallar(`Género no válido: ${genero}\n\nDisponibles: ${GENRES.join(', ')}`);
  }

  const idioma = values.idioma as Language;
  if (!LANGUAGES.includes(idioma)) {
    fallar(`Idioma no válido: ${idioma}\n\nDisponibles: ${LANGUAGES.join(', ')}`);
  }

  const carpetaVoz = resolve(values.voz!);
  const carpetaSalida = resolve(values.salida!);
  const trabajo = new CarpetaLocal(join(carpetaSalida, '.trabajo'));

  console.log('\n🎙  Cantara\n');

  const proveedores = await createProviders(process.env, {
    warn: () => {},
    info: () => {},
  });

  // Aviso honesto y temprano: sin proveedor real, la salida no es tu voz.
  const esSintetico = proveedores.converter.name === 'local';
  if (esSintetico) {
    console.log('⚠️  Modo demostración: sin REPLICATE_API_TOKEN la voz es sintética,');
    console.log('   no la tuya. Ver GUIA-PERSONAL.md para activarla de verdad.\n');
  }

  // ── 1. Tu voz ──────────────────────────────────────────────

  const cacheVoz = join(carpetaVoz, '.modelo.json');
  let voz: { handle: VoiceHandle; isLowRegister: boolean };

  if (!values.reentrenar && existsSync(cacheVoz)) {
    const guardado = JSON.parse(await readFile(cacheVoz, 'utf8'));
    voz = { handle: guardado.handle, isLowRegister: guardado.isLowRegister ?? true };
    console.log(`✓ Uso tu voz ya entrenada (--reentrenar para rehacerla)\n`);
  } else {
    if (!existsSync(carpetaVoz)) {
      fallar(
        `No encuentro la carpeta ${carpetaVoz}\n\n` +
          `Créala y mete dentro entre 2 y 10 minutos de grabaciones tuyas:\n` +
          `  mkdir -p ${values.voz}\n` +
          `  (copia ahí tus .wav, .mp3, .m4a…)`,
      );
    }

    const archivos = (await readdir(carpetaVoz))
      .filter((nombre) => AUDIO.has(extname(nombre).toLowerCase()))
      .sort();

    if (archivos.length === 0) {
      fallar(`No hay archivos de audio en ${carpetaVoz}\n\nFormatos: ${[...AUDIO].join(' ')}`);
    }

    console.log(`Encontré ${archivos.length} grabaciones. Analizando y entrenando…`);

    // Se copian al almacén de trabajo, que es de donde lee el pipeline.
    const muestras = [];
    for (const nombre of archivos) {
      const bytes = new Uint8Array(await readFile(join(carpetaVoz, nombre)));
      const clave = `voz/${nombre}`;
      await trabajo.put(clave, bytes);
      muestras.push({
        id: basename(nombre),
        storageKey: clave,
        mime: MIME[extname(nombre).toLowerCase()] ?? 'audio/wav',
      });
    }

    const resultado = await trainVoice(
      { userId: 'yo', voiceModelId: 'mi-voz', instant: false, samples: muestras },
      {
        providers: proveedores,
        storage: trabajo,
        onStage: (etapa, fraccion) => barra(stageLabel('voice-training', etapa), fraccion),
      },
    ).catch((error: Error) => {
      process.stdout.write('\n');
      const detalle = (error as { detail?: string }).detail;
      fallar(
        detalle
          ? `${error.message}\n\n   Respuesta del proveedor:\n   ${detalle}`
          : `${error.message}\n\nGraba en un sitio silencioso y sin saturar el micrófono.`,
      );
    });

    process.stdout.write('\n\n');

    // Se informa de lo medido: es lo que explica una voz que suena regular.
    for (const muestra of resultado.analyzed) {
      const marca = muestra.includedInTraining ? '✓' : '✗';
      const avisos = muestra.quality.issues.length > 0 ? ` (${muestra.quality.issues.join(', ')})` : '';
      console.log(
        `  ${marca} ${muestra.id} — ${formatDuration(muestra.quality.durationSeconds)}, calidad ${muestra.quality.score}/100${avisos}`,
      );
    }

    console.log(
      `\n✓ Voz lista: ${formatDuration(resultado.totalSeconds)} usados, calidad media ${resultado.qualityScore}/100`,
    );
    if (resultado.qualityScore < MIN_USABLE_SCORE + 20) {
      console.log('  (con grabaciones más limpias sonará bastante mejor)');
    }
    console.log();

    voz = { handle: resultado.handle, isLowRegister: true };
    await writeFile(cacheVoz, JSON.stringify({ ...voz, at: new Date().toISOString() }, null, 2));
  }

  // ── 2. Tu canción ──────────────────────────────────────────

  const perfil = GENRE_PROFILES[genero];
  console.log(`Creando tu canción · ${perfil.icon} ${perfil.label} · ${values.duracion}s\n`);

  const letra = values.letra ? await leerLetra(values.letra, idioma, values.titulo) : null;

  const cancion = await generateSong(
    {
      userId: 'yo',
      versionId: `cancion-${Date.now()}`,
      title: values.titulo,
      prompt: values.prompt!,
      genre: genero,
      language: idioma,
      structure: values.estructura as SongStructure,
      timbre: values.timbre as VocalTimbre,
      bpm: defaultBpm(genero),
      durationSeconds: Number(values.duracion),
      instrumental: false,
      lyrics: letra,
      voice: voz,
    },
    {
      providers: proveedores,
      storage: trabajo,
      onStage: (etapa, fraccion) => barra(stageLabel('song-generation', etapa), fraccion),
    },
  ).catch((error: Error) => {
    process.stdout.write('\n');
    // El `detail` trae la respuesta literal del proveedor —qué campo rechazó,
    // qué esperaba—. Sin él solo quedaría «El proveedor rechazó la petición»,
    // que no le sirve a nadie para arreglarlo.
    const detalle = (error as { detail?: string }).detail;
    fallar(detalle ? `${error.message}\n\n   Respuesta del proveedor:\n   ${detalle}` : error.message);
  });

  process.stdout.write('\n\n');

  // ── 3. Los archivos, donde puedas encontrarlos ─────────────

  await mkdir(carpetaSalida, { recursive: true });

  const nombre = (cancion.lyrics.title || values.titulo || 'cancion')
    .replaceAll(/[^\p{L}\p{N} -]/gu, '')
    .trim()
    .replaceAll(' ', '-')
    .toLowerCase();

  const mp3 = join(carpetaSalida, `${nombre}.mp3`);
  const wav = join(carpetaSalida, `${nombre}.wav`);
  const txt = join(carpetaSalida, `${nombre}.txt`);

  await writeFile(mp3, await trabajo.get(cancion.mp3Key));
  await writeFile(wav, await trabajo.get(cancion.wavKey));
  await writeFile(
    txt,
    `${cancion.lyrics.title}\n\n${cancion.lyrics.sections
      .map((seccion) => `[${seccion.kind}]\n${seccion.lines.join('\n')}`)
      .join('\n\n')}\n`,
  );

  console.log(`🎵 «${cancion.lyrics.title}»\n`);
  console.log(`   ${mp3}`);
  console.log(`   ${wav}`);
  console.log(`   ${txt}\n`);
}

/** Letra propia: texto plano, con o sin marcadores [Verso] / [Estribillo]. */
async function leerLetra(ruta: string, idioma: Language, titulo?: string) {
  const texto = await readFile(resolve(ruta), 'utf8');
  const secciones: Array<{ kind: string; lines: string[] }> = [];
  let actual: { kind: string; lines: string[] } | null = null;

  for (const cruda of texto.split('\n')) {
    const linea = cruda.trim();
    if (!linea) continue;

    const marca = /^\[(.+?)\]$/.exec(linea);
    if (marca) {
      if (actual?.lines.length) secciones.push(actual);
      actual = { kind: normalizar(marca[1]!), lines: [] };
      continue;
    }

    actual ??= { kind: 'verse', lines: [] };
    actual.lines.push(linea);
  }
  if (actual?.lines.length) secciones.push(actual);

  if (secciones.length === 0) return null;
  return { title: titulo || 'Sin título', language: idioma, sections: secciones };
}

function normalizar(cruda: string): string {
  const clave = cruda
    .toLowerCase()
    .trim()
    .replaceAll(/\s*\d+$/g, '')
    .normalize('NFD')
    .replaceAll(/[̀-ͯ]/g, '');

  const alias: Record<string, string> = {
    intro: 'intro',
    verso: 'verse',
    verse: 'verse',
    estribillo: 'chorus',
    coro: 'chorus',
    chorus: 'chorus',
    puente: 'bridge',
    bridge: 'bridge',
    outro: 'outro',
    final: 'outro',
  };
  return alias[clave] ?? 'verse';
}

function fallar(mensaje: string): never {
  console.error(`\n❌ ${mensaje}\n`);
  process.exit(1);
}

function ayuda(): void {
  console.log(`
🎙  Cantara — canciones con tu voz

  npm run cancion -- --prompt "de qué va la canción"

Opciones:
  --prompt <texto>    De qué va la canción            (obligatorio)
  --voz <carpeta>     Tus grabaciones                 (por defecto ./mi-voz)
  --genero <género>   ${GENRES.slice(0, 7).join(', ')},
                      ${GENRES.slice(7).join(', ')}   (por defecto reggaeton)
  --idioma <código>   ${LANGUAGES.join(', ')}          (por defecto es)
  --letra <archivo>   Tu letra en .txt                (si no, la escribe la IA)
  --titulo <texto>    Título de la canción
  --estructura <e>    ${SONG_STRUCTURES.join(', ')}
  --timbre <t>        ${VOCAL_TIMBRES.join(', ')}
  --duracion <seg>    30 a 240                        (por defecto 180)
  --salida <carpeta>  Dónde dejar los archivos        (por defecto ./canciones)
  --reentrenar        Rehace el modelo de voz

Primera vez:
  1. mkdir mi-voz
  2. copia ahí entre ${formatDuration(VOICE_SAMPLE_LIMITS.minTotalSeconds)} y ${formatDuration(VOICE_SAMPLE_LIMITS.maxTotalSeconds)} de grabaciones tuyas
  3. npm run cancion -- --prompt "reguetón de verano sobre el barrio"
`);
}

main().catch((error) => {
  console.error('\n❌', error instanceof Error ? error.message : error, '\n');
  process.exit(1);
});
