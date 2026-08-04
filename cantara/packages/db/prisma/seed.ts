/**
 * Datos de demostración.
 *
 * Crea una cuenta con créditos, una voz ya entrenada y un par de canciones
 * en el historial, para que al abrir la app por primera vez haya algo que
 * mirar en lugar de estados vacíos.
 */
import { hash } from '@node-rs/argon2';
import { SIGNUP_CREDITS, defaultBpm } from '@cantara/shared';
import { PrismaClient } from '../src/generated/index.js';

const prisma = new PrismaClient();

const DEMO_EMAIL = 'demo@cantara.app';
const DEMO_PASSWORD = 'cantara-demo-2026';

async function main() {
  console.log('Sembrando datos de demostración…');

  const existing = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (existing) {
    console.log(`  El usuario ${DEMO_EMAIL} ya existe. Nada que hacer.`);
    return;
  }

  const passwordHash = await hash(DEMO_PASSWORD, {
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });

  const user = await prisma.user.create({
    data: {
      email: DEMO_EMAIL,
      passwordHash,
      displayName: 'Cuenta de demostración',
      emailVerifiedAt: new Date(),
      consents: {
        create: { version: '2026-08-01', ip: '127.0.0.1', userAgent: 'seed' },
      },
    },
  });

  await prisma.creditLedger.create({
    data: {
      userId: user.id,
      amount: SIGNUP_CREDITS * 4,
      reason: 'promotional',
      description: 'Créditos de la cuenta de demostración',
      balanceAfter: SIGNUP_CREDITS * 4,
      idempotencyKey: `seed:credits:${user.id}`,
    },
  });

  const voice = await prisma.voiceModel.create({
    data: {
      userId: user.id,
      name: 'Mi voz',
      status: 'READY',
      register: 'LOW',
      provider: 'local',
      providerModelId: 'local-demo-voice',
      totalSeconds: 312,
      qualityScore: 87,
      readyAt: new Date(),
    },
  });

  const songs: Array<{
    title: string;
    prompt: string;
    genre: string;
    language: string;
  }> = [
    {
      title: 'Luces de agosto',
      prompt: 'Una canción de verano, nostálgica pero luminosa, sobre volver a casa',
      genre: 'latin-pop',
      language: 'es',
    },
    {
      title: 'Nada que perder',
      prompt: 'Reguetón con energía de madrugada y un estribillo que se pega',
      genre: 'reggaeton',
      language: 'es',
    },
  ];

  for (const [index, item] of songs.entries()) {
    const song = await prisma.song.create({
      data: {
        userId: user.id,
        voiceModelId: voice.id,
        title: item.title,
        prompt: item.prompt,
        genre: item.genre,
        language: item.language,
        structure: 'standard',
        timbre: 'natural',
        bpm: defaultBpm(item.genre as never),
        durationSeconds: 180,
        lyrics: {
          title: item.title,
          language: item.language,
          sections: [
            { kind: 'verse', lines: ['Demo — la letra real se genera en el pipeline'] },
            { kind: 'chorus', lines: ['Demo — estribillo'] },
          ],
        },
        versions: {
          create: {
            version: 1,
            status: 'READY',
            durationSeconds: 180,
            musicProvider: 'local',
            waveform: Array.from({ length: 120 }, (_, i) =>
              Number((0.35 + 0.45 * Math.abs(Math.sin(i / 7 + index))).toFixed(3)),
            ),
            readyAt: new Date(),
          },
        },
      },
    });
    console.log(`  Canción creada: ${song.title}`);
  }

  console.log('\nListo.');
  console.log(`  Email:      ${DEMO_EMAIL}`);
  console.log(`  Contraseña: ${DEMO_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
