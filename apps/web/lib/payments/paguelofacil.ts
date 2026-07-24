import type { CreatePaymentInput, CreatePaymentResult, PaymentWebhookEvent } from "@/lib/payments/types";

/**
 * Adaptador de PagueloFacil para tarjeta internacional y cargos recurrentes
 * (suscripciones de negocio). Confirmado contra developers.paguelofacil.com:
 *   - Credenciales: CCLW (código de comercio) + token de API — dos secretos separados.
 *   - Entornos separados con hosts distintos:
 *       producción: https://secure.paguelofacil.com  /  https://api.pfserver.net
 *       sandbox:    https://sandbox.paguelofacil.com  /  https://api-sand.pfserver.net
 *   - La API soporta explícitamente operación "Recurrent" (cargo recurrente), que es
 *     exactamente lo que necesitamos para `business_subscriptions`.
 *
 * PENDIENTE de verificar con acceso autenticado al portal antes de producción: el path
 * exacto de cada endpoint REST y el nombre exacto de cada campo del body (el portal de
 * guías bloqueó el acceso automático). La forma de abajo sigue el patrón documentado
 * públicamente (ver github.com/ShoopiApp/PagueloFacil) de un cliente construido con
 * `(cclw, token, entorno)` y un código de operación (`codOper`) por transacción.
 */

const IS_SANDBOX = process.env.PAGUELOFACIL_SANDBOX !== "false";

const CHECKOUT_HOST = IS_SANDBOX ? "https://sandbox.paguelofacil.com" : "https://secure.paguelofacil.com";
const API_HOST = IS_SANDBOX ? "https://api-sand.pfserver.net" : "https://api.pfserver.net";

export async function createPagueloFacilPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
  const cclw = process.env.PAGUELOFACIL_CCLW_TOKEN;
  const apiKey = process.env.PAGUELOFACIL_API_KEY;

  if (!cclw || !apiKey) {
    throw new Error(
      "PAGUELOFACIL_CCLW_TOKEN / PAGUELOFACIL_API_KEY no configuradas — se obtienen al activar " +
        "la cuenta de comercio en el panel de PagueloFacil.",
    );
  }

  // TODO(pagos): reemplazar por la llamada real a la API REST (host: API_HOST) una vez
  // confirmado el path exacto del endpoint "Enlace de Pago" / "Authorize and Capture" en
  // developers.paguelofacil.com/guias/enlace-de-pago. Forma esperada del body, según
  // patrón documentado: { cclw, apiKey, amount, description, referenceId, returnUrl,
  // recurring: input.recurring }.
  throw new Error(
    `createPagueloFacilPayment: integración pendiente de verificación de endpoint (${API_HOST}, ${CHECKOUT_HOST}). ` +
      "Ver comentario superior de este archivo antes de habilitar en producción.",
  );
}

export function parsePagueloFacilWebhook(payload: unknown): PaymentWebhookEvent {
  // TODO(pagos): mapear los campos reales (idtx, codOper, headerStatus) una vez confirmado
  // el formato de notificación de PagueloFacil.
  const body = payload as Record<string, unknown>;
  return {
    provider: "paguelofacil",
    providerReference: String(body.idtx ?? ""),
    referenceId: String(body.referenceId ?? ""),
    status: body.success === true ? "confirmed" : "failed",
    raw: payload,
  };
}
