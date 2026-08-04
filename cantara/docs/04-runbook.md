# Runbook

Operación del sistema: despliegue, incidencias frecuentes y qué mirar primero.

## Puesta en producción

### Requisitos

| Componente | Mínimo | Nota |
|---|---|---|
| PostgreSQL | 16 | El ledger de créditos exige transacciones fiables |
| Redis | 7 | Colas BullMQ y publicación de progreso |
| Almacenamiento | S3 / R2 | **Obligatorio.** El disco no vale: los workers no lo comparten |
| Node | 22+ | Runner de tests nativo y `AbortSignal.any` |
| ffmpeg | opcional | Recomendado: acelera la codificación y habilita `loudnorm` |

### Variables que deben cambiar sí o sí

```bash
NODE_ENV=production
SESSION_SECRET=$(openssl rand -hex 32)   # nunca el valor de ejemplo
COOKIE_SECURE=true                       # la API se niega a arrancar sin esto
COOKIE_DOMAIN=tudominio.com
S3_BUCKET=... S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=...
```

La configuración se valida al arrancar: un despliegue al que le falte algo
**falla al iniciar**, con el nombre de la variable, en lugar de romperse horas
después.

### Orden de despliegue

1. `npm run db:migrate` — las migraciones son aditivas; se aplican antes.
2. Desplegar el **worker**. Puede procesar la cola con la API antigua aún viva.
3. Desplegar la **API**.
4. Desplegar la **web**.

Ese orden evita el único estado incómodo: una API que encola trabajos que
ningún worker sabe interpretar todavía.

### Escalado

| Presión | Acción |
|---|---|
| Muchos usuarios concurrentes | Réplicas de `apps/api` (sin estado) tras un balanceador |
| Cola de trabajos creciendo | Réplicas de `apps/worker` |
| Cuota de proveedor agotada | Bajar `TRAINING_CONCURRENCY` / `GENERATION_CONCURRENCY` |
| Coste de descargas | Servir el bucket por CDN y fijar `S3_PUBLIC_URL` |

La concurrencia por proceso es baja a propósito: cada trabajo hace varias
llamadas a proveedores con cuota, así que subirla no acelera nada y solo
provoca 429. Se escala con réplicas, no con concurrencia.

## Diagnóstico

### La barra de progreso no se mueve

1. ¿Vive el worker? `docker compose logs worker` o el log del proceso.
2. ¿Hay trabajos atascados?
   ```sql
   SELECT id, type, status, stage, progress, attempts, updated_at
   FROM jobs WHERE status IN ('queued','running')
   ORDER BY created_at DESC LIMIT 20;
   ```
3. ¿Llega la publicación a Redis? `redis-cli PSUBSCRIBE 'cantara:job:*'`

Un trabajo `running` con `updated_at` viejo y `attempts` alto es un proveedor
externo colgado. El estado en Postgres es la verdad: si ahí avanza y el
navegador no, el problema está en el stream SSE (proxy con buffer), no en el
pipeline.

### El progreso llega a ráfagas o al final

Un proxy está acumulando el stream. La API ya envía `X-Accel-Buffering: no`;
si hay nginx delante, además hace falta:

```nginx
location /api/jobs/ {
    proxy_buffering off;
    proxy_read_timeout 3600s;
}
```

### Entrenamientos que fallan con `audio_too_noisy` o `audio_clipping`

Es el comportamiento correcto: el análisis de calidad rechaza material que
produciría un modelo malo. Para ver qué midió exactamente:

```sql
SELECT vs.id, vs.quality_score, vs.issues, vs.metrics
FROM voice_samples vs
WHERE vs.voice_model_id = '<id>';
```

Si muchos usuarios legítimos son rechazados, los umbrales están en
`packages/shared/src/audio.ts` (`QUALITY_THRESHOLDS`, `MIN_USABLE_SCORE`) y hay
tests que los cubren.

### Un usuario dice que le cobraron por una canción fallida

No debería ocurrir: el reembolso es automático ante fallo definitivo. Para
comprobarlo:

```sql
SELECT j.id, j.status, j.credits_reserved, j.credits_refunded,
       cl.amount, cl.reason
FROM jobs j
LEFT JOIN credit_ledger cl ON cl.reference_id = j.id
WHERE j.user_id = '<id>' ORDER BY j.created_at DESC LIMIT 20;
```

Si `status='failed'` y `credits_refunded=false`, el reembolso se perdió. El log
del worker lo marca con `FALLÓ EL REEMBOLSO`. Se repara insertando el asiento
con la misma clave de idempotencia (`refund:<jobId>`), que impide duplicarlo.

Y para auditar que ningún saldo se ha desviado del ledger:

```sql
SELECT user_id, SUM(amount) AS saldo_real,
       (SELECT balance_after FROM credit_ledger c2
        WHERE c2.user_id = c1.user_id ORDER BY created_at DESC LIMIT 1) AS ultimo_registrado
FROM credit_ledger c1 GROUP BY user_id
HAVING SUM(amount) <> (SELECT balance_after FROM credit_ledger c2
        WHERE c2.user_id = c1.user_id ORDER BY created_at DESC LIMIT 1);
```

Debe devolver cero filas. `balance_after` es solo comodidad de lectura; la
verdad es la suma.

### Un proveedor externo está caído

El sistema degrada solo: los fallos transitorios (5xx, 429, timeout) se
reintentan tres veces con retroceso exponencial, y el pipeline reanuda desde el
último artefacto guardado en lugar de recomponer. Si la caída es prolongada, se
puede cambiar al adaptador `local` o a un proveedor alternativo con una
variable de entorno y un reinicio del worker; los trabajos en cola se recogen
con el nuevo proveedor.

## Mantenimiento periódico

```sql
-- Subidas nunca confirmadas: candidatas a limpieza (borrar también en S3)
SELECT id, storage_key FROM uploads
WHERE status = 'PENDING' AND created_at < now() - interval '24 hours';

-- Sesiones caducadas (se limpian solas al tocarlas; esto recoge las inactivas)
DELETE FROM sessions WHERE expires_at < now();
```

Los artefactos intermedios (`mix`, `stem-*`, `mixed`, `mastered`) de versiones
ya `READY` pueden purgarse de S3 pasados unos días: solo sirven para reanudar
un reintento. Los entregables (`master.mp3`, `master.wav`) se conservan.

## Señales a vigilar

| Métrica | Umbral | Qué indica |
|---|---|---|
| Profundidad de cola | > 50 | Faltan réplicas de worker |
| Tasa de fallo de trabajos | > 5 % | Proveedor degradado o umbrales mal calibrados |
| Reembolsos por hora | pico | Algo se está rompiendo de forma sistemática |
| Duración p95 de generación | > 8 min | Proveedor lento; revisar sus tiempos |
| `FALLÓ EL REEMBOLSO` en logs | cualquiera | Dinero del usuario pendiente: reparar a mano |
