# Cantara

Generador de canciones con IA que canta **con la voz del usuario**.

El usuario graba entre 2 y 10 minutos de su voz una sola vez, escribe una idea
y recibe una canción completa —compuesta, cantada con su timbre, mezclada y
masterizada— descargable en MP3 y WAV.

---

## El problema, y por qué el pipeline tiene esta forma

Ninguna API hace de una pasada lo que pide el producto:

- Los generadores musicales (Suno, Udio, Eleven Music) cantan **con su propia
  voz sintética**. No aceptan un modelo de voz arbitrario como timbre de salida.
- Los clonadores de voz (ElevenLabs, XTTS, F5-TTS) hacen **habla**, no canto:
  no siguen una melodía ni sostienen notas.

La solución es un pipeline de **conversión de voz cantada**:

```
letra → canción guía (voz IA) → separar stems → convertir la voz guía
al timbre del usuario → remezclar → masterizar → codificar
```

La generación musical aporta melodía, arreglo y producción; la conversión
aporta la identidad vocal. Eso es lo que hace que el resultado suene *cantado
por el usuario* y no *leído por el usuario*.

El razonamiento completo, con la comparativa de proveedores y sus costes, está
en [`docs/01-ai-research.md`](docs/01-ai-research.md).

## Arranque rápido

**Funciona sin ninguna API key.** Todos los proveedores de IA caen a un
adaptador `local` determinista que sintetiza audio real, así que el pipeline
completo se ejecuta de principio a fin en cualquier máquina.

```bash
cp .env.example .env                     # ajusta SESSION_SECRET
npm install
npm run infra:up                         # Postgres + Redis + MinIO
npm run setup                            # prisma generate + migrate + seed
npm run dev                              # API :4000 · worker · web :3000
```

Cuenta de demostración: `demo@cantara.app` / `cantara-demo-2026`

Sin Docker: basta con Postgres y Redis locales. Si no configuras S3, el
almacenamiento cae a disco (`.cantara-storage/`) automáticamente.

## Verificación

```bash
npm run typecheck                        # tsc estricto en todo el monorepo
npm run lint                             # oxlint
npm test                                 # 52 tests unitarios y de pipeline
node scripts/e2e-smoke.mjs               # 39 comprobaciones end-to-end
```

La prueba de humo recorre el camino real del usuario contra la API y el worker
—registro, subida, entrenamiento, generación, descarga y regeneración— y
verifica además las dos invariantes difíciles de comprobar a mano: que el
progreso llega por SSE sin retroceder y que el saldo de créditos cuadra con la
suma del libro mayor.

## Estructura

```
packages/
  shared/    Tipos de dominio, esquemas Zod, géneros, créditos, etapas
  db/        Prisma: esquema, migraciones, semilla, ledger de créditos
  ai/        Puertos + adaptadores de IA + los dos pipelines
apps/
  api/       Fastify: auth, subidas, voces, canciones, créditos, SSE
  worker/    BullMQ: entrenamiento de voz y generación de canciones
  web/       Next.js 15: landing, estudio, creador, historial, reproductor
docs/        Investigación, arquitectura, decisiones de stack, legal
infra/       docker-compose para desarrollo
scripts/     Prueba de humo end-to-end
```

## Cambiar de proveedor de IA

Cada capacidad vive tras un puerto (`packages/ai/src/ports.ts`) con al menos
dos adaptadores. Cambiar de proveedor es una variable de entorno:

```bash
LYRICS_PROVIDER=anthropic     # local | anthropic
MUSIC_PROVIDER=elevenlabs     # local | elevenlabs | suno
VOICE_PROVIDER=rvc            # local | rvc | seedvc
STEMS_PROVIDER=demucs         # local | demucs | native
MASTERING_PROVIDER=matchering # local | matchering | landr | dolby | loudnorm
```

Si pides un proveedor y falta su clave, el sistema **avisa y sigue** con el
adaptador local en lugar de negarse a arrancar.

| Etapa | Primario | Por qué |
|---|---|---|
| Letras | Claude | Sigue esquemas estrictos; la letra alimenta al motor musical como estructura |
| Música | ElevenLabs Music | Única con API de primera parte y licencia comercial resuelta antes del lanzamiento |
| Stems | Nativos → Demucs v4 | Si el motor los expone, la separación se salta entera |
| Voz | RVC (seed-vc zero-shot) | Dimensionado exactamente para 2–10 min de material |
| Máster | Matchering 2.0 | Gratis y por referencia de género; `loudnorm` como fallback |

## Decisiones que explican el resto del código

- **El saldo de créditos no se almacena.** Es la suma de un libro mayor de
  solo-inserción. Cobrar es insertar un asiento negativo bajo un bloqueo de
  fila, así que dos generaciones simultáneas no pueden dejar el saldo en
  negativo y todo cargo es auditable.
- **Las canciones son inmutables.** Regenerar crea una `SongVersion` nueva;
  nada se sobrescribe, y el usuario compara tomas.
- **El audio no atraviesa la API.** El navegador sube directo al almacén con
  URL prefirmada: diez minutos de WAV son decenas de megabytes.
- **SSE, no WebSockets.** El flujo es unidireccional; SSE reconecta solo y
  atraviesa proxies. El primer evento se reconstruye desde Postgres, así que
  recargar a mitad de un entrenamiento no pierde el hilo.
- **El pipeline reanuda por etapas.** Cada etapa persiste su artefacto y el
  error los arrastra: un reintento tras fallar en masterización no recompone
  la canción.
- **Solo el pipeline declara una etapa terminada.** El progreso de los
  proveedores se acota por debajo de 1, para que una etapa no marque 100 %
  mientras aún queda guardar su artefacto.

Más detalle en [`docs/02-architecture.md`](docs/02-architecture.md) y
[`docs/03-stack-decisions.md`](docs/03-stack-decisions.md).

## Consentimiento y uso responsable

Entrenar una voz exige un consentimiento explícito y versionado, comprobado en
el servidor —no una casilla en el formulario—. Borrar un modelo borra de verdad:
grabaciones, modelo en el proveedor externo y fila en base de datos. El servicio
está diseñado para que cada usuario cante con **su propia voz**; no hay catálogo
de voces de terceros ni imitación de artistas.

Ver [`docs/05-legal-and-consent.md`](docs/05-legal-and-consent.md).

## Lo que no está incluido

Ambos huecos tienen el puerto definido y el contrato claro, no son un TODO
suelto:

- **Pasarela de pago.** Los créditos están completamente modelados (ledger,
  packs, reserva, reembolso, idempotencia). Conectar Stripe es implementar un
  adaptador y validar su webhook. No se integra porque requiere credenciales y
  una cuenta verificada; fuera de desarrollo la ruta de compra responde 501 en
  lugar de fingir que el pago funcionó.
- **Verificación de email por SMTP.** El modelo tiene `emailVerifiedAt` y el
  flujo de tokens; falta el proveedor de correo.
