import type { CreatePaymentInput, CreatePaymentResult, PaymentWebhookEvent } from "@/lib/payments/types";

/**
 * Adaptador de Yappy Comercial (Banco General) para cargos de reserva puntuales.
 *
 * ESTADO: estructura verificada contra fuentes públicas (búsqueda + código fuente de
 * integraciones de terceros), pero SIN endpoint exacto confirmado — el portal de
 * desarrolladores de Yappy (yappy.com.pa/comercial/desarrolladores) requiere sesión de
 * comercio autenticada y varias fuentes de terceros con más detalle (blogs con ejemplos
 * de código) devolvieron 403 al intentar inspeccionarlas de forma automática.
 *
 * Lo que SÍ está confirmado por más de una fuente independiente:
 *   - Credenciales: merchantId + secretToken, entregadas por Banco General solo a cuentas
 *     comerciales activadas.
 *   - Config típica de un cliente Yappy: merchantId, secretToken, domainUrl, successUrl,
 *     failUrl, checkoutUrl, sandbox (ver github.com/joseabraham/eprezto-yappy-sdk).
 *   - Estados de resultado de una orden: "E" (Ejecutada/pagada), "R" (Rechazada — el
 *     cliente no confirmó en 5 minutos), "C" (Cancelada desde la app de Banco General).
 *   - Contacto directo del equipo de Yappy para soporte de integración:
 *     botondepagoyappy@bgeneral.com / yappy@bgeneral.com.
 *
 * Lo que NO está confirmado — antes de producción, un humano con acceso al panel de
 * Yappy Comercial (o una respuesta del contacto de arriba) debe darnos:
 *   1. La URL base real de sandbox/producción (aquí parametrizada por env var, sin confirmar).
 *   2. El path exacto del endpoint de creación de orden y el algoritmo de hash de firma.
 *   3. Si hoy exponen webhook/IPN o si la confirmación sigue dependiendo solo del redirect
 *      a `successUrl`/`failUrl` con el orderId como query param (así lo documentan
 *      integraciones comunitarias más antiguas, pero puede haber cambiado).
 */

const YAPPY_BASE_URL = process.env.YAPPY_SANDBOX === "false"
  ? "https://api.yappy.com.pa" // TODO: confirmar path exacto antes de producción
  : "https://api-sandbox.yappy.com.pa"; // TODO: confirmar host de sandbox

export async function createYappyPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
  const merchantId = process.env.YAPPY_MERCHANT_ID;
  const secretKey = process.env.YAPPY_SECRET_KEY;

  if (!merchantId || !secretKey) {
    throw new Error(
      "YAPPY_MERCHANT_ID / YAPPY_SECRET_KEY no configuradas — la cuenta comercial de Yappy debe " +
        "activarse primero desde el panel de Banco General antes de poder cobrar.",
    );
  }

  if (input.recurring) {
    throw new Error("Yappy no soporta cargos recurrentes en este adaptador — usar PagueloFacil para suscripciones.");
  }

  // TODO(pagos): reemplazar por la llamada real una vez confirmado el endpoint (ver nota arriba).
  // Forma esperada, según integraciones comunitarias existentes:
  // POST {YAPPY_BASE_URL}/payments/orders
  // body: { merchantId, orderId: referenceId, total: amount, subTotal: amount, taxes: 0,
  //         domain, successUrl, failUrl }
  // -> { redirectUrl, status }
  throw new Error(
    `createYappyPayment: integración pendiente de verificación de endpoint (${YAPPY_BASE_URL}). ` +
      "Ver comentario superior de este archivo antes de habilitar en producción.",
  );
}

export function parseYappyWebhook(payload: unknown): PaymentWebhookEvent {
  // TODO(pagos): mapear los campos reales una vez confirmado el formato del webhook/IPN de Yappy.
  const body = payload as Record<string, unknown>;
  return {
    provider: "yappy",
    providerReference: String(body.orderId ?? ""),
    referenceId: String(body.orderId ?? ""),
    status: body.status === "success" ? "confirmed" : "failed",
    raw: payload,
  };
}
