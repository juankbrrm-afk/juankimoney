import type { CreatePaymentInput, CreatePaymentResult, PaymentWebhookEvent } from "@/lib/payments/types";

/**
 * Adaptador de Yappy Comercial (Banco General) para cargos de reserva puntuales.
 *
 * ESTADO: estructura verificada contra fuentes públicas, pero SIN endpoint exacto
 * confirmado — el portal de desarrolladores de Yappy (yappy.com.pa/comercial/desarrolladores)
 * requiere sesión de comercio autenticada y no se pudo inspeccionar en automático.
 * Antes de ir a producción, un humano con acceso al panel de Yappy Comercial debe:
 *   1. Confirmar la URL base real de sandbox/producción (aquí parametrizada por env var).
 *   2. Confirmar el path exacto del endpoint de creación de orden y el algoritmo de hash.
 *   3. Confirmar si el proveedor ya expone webhook/IPN o si la confirmación sigue
 *      dependiendo del redirect a `successUrl`/`failUrl` con el orderId como query param
 *      (así es como lo documentan integraciones comunitarias existentes, ej.
 *      github.com/joseabraham/eprezto-yappy-sdk).
 *
 * Los nombres de credenciales (merchantId + secretKey) sí están confirmados por la
 * documentación pública de Yappy Comercial y por integraciones de terceros (Fygaro, Factura Fácil).
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
