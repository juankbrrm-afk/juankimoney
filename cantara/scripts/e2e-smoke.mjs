/**
 * Prueba de humo de extremo a extremo.
 *
 * Recorre el camino completo del usuario contra la API y el worker reales:
 * registro → subida de grabaciones → entrenamiento de voz → generación de
 * canción → descarga. Verifica además las dos invariantes que más cuestan de
 * comprobar a mano: que el progreso llega por SSE sin retroceder, y que los
 * créditos cuadran con el libro mayor.
 *
 * Corre con los proveedores `local`, así que no necesita ninguna API key.
 *
 *   node scripts/e2e-smoke.mjs
 */

const API = process.env.API_PUBLIC_URL ?? 'http://localhost:4000';

let cookie = '';
let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  [32m✓[0m ${label}`);
  } else {
    failed += 1;
    console.log(`  [31m✗[0m ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function call(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${API}/api${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  return { status: response.status, payload };
}

/**
 * Sigue un trabajo por SSE y devuelve el recorrido completo del progreso.
 * Se lee el stream crudo en lugar de usar EventSource porque este script
 * corre en Node, no en el navegador.
 */
async function followJob(jobId, { timeoutMs = 240_000 } = {}) {
  const response = await fetch(`${API}/api/jobs/${jobId}/stream`, {
    headers: { cookie, accept: 'text/event-stream' },
    signal: AbortSignal.timeout(timeoutMs),
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  const events = [];
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';

    for (const frame of frames) {
      const line = frame.split('\n').find((item) => item.startsWith('data: '));
      if (!line) continue;

      const event = JSON.parse(line.slice(6));
      events.push(event);

      if (['succeeded', 'failed', 'canceled'].includes(event.status)) {
        await reader.cancel().catch(() => {});
        return events;
      }
    }
  }

  return events;
}

/** WAV sintético con contenido vocal plausible, para las muestras de voz. */
function makeWav(seconds, seed = 1) {
  const sampleRate = 44_100;
  const frames = Math.floor(seconds * sampleRate);
  const buffer = Buffer.alloc(44 + frames * 2);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + frames * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(frames * 2, 40);

  // Fundamental con armónicos y envolvente por sílaba: el analizador debe
  // medir una relación señal/ruido alta y poco silencio.
  for (let i = 0; i < frames; i += 1) {
    const t = i / sampleRate;
    const syllable = Math.floor(t * 3) % 5;
    const frequency = 120 + seed * 7 + syllable * 18;
    const envelope = 0.5 + 0.5 * Math.sin(2 * Math.PI * 3 * t);

    const sample =
      (Math.sin(2 * Math.PI * frequency * t) * 0.6 +
        Math.sin(2 * Math.PI * frequency * 2 * t) * 0.25 +
        Math.sin(2 * Math.PI * frequency * 3 * t) * 0.1) *
      envelope *
      0.4;

    buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sample)) * 32_000), 44 + i * 2);
  }

  return buffer;
}

async function uploadSample(bytes, name, durationSeconds) {
  const intent = await call('/uploads', {
    method: 'POST',
    body: {
      fileName: name,
      contentType: 'audio/wav',
      sizeBytes: bytes.length,
      durationSeconds,
    },
  });

  if (intent.status !== 200) throw new Error(`intento de subida falló: ${JSON.stringify(intent.payload)}`);

  const put = await fetch(intent.payload.uploadUrl, {
    method: 'PUT',
    headers: { ...intent.payload.headers, cookie },
    body: bytes,
  });

  if (!put.ok) throw new Error(`PUT al almacén falló: ${put.status}`);

  const confirmed = await call(`/uploads/${intent.payload.uploadId}/confirm`, {
    method: 'POST',
    body: { durationSeconds },
  });

  if (confirmed.status !== 200) {
    throw new Error(`confirmación falló: ${JSON.stringify(confirmed.payload)}`);
  }

  return intent.payload.uploadId;
}

async function main() {
  console.log(`\nPrueba de humo end-to-end contra ${API}\n`);

  // ── Salud ──
  const health = await fetch(`${API}/health`);
  check('la API responde', health.ok);

  // ── Registro ──
  console.log('\nRegistro y sesión');

  const email = `smoke-${Date.now()}@cantara.test`;
  const register = await call('/auth/register', {
    method: 'POST',
    body: {
      email,
      password: 'contraseña-de-prueba-larga',
      displayName: 'Prueba de humo',
      acceptedTerms: true,
    },
  });

  check('registro devuelve 201', register.status === 201, `recibido ${register.status}`);
  check('la cookie de sesión se emite', cookie.startsWith('cantara_session='));

  const signupCredits = register.payload?.user?.credits ?? 0;
  check('se conceden créditos de bienvenida', signupCredits > 0, `${signupCredits}`);

  const me = await call('/auth/me');
  check('la sesión se resuelve', me.status === 200 && me.payload.user.email === email);

  // ── Rechazo con material insuficiente ──
  console.log('\nValidación de las grabaciones');

  const shortUpload = await uploadSample(makeWav(10, 3), 'corta.wav', 10);
  const rejected = await call('/voices', {
    method: 'POST',
    body: {
      name: 'Muy corta',
      register: 'low',
      instant: false,
      uploadIds: [shortUpload],
      consent: { version: '2026-08-01', ownVoiceConfirmed: true },
    },
  });

  check(
    'rechaza menos de 2 minutos de material',
    rejected.status === 400,
    `recibido ${rejected.status}`,
  );

  const noConsent = await call('/voices', {
    method: 'POST',
    body: {
      name: 'Sin consentimiento',
      register: 'low',
      instant: false,
      uploadIds: [shortUpload],
      consent: { version: '2026-08-01', ownVoiceConfirmed: false },
    },
  });

  check('rechaza sin consentimiento', noConsent.status === 400, `recibido ${noConsent.status}`);

  // ── Entrenamiento ──
  console.log('\nEntrenamiento de voz');

  const uploadIds = [];
  for (let i = 0; i < 3; i += 1) {
    uploadIds.push(await uploadSample(makeWav(45, i + 1), `muestra-${i + 1}.wav`, 45));
  }
  check('se suben 3 grabaciones (2:15 en total)', uploadIds.length === 3);

  const created = await call('/voices', {
    method: 'POST',
    body: {
      name: 'Voz de prueba',
      register: 'low',
      instant: false,
      uploadIds,
      consent: { version: '2026-08-01', ownVoiceConfirmed: true },
    },
  });

  check('el entrenamiento se encola (202)', created.status === 202, JSON.stringify(created.payload));
  if (created.status !== 202) return;

  const trainingEvents = await followJob(created.payload.jobId);
  const trainingFinal = trainingEvents.at(-1);

  check(
    'el entrenamiento termina bien',
    trainingFinal?.status === 'succeeded',
    trainingFinal?.error ?? trainingFinal?.status,
  );
  check('llegan eventos de progreso por SSE', trainingEvents.length >= 5, `${trainingEvents.length}`);
  check(
    'el progreso nunca retrocede',
    trainingEvents.every((event, i) => i === 0 || event.progress >= trainingEvents[i - 1].progress),
  );
  check('el progreso final es 100', trainingFinal?.progress === 100);

  const voices = await call('/voices');
  const voice = voices.payload.voices.find((item) => item.id === created.payload.voice.id);
  check('el modelo queda en estado listo', voice?.status === 'ready', voice?.status);
  check('se calcula la puntuación de calidad', typeof voice?.qualityScore === 'number', `${voice?.qualityScore}`);
  check('se genera la previsualización', Boolean(voice?.previewUrl));

  // ── Generación ──
  console.log('\nGeneración de canción');

  const song = await call('/songs', {
    method: 'POST',
    body: {
      title: 'Prueba de humo',
      prompt: 'una canción luminosa sobre volver a casa en verano',
      genre: 'latin-pop',
      language: 'es',
      structure: 'verse-chorus',
      timbre: 'natural',
      voiceModelId: voice.id,
      durationSeconds: 45,
      instrumental: false,
    },
  });

  check('la canción se encola (202)', song.status === 202, JSON.stringify(song.payload));
  if (song.status !== 202) return;

  const songEvents = await followJob(song.payload.jobId);
  const songFinal = songEvents.at(-1);

  check('la generación termina bien', songFinal?.status === 'succeeded', songFinal?.error ?? songFinal?.status);
  check(
    'el progreso de la canción nunca retrocede',
    songEvents.every((event, i) => i === 0 || event.progress >= songEvents[i - 1].progress),
  );

  const stagesSeen = [...new Set(songEvents.map((event) => event.stage).filter(Boolean))];
  check('recorre todas las etapas del pipeline', stagesSeen.length >= 6, stagesSeen.join(' → '));

  const detail = await call(`/songs/${song.payload.song.id}`);
  const version = detail.payload.song.versions[0];

  check('la versión queda lista', version?.status === 'ready', version?.status);
  check('hay URL de MP3', Boolean(version?.mp3Url));
  check('hay URL de WAV', Boolean(version?.wavUrl));
  check('se guardan los picos de la onda', (version?.waveform?.length ?? 0) > 0);
  check('se guarda la letra generada', (detail.payload.song.lyrics?.sections?.length ?? 0) > 0);

  // ── Descargas reales ──
  console.log('\nDescargas');

  const mp3 = await fetch(version.mp3Url, { headers: { cookie } });
  const mp3Bytes = new Uint8Array(await mp3.arrayBuffer());
  check('el MP3 se descarga', mp3.ok && mp3Bytes.length > 1000, `${mp3Bytes.length} bytes`);
  check(
    'el MP3 tiene cabecera válida',
    mp3Bytes[0] === 0xff || (mp3Bytes[0] === 0x49 && mp3Bytes[1] === 0x44),
  );

  const wav = await fetch(version.wavUrl, { headers: { cookie } });
  const wavBytes = new Uint8Array(await wav.arrayBuffer());
  check('el WAV se descarga', wav.ok && wavBytes.length > 1000, `${wavBytes.length} bytes`);
  check(
    'el WAV tiene cabecera RIFF',
    String.fromCharCode(...wavBytes.slice(0, 4)) === 'RIFF',
  );

  // ── Regeneración ──
  console.log('\nRegeneración');

  const regenerated = await call(`/songs/${song.payload.song.id}/regenerate`, {
    method: 'POST',
    body: { rewriteLyrics: false },
  });

  check('la regeneración se encola', regenerated.status === 202, JSON.stringify(regenerated.payload));

  if (regenerated.status === 202) {
    const regenEvents = await followJob(regenerated.payload.jobId);
    check('la segunda versión termina bien', regenEvents.at(-1)?.status === 'succeeded');

    const afterRegen = await call(`/songs/${song.payload.song.id}`);
    check(
      'se conservan ambas versiones',
      afterRegen.payload.song.versions.length === 2,
      `${afterRegen.payload.song.versions.length}`,
    );
  }

  // ── Créditos ──
  console.log('\nCréditos');

  const credits = await call('/credits');
  const ledgerSum = credits.payload.history.reduce((sum, entry) => sum + entry.amount, 0);

  check(
    'el saldo coincide con la suma del libro mayor',
    credits.payload.balance === ledgerSum,
    `saldo ${credits.payload.balance} vs suma ${ledgerSum}`,
  );
  check('se cobró el entrenamiento', credits.payload.history.some((e) => e.reason === 'voice_training'));
  check(
    'se cobraron las dos generaciones',
    credits.payload.history.filter((e) => e.reason === 'song_generation').length === 2,
  );
  check('el saldo bajó respecto al inicial', credits.payload.balance < signupCredits);

  // ── Aislamiento entre usuarios ──
  console.log('\nAislamiento entre cuentas');

  const otherCookie = cookie;
  cookie = '';

  await call('/auth/register', {
    method: 'POST',
    body: {
      email: `intruso-${Date.now()}@cantara.test`,
      password: 'otra-contraseña-larga',
      displayName: 'Intruso',
      acceptedTerms: true,
    },
  });

  const stolen = await call(`/songs/${song.payload.song.id}`);
  check('otra cuenta no puede leer la canción', stolen.status === 404, `recibido ${stolen.status}`);

  const stolenJob = await call(`/jobs/${song.payload.jobId}`);
  check('otra cuenta no puede leer el trabajo', stolenJob.status === 404, `recibido ${stolenJob.status}`);

  cookie = otherCookie;

  const anonymous = await fetch(`${API}/api/songs`);
  check('sin sesión devuelve 401', anonymous.status === 401, `recibido ${anonymous.status}`);

  // ── Resumen ──
  console.log(`\n${'─'.repeat(46)}`);
  console.log(`  ${passed} correctas, ${failed} fallidas`);
  console.log(`${'─'.repeat(46)}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('\nLa prueba de humo falló:', error);
  process.exit(1);
});
