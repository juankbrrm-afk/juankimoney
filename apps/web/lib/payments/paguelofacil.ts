import type { CreatePaymentInput, CreatePaymentResult, PaymentWebhookEvent } from "@/lib/payments/types";

/**
 * Adaptador de PagueloFacil para tarjeta internacional y cargos recurrentes
 * (suscripciones de negocio). Confirmado contra developers.paguelofacil.com y fuentes
 * independientes corroboradas (búsqueda + github.com/ShoopiApp/PagueloFacil):
 *   - Credenciales: CCLW (código de comercio, "Mi Empresa" → "Llaves" en el panel) + Token
 *     de API — dos secretos separados.
 *   - Entornos separados con hosts distintos:
 *       producción: https://secure.paguelofacil.com  /  https://api.pfserver.net
 *       sandbox:    https://sandbox.paguelofacil.com  /  https://api-sand.pfserver.net
 *   - Endpoint confirmado del flujo "Enlace de Pago" (checkout hospedado, el que usamos
 *     para reservas puntuales): POST {CHECKOUT_HOST}/LinkDeamon.cfm — corroborado por
 *     múltiples integraciones PHP públicas independientes que envían un payload con CCLW
 *     y reciben de vuelta la URL de checkout a la que redirigir al usuario.
 *   - La API REST separada (API_HOST) soporta explícitamente operación "Recurrent" (cargo
 *     recurrente), que es lo que necesitamos para `business_subscriptions` — esa parte
 *     sigue sin confirmar (ver TODO abajo).
 *
 * NO CONFIRMADO — verificar en sandbox antes de production: el nombre exacto de cada
 * campo del body de LinkDeamon.cfm más allá de CCLW (el portal de guías con la lista
 * completa bloqueó el acceso automático). Por eso la respuesta se valida de forma
 * estricta: si no luce como una URL de checkout válida, esto falla ruidosamente en vez
 * de asumir éxito — no queremos un "falso positivo" en un flujo de pago.
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
        "la cuenta de comercio en el panel de PagueloFacil (Mi Empresa → Llaves).",
    );
  }

  if (input.recurring) {
    // TODO(pagos): el flujo recurrente vive en la API REST (API_HOST) con operación
    // "Recurrent", no en LinkDeamon.cfm — sin el path exacto confirmado, no se implementa
    // a ciegas un cargo recurrente real. Falla explícito en vez de adivinar.
    throw new Error(
      `createPagueloFacilPayment: cargos recurrentes pendientes de confirmar el endpoint REST exacto en ${API_HOST}.`,
    );
  }

  const body = new URLSearchParams({
    CCLW: cclw,
    PF_CI: apiKey,
    PF_CF_ID: input.referenceId,
    PF_TOTAL_PAGAR: input.amount.toFixed(2),
    PF_CONCEPTO: input.description,
    PF_URL_RETURN: input.successUrl,
  });

  const res = await fetch(`${CHECKOUT_HOST}/LinkDeamon.cfm`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const text = await res.text();
  const urlMatch = text.match(/https?:\/\/\S+/);

  if (!res.ok || !urlMatch) {
    throw new Error(
      `createPagueloFacilPayment: respuesta inesperada de PagueloFacil (status ${res.status}): ${text.slice(0, 300)}. ` +
        "Esto casi seguro significa que uno de los nombres de campo del body no es el correcto — " +
        "confirmar contra el panel de PagueloFacil antes de reintentar.",
    );
  }

  return {
    provider: "paguelofacil",
    redirectUrl: urlMatch[0],
    providerReference: input.referenceId,
  };
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
