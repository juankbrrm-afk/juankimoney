/**
 * The CRM adapter contract.
 *
 * Every connector — Salesforce, HubSpot, Zoho, ReadyMode, the native CRM —
 * implements this identical shape. The interesting part is not the CRUD; it is
 * {@link AdapterCapabilities}.
 *
 * CRMs are not interchangeable. Some have no "call" object. Some forbid custom
 * fields below a certain plan. Some cap you at a few hundred API calls a day.
 * A connector layer that pretends otherwise fails at runtime, in front of the
 * customer, on the feature they were most excited about.
 *
 * So every adapter *declares what it can actually do*, and the UI adapts. If a
 * CRM has no opportunity object, the pipeline view does not render for that
 * tenant. We never show a button that is going to fail.
 */

import type {
  CanonicalEntity,
  CanonicalRecord,
  E164,
} from "./canonical.ts";

export type SyncDirection = "push" | "pull" | "both";

export interface RateLimit {
  requestsPerDay?: number;
  requestsPerMinute?: number;
  /** Concurrent in-flight requests the provider tolerates. */
  concurrency?: number;
}

export interface AdapterCapabilities {
  provider: string;
  /**
   * Integration depth, per `docs/07`:
   *
   * - `overlay` (L1): no API. The extension paints on top and writes through
   *   the host CRM's own form fields. Works with anything that has a web UI,
   *   including in-house systems — which is most of this market.
   * - `write` (L2): official API, one-way writeback.
   * - `bidirectional` (L3): full two-way sync, webhooks, custom mapping.
   */
  level: "overlay" | "write" | "bidirectional";
  entities: CanonicalEntity[];
  writable: string[];
  readable: CanonicalEntity[];
  webhooks: boolean;
  customFields: boolean;
  bulk?: { maxBatch: number };
  rateLimit?: RateLimit;
  /**
   * Can this system answer "who owns +13055550142?" in under 200 ms?
   *
   * The single most latency-sensitive integration call there is: an inbound
   * call is ringing and the agent needs to know who it is before answering.
   */
  resolveByPhone: boolean;
  /**
   * Does the provider own the audio path?
   *
   * This flag exists because of ReadyMode (`docs/13`). A dialer that owns the
   * softphone means our media plane cannot simply sit in the SIP path — the
   * integration needs trunk interposition or an agent-side audio device, and
   * that is a completely different amount of work. Discovering it at
   * integration time rather than at planning time is how a quarter disappears.
   */
  ownsAudioPath: boolean;
  /** Whether the provider lets the customer point it at our SIP trunk. */
  supportsCustomSipTrunk?: "yes" | "no" | "unknown";
}

export interface PullPage<T> {
  records: T[];
  cursor?: string;
  hasMore: boolean;
}

export interface PushResult {
  externalId: string;
  /** True when the provider recognised our idempotency key and did nothing. */
  deduplicated: boolean;
}

export interface ExternalFieldDescriptor {
  name: string;
  label: string;
  type: "string" | "number" | "boolean" | "date" | "enum" | "phone" | "email";
  enumValues?: string[];
  required: boolean;
  readOnly: boolean;
}

export interface CrmAdapter {
  capabilities(): AdapterCapabilities;

  authenticate(): Promise<void>;
  refreshCredentials?(): Promise<void>;

  /**
   * Reads the *customer's own* field layout.
   *
   * Every Salesforce org on earth is different — one calls it `Status`, the
   * next `Lead_Stage__c`. Mapping cannot be hardcoded; it has to be discovered
   * per instance and then confirmed by a human.
   */
  discoverSchema(entity: CanonicalEntity): Promise<ExternalFieldDescriptor[]>;

  pull(
    entity: CanonicalEntity,
    cursor?: string,
  ): Promise<PullPage<Record<string, unknown>>>;

  push(
    entity: CanonicalEntity,
    record: CanonicalRecord,
    idempotencyKey: string,
  ): Promise<PushResult>;

  resolveByPhone(phone: E164): Promise<CanonicalRecord | null>;

  handleWebhook?(payload: unknown): Promise<CanonicalRecord[]>;
}

// ---------------------------------------------------------------------------
// Capability guard
// ---------------------------------------------------------------------------

export class UnsupportedOperationError extends Error {
  constructor(provider: string, operation: string) {
    super(`${provider} does not support ${operation}`);
    this.name = "UnsupportedOperationError";
  }
}

/**
 * Fails a request the adapter has declared it cannot serve — before any
 * network call, so the error is a clear refusal rather than a provider's
 * generic 400 three seconds later.
 */
export function assertSupported(
  caps: AdapterCapabilities,
  operation: string,
  supported: boolean,
): void {
  if (!supported) {
    throw new UnsupportedOperationError(caps.provider, operation);
  }
}

export function canWrite(
  caps: AdapterCapabilities,
  entity: CanonicalEntity,
  field?: string,
): boolean {
  if (!caps.entities.includes(entity)) return false;
  const target = field ? `${entity}.${field}` : entity;
  return caps.writable.includes(target) || caps.writable.includes(entity);
}

export function canRead(
  caps: AdapterCapabilities,
  entity: CanonicalEntity,
): boolean {
  return caps.readable.includes(entity);
}

/**
 * Which product surfaces a tenant on this provider should actually see.
 *
 * Driven straight off the declared capabilities, so a CRM without an
 * opportunity object simply has no pipeline tab — instead of a pipeline tab
 * that throws.
 */
export function availableSurfaces(caps: AdapterCapabilities): {
  pipeline: boolean;
  tasks: boolean;
  inboundScreenPop: boolean;
  automaticWriteback: boolean;
  audioIntegration: "sip" | "virtual-device" | "unknown";
} {
  return {
    pipeline: caps.entities.includes("opportunity"),
    tasks: caps.entities.includes("task"),
    inboundScreenPop: caps.resolveByPhone,
    automaticWriteback: caps.level !== "overlay" && canWrite(caps, "call"),
    audioIntegration: !caps.ownsAudioPath
      ? "sip"
      : caps.supportsCustomSipTrunk === "yes"
        ? "sip"
        : caps.supportsCustomSipTrunk === "no"
          ? "virtual-device"
          : "unknown",
  };
}
