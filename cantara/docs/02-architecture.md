# Arquitectura

## Vista general

```
                        ┌──────────────────────────┐
  navegador ──────────▶ │  apps/web  (Next.js 15)  │
                        │  RSC + Client Components │
                        └────────────┬─────────────┘
                                     │ fetch (cookie de sesión, credenciales)
                                     ▼
                        ┌──────────────────────────┐
                        │  apps/api  (Fastify 5)   │
                        │  auth · voces · canciones│
                        │  créditos · SSE progreso │
                        └───┬───────────┬──────────┘
                            │           │
              ┌─────────────┘           └─────────────┐
              ▼                                       ▼
      ┌───────────────┐                       ┌───────────────┐
      │  PostgreSQL   │                       │     Redis     │
      │   (Prisma)    │                       │ BullMQ + pub/ │
      │ fuente de     │                       │ sub progreso  │
      │ verdad        │                       └───────┬───────┘
      └───────▲───────┘                               │
              │                                       ▼
              │                        ┌────────────────────────────┐
              └────────────────────────│  apps/worker  (BullMQ)     │
                                       │  · voice-training          │
                                       │  · song-generation         │
                                       └─────────────┬──────────────┘
                                                     │
                        ┌────────────────────────────┼───────────────┐
                        ▼                            ▼               ▼
                ┌───────────────┐          ┌──────────────┐  ┌─────────────┐
                │ S3 / MinIO    │          │ packages/ai  │  │  Proveedores│
                │ audio + stems │          │ (ports)      │──│  externos   │
                └───────────────┘          └──────────────┘  └─────────────┘
```

## Por qué esta forma

**El trabajo es lento, no es una request.** Entrenar una voz tarda minutos;
generar una canción, entre uno y varios minutos y toca 5–6 proveedores. Eso
descarta hacerlo dentro del ciclo HTTP. La API **encola** y devuelve un `jobId`;
el worker ejecuta y publica progreso; el navegador escucha por SSE. Es lo que
permite que la barra de progreso sea real y no una animación decorativa.

**API y worker separados.** Escalan por ejes distintos: la API escala con
usuarios concurrentes (barata, sin estado), el worker escala con trabajos
concurrentes (caro, ligado a cuota de proveedor). Juntarlos obliga a
sobredimensionar el lado equivocado.

**Postgres es la verdad, Redis es el transporte.** Cada transición de etapa se
escribe en `Job`/`SongVersion` *y* se publica en Redis. Si un cliente se
desconecta y vuelve, reconstruye el estado desde Postgres y luego sigue con el
stream. Perder Redis pierde fluidez, nunca datos.

## Los tres flujos

### 1. Ingesta y entrenamiento de voz

```
grabar/subir → validación cliente → presign PUT → S3
  → POST /voices  (crea VoiceModel: PENDING)
  → cola voice-training
      1. descarga muestras            5 %
      2. análisis de calidad          20 %   ← ruido, clipping, duración, silencio
      3. preprocesado (mono 44k1)     35 %
      4. entrenamiento del proveedor  45→90 %
      5. persistir handle del modelo  100 %
  → VoiceModel: READY
```

El **análisis de calidad** (paso 2) es lo que separa un producto usable de una
demo. Un modelo entrenado con audio ruidoso produce canto metálico y el usuario
culpa al producto. Se rechaza pronto y con motivos accionables ("hay recorte en
3 de tus muestras", "solo 1:12 de los 2:00 mínimos").

### 2. Generación de canción

```
POST /songs  → Song + SongVersion(v1) + cola song-generation
   1. letra           (Claude, o la del usuario)         →  10 %
   2. plan + música   (Eleven Music)                     →  40 %
   3. stems           (nativos o Demucs)                 →  55 %
   4. conversión SVC  (RVC / seed-vc con la voz elegida) →  75 %
   5. mezcla          (voz convertida + instrumental)    →  85 %
   6. masterización   (Matchering / loudnorm)            →  93 %
   7. codificación    (MP3 320 + WAV 24-bit)             → 100 %
```

Cada etapa persiste su artefacto en S3. **Regenerar** crea una `SongVersion`
nueva sobre la misma `Song`, así que el historial conserva todas las tomas y el
usuario puede comparar; nada se sobrescribe.

### 3. Créditos

Libro mayor de solo-inserción (`CreditLedger`). El saldo es la suma de asientos,
no un contador mutable. Se **reserva** al encolar y se **reembolsa** si el
trabajo falla, en la misma transacción que cambia el estado del trabajo. Un
usuario nunca paga por un fallo del sistema, y no hay carrera posible entre dos
generaciones simultáneas: la reserva es atómica.

## Capa de proveedores (`packages/ai`)

El dominio depende de **puertos**, no de proveedores:

```ts
LyricsProvider    generate(brief): Lyrics
MusicProvider     compose(plan): { mix, stems? }
VoiceTrainer      train(samples): VoiceHandle
VoiceConverter    convert(vocal, handle): Audio
StemSeparator     separate(mix): Stems
MasteringProvider master(mix, genre): Audio
AudioEncoder      encode(pcm, format): Buffer
```

Cada puerto tiene ≥2 adaptadores y un registro que resuelve por variable de
entorno. Uno de ellos es siempre **`local`**: determinista, sin red, sin claves.
Eso permite que `npm run dev` levante el producto completo y el pipeline entero
se ejecute de principio a fin —con audio sintetizado— sin una sola API key. Los
tests de integración corren contra ese adaptador.

## Fallos y reintentos

- Errores de proveedor: reintento exponencial (3 intentos) sobre 5xx/timeout/429.
  Los 4xx no se reintentan: no van a mejorar solos.
- El job es **idempotente por etapa**: un reintento reanuda desde la última
  etapa completada usando los artefactos ya guardados en S3, no rehace la
  canción desde cero.
- Fallo definitivo → `Job.FAILED`, reembolso de créditos, mensaje accionable.

## Seguridad

- Sesiones opacas en cookie `HttpOnly` + `SameSite=Lax`; el token se guarda
  **hasheado** en base de datos (una filtración de la tabla no da sesiones).
- Argon2id para contraseñas.
- Rate limiting por IP y por usuario; límites estrictos en registro y login.
- URLs prefirmadas de corta duración; el bucket nunca es público.
- **Consentimiento explícito de clonación de voz**, versionado y con fecha,
  requerido antes de entrenar. Ver `docs/05-legal-and-consent.md`.

## Escalado

| Presión | Respuesta |
|---|---|
| Más usuarios | Réplicas de `apps/api` (sin estado) tras balanceador |
| Más trabajos | Réplicas de `apps/worker`; concurrencia por cuota de proveedor |
| Colas separadas | `voice-training` y `song-generation` escalan por separado |
| Audio | S3/R2 + CDN; la API nunca sirve bytes de audio |
| Base de datos | Réplica de lectura para historial; el ledger sigue en primaria |
