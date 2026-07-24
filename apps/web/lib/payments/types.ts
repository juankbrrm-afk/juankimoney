/**
 * Contrato común a ambos proveedores de pago (docs/panama-ai/04-apis.md#43-pagos-yappy--paguelofacil).
 * Ningún módulo de producto debe importar yappy.ts / paguelofacil.ts directamente —
 * siempre a través de index.ts — para poder cambiar de proveedor sin tocar `bookings`
 * ni `business_subscriptions`.
 */

export type PaymentProvider = "yappy" | "paguelofacil";

export interface CreatePaymentInput {
  /** ID interno de la reserva o suscripción — se manda como referencia externa al proveedor */
  referenceId: string;
  amount: number;
  currency: "USD";
  description: string;
  /** true = cargo recurrente (suscripción de negocio); false = cargo único (reserva) */
  recurring?: boolean;
  successUrl: string;
  failUrl: string;
}

export interface CreatePaymentResult {
  provider: PaymentProvider;
  /** URL a la que se redirige al usuario para completar el pago (checkout hospedado) */
  redirectUrl: string;
  /** referencia que devuelve el proveedor, se guarda en payment_reference */
  providerReference: string;
}

export interface PaymentWebhookEvent {
  provider: PaymentProvider;
  providerReference: string;
  referenceId: string;
  status: "confirmed" | "failed" | "pending";
  raw: unknown;
}
