import { createYappyPayment, parseYappyWebhook } from "@/lib/payments/yappy";
import { createPagueloFacilPayment, parsePagueloFacilWebhook } from "@/lib/payments/paguelofacil";
import type { CreatePaymentInput, CreatePaymentResult, PaymentProvider, PaymentWebhookEvent } from "@/lib/payments/types";

export * from "@/lib/payments/types";

/**
 * Punto único de entrada a pagos. Ningún Route Handler ni Server Action debe importar
 * yappy.ts/paguelofacil.ts directamente — ver docs/panama-ai/04-apis.md#43-pagos-yappy--paguelofacil.
 */
export async function createPayment(
  provider: PaymentProvider,
  input: CreatePaymentInput,
): Promise<CreatePaymentResult> {
  if (provider === "yappy") return createYappyPayment(input);
  return createPagueloFacilPayment(input);
}

export function parsePaymentWebhook(provider: PaymentProvider, payload: unknown): PaymentWebhookEvent {
  if (provider === "yappy") return parseYappyWebhook(payload);
  return parsePagueloFacilWebhook(payload);
}

/** Regla de enrutamiento por defecto — docs/panama-ai/04-apis.md#43-pagos-yappy--paguelofacil */
export function suggestProvider(input: { recurring?: boolean; internationalCard?: boolean }): PaymentProvider {
  if (input.recurring || input.internationalCard) return "paguelofacil";
  return "yappy";
}
