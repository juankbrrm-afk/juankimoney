/**
 * Cliente HTTP para proveedores externos.
 *
 * Reintenta con retroceso exponencial y jitter en errores transitorios —5xx,
 * 429 y timeouts— pero **nunca en 4xx**: un prompt inválido o una clave
 * caducada no mejoran por insistir, y reintentar solo alarga el fallo y gasta
 * cuota.
 */

export class ProviderHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    readonly provider: string,
  ) {
    super(`${provider} respondió ${status}: ${body.slice(0, 300)}`);
    this.name = 'ProviderHttpError';
  }

  /** 429 y 5xx son transitorios; el resto de 4xx, permanentes. */
  get retryable(): boolean {
    return this.status === 429 || this.status >= 500;
  }
}

export interface RetryOptions {
  readonly attempts?: number;
  readonly baseDelayMs?: number;
  readonly maxDelayMs?: number;
  readonly signal?: AbortSignal;
}

export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const { attempts = 3, baseDelayMs = 1000, maxDelayMs = 20_000, signal } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    signal?.throwIfAborted();

    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;

      const isRetryable =
        error instanceof ProviderHttpError
          ? error.retryable
          : error instanceof Error && isNetworkError(error);

      if (!isRetryable || attempt === attempts) throw error;

      // El jitter evita que varios workers que fallaron a la vez reintenten
      // sincronizados y vuelvan a saturar al proveedor.
      const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const jittered = delay * (0.5 + Math.random() * 0.5);
      await sleep(jittered, signal);
    }
  }

  throw lastError;
}

function isNetworkError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('fetch failed') ||
    message.includes('econnreset') ||
    message.includes('etimedout') ||
    message.includes('socket hang up') ||
    error.name === 'TimeoutError'
  );
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    function onAbort() {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error('Operación cancelada'));
    }

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export interface JsonRequest {
  readonly url: string;
  readonly method?: string;
  readonly headers?: Record<string, string>;
  readonly body?: unknown;
  readonly provider: string;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

export async function requestJson<T>(request: JsonRequest): Promise<T> {
  const response = await rawRequest(request);
  return (await response.json()) as T;
}

export async function requestBytes(request: JsonRequest): Promise<Uint8Array> {
  const response = await rawRequest(request);
  return new Uint8Array(await response.arrayBuffer());
}

async function rawRequest(request: JsonRequest): Promise<Response> {
  const { url, method = 'POST', headers = {}, body, provider, signal, timeoutMs = 180_000 } = request;

  return withRetry(
    async () => {
      // El timeout se compone con la cancelación del usuario: cualquiera de
      // las dos aborta la petición.
      const timeoutSignal = AbortSignal.timeout(timeoutMs);
      const composed = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

      const response = await fetch(url, {
        method,
        headers: body ? { 'content-type': 'application/json', ...headers } : headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: composed,
      });

      if (!response.ok) {
        throw new ProviderHttpError(response.status, await safeText(response), provider);
      }

      return response;
    },
    { signal },
  );
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '<cuerpo ilegible>';
  }
}

/**
 * Sondeo de trabajos asíncronos.
 *
 * Replicate y los motores musicales devuelven un identificador y obligan a
 * preguntar. Se informa del progreso mientras tanto para que la barra del
 * usuario siga viva durante la espera.
 */
export async function pollUntil<T>(
  check: () => Promise<{ done: boolean; value?: T; progress?: number }>,
  options: {
    intervalMs?: number;
    timeoutMs?: number;
    signal?: AbortSignal;
    onProgress?: (fraction: number) => void | Promise<void>;
  } = {},
): Promise<T> {
  const { intervalMs = 3000, timeoutMs = 900_000, signal, onProgress } = options;
  const deadline = Date.now() + timeoutMs;

  let elapsed = 0;

  while (Date.now() < deadline) {
    signal?.throwIfAborted();

    const result = await check();
    if (result.done && result.value !== undefined) return result.value;

    // Sin progreso real del proveedor se estima por tiempo transcurrido,
    // acotado a 0.95 para no prometer un final que aún no ha llegado.
    elapsed += intervalMs;
    const fraction = result.progress ?? Math.min(0.95, elapsed / timeoutMs);
    await onProgress?.(fraction);

    await sleep(intervalMs, signal);
  }

  throw new Error('El proveedor superó el tiempo máximo de espera');
}
