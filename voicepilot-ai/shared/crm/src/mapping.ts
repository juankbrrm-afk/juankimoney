/**
 * Declarative field mapping between the canonical model and a customer's own
 * CRM layout.
 *
 * Two rules from `docs/07`, both load-bearing:
 *
 * **Transforms are data, never code.** A mapping that could carry arbitrary
 * code would be a remote execution vector in our own process, configured by
 * whoever can reach the integrations screen. So a transform is a tagged union
 * with a fixed set of shapes, and anything unknown is refused rather than
 * evaluated.
 *
 * **A mapping is never applied to production without a dry run.** We never
 * write into a customer's live CRM without a human first seeing exactly what
 * ten sample records would become. {@link dryRun} produces that preview.
 */

import type { CanonicalEntity } from "./canonical.ts";

export type Transform =
  /** Fixed value lookup: canonical disposition -> the customer's own label. */
  | { type: "enum_map"; map: Record<string, string>; fallback?: string }
  /** Template with `{field}` placeholders drawn from the source record. */
  | { type: "template"; pattern: string }
  | { type: "split"; separator: string; index: number }
  | { type: "concat"; fields: string[]; separator: string }
  | { type: "number"; scale?: number; decimals?: number }
  | { type: "boolean"; trueValues: string[] }
  | { type: "date"; format: "iso" | "epoch_ms" | "epoch_s" | "date_only" }
  | { type: "phone"; defaultCountryCode?: string }
  | { type: "truncate"; maxLength: number }
  | { type: "constant"; value: string | number | boolean };

export interface FieldMapping {
  canonicalEntity: CanonicalEntity;
  canonicalField: string;
  externalObject: string;
  externalField: string;
  direction: "push" | "pull" | "both";
  transform?: Transform;
  /** Applied when the source value is null, undefined, or empty string. */
  defaultValue?: string | number | boolean;
}

export interface MappingIssue {
  field: string;
  code: string;
  message: string;
}

export class MappingError extends Error {
  readonly issues: MappingIssue[];
  readonly field: string;

  constructor(issues: MappingIssue[], field: string) {
    super(`mapping failed for ${field}: ${issues[0]?.message ?? "unknown"}`);
    this.name = "MappingError";
    this.issues = issues;
    this.field = field;
  }
}

const MAX_TEMPLATE_DEPTH = 1;

function get(record: Record<string, unknown>, path: string): unknown {
  if (!path.includes(".")) return record[path];
  let cur: unknown = record;
  for (const part of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function set(target: Record<string, unknown>, path: string, value: unknown) {
  if (!path.includes(".")) {
    target[path] = value;
    return;
  }
  const parts = path.split(".");
  let cur = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    if (typeof cur[key] !== "object" || cur[key] === null) cur[key] = {};
    cur = cur[key] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
}

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === "";
}

/** Applies one transform. Pure, total, and never evaluates anything. */
export function applyTransform(
  value: unknown,
  transform: Transform,
  source: Record<string, unknown>,
): unknown {
  switch (transform.type) {
    case "constant":
      return transform.value;

    case "enum_map": {
      const key = String(value ?? "");
      if (key in transform.map) return transform.map[key];
      if (transform.fallback !== undefined) return transform.fallback;
      // An unmapped enum must not be passed through raw. Sending a canonical
      // value like "sale_closed" into a CRM that expects "Closed Won" writes
      // garbage that nobody notices until the forecast is wrong.
      throw new MappingError(
        [
          {
            field: "enum_map",
            code: "unmapped",
            message: `"${key}" has no mapping and no fallback`,
          },
        ],
        "enum_map",
      );
    }

    case "template": {
      // Single pass only: a substituted value is never re-scanned for
      // placeholders, so a record containing "{other}" cannot expand into
      // another field's contents.
      let depth = 0;
      return transform.pattern.replace(/\{([\w.]+)\}/g, (_m, field: string) => {
        if (depth++ >= MAX_TEMPLATE_DEPTH * 1000) return "";
        const v = get(source, field);
        return isEmpty(v) ? "" : String(v);
      });
    }

    case "split": {
      const parts = String(value ?? "").split(transform.separator);
      return parts[transform.index] ?? "";
    }

    case "concat":
      return transform.fields
        .map((f) => get(source, f))
        .filter((v) => !isEmpty(v))
        .join(transform.separator);

    case "number": {
      const n = typeof value === "number" ? value : Number(value);
      if (Number.isNaN(n)) {
        throw new MappingError(
          [
            {
              field: "number",
              code: "nan",
              message: `"${String(value)}" is not a number`,
            },
          ],
          "number",
        );
      }
      const scaled = n * (transform.scale ?? 1);
      return transform.decimals === undefined
        ? scaled
        : Number(scaled.toFixed(transform.decimals));
    }

    case "boolean":
      return transform.trueValues.includes(String(value ?? "").toLowerCase());

    case "date": {
      const d = value instanceof Date ? value : new Date(String(value));
      if (Number.isNaN(d.getTime())) {
        throw new MappingError(
          [
            {
              field: "date",
              code: "invalid",
              message: `"${String(value)}" is not a date`,
            },
          ],
          "date",
        );
      }
      switch (transform.format) {
        case "iso":
          return d.toISOString();
        case "epoch_ms":
          return d.getTime();
        case "epoch_s":
          return Math.floor(d.getTime() / 1000);
        case "date_only":
          return d.toISOString().slice(0, 10);
      }
      return d.toISOString();
    }

    case "phone": {
      const raw = String(value ?? "").trim();
      if (raw === "") return "";
      const hadPlus = raw.startsWith("+");
      const digits = raw.replace(/\D/g, "");
      if (digits === "") return "";
      if (hadPlus) return "+" + digits;
      if (digits.length === 10) {
        return "+" + (transform.defaultCountryCode ?? "1") + digits;
      }
      if (digits.length === 11 && digits.startsWith("1")) return "+" + digits;
      throw new MappingError(
        [
          {
            field: "phone",
            code: "ambiguous",
            message: `cannot determine country code for "${raw}"`,
          },
        ],
        "phone",
      );
    }

    case "truncate": {
      const s = String(value ?? "");
      return s.length <= transform.maxLength
        ? s
        : s.slice(0, transform.maxLength);
    }
  }
}

export interface MapOutcome {
  record: Record<string, unknown>;
  /** Fields that could not be mapped. The record is still usable without them. */
  errors: { field: string; message: string }[];
  /** Fields present in the source that no mapping covers. */
  unmapped: string[];
}

/**
 * Canonical record -> external record.
 *
 * A failing field never fails the whole write. A note that reaches the CRM
 * without its "campaign" custom field is worth far more than no note at all,
 * and the errors are returned so the operation can be surfaced honestly in the
 * sync queue the customer can see.
 */
export function mapOutbound(
  source: Record<string, unknown>,
  mappings: FieldMapping[],
  entity: CanonicalEntity,
): MapOutcome {
  const record: Record<string, unknown> = {};
  const errors: MapOutcome["errors"] = [];
  const consumed = new Set<string>();

  for (const m of mappings) {
    if (m.canonicalEntity !== entity) continue;
    if (m.direction === "pull") continue;

    consumed.add(m.canonicalField);
    let value = get(source, m.canonicalField);

    if (isEmpty(value) && m.defaultValue !== undefined) {
      value = m.defaultValue;
    }
    if (isEmpty(value) && !m.transform) continue;

    try {
      const out = m.transform
        ? applyTransform(value, m.transform, source)
        : value;
      if (!isEmpty(out)) set(record, m.externalField, out);
    } catch (err) {
      errors.push({
        field: m.canonicalField,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const unmapped = Object.keys(source).filter(
    (k) => !consumed.has(k) && !isEmpty(source[k]),
  );

  return { record, errors, unmapped };
}

/** External record -> canonical record. */
export function mapInbound(
  source: Record<string, unknown>,
  mappings: FieldMapping[],
  entity: CanonicalEntity,
): MapOutcome {
  const record: Record<string, unknown> = {};
  const errors: MapOutcome["errors"] = [];
  const consumed = new Set<string>();

  for (const m of mappings) {
    if (m.canonicalEntity !== entity) continue;
    if (m.direction === "push") continue;

    consumed.add(m.externalField);
    let value = get(source, m.externalField);

    if (isEmpty(value) && m.defaultValue !== undefined) {
      value = m.defaultValue;
    }
    if (isEmpty(value) && !m.transform) continue;

    try {
      const out = m.transform
        ? applyTransform(value, m.transform, source)
        : value;
      if (!isEmpty(out)) set(record, m.canonicalField, out);
    } catch (err) {
      errors.push({
        field: m.externalField,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const unmapped = Object.keys(source).filter(
    (k) => !consumed.has(k) && !isEmpty(source[k]),
  );

  return { record, errors, unmapped };
}

// ---------------------------------------------------------------------------
// Validation and dry run
// ---------------------------------------------------------------------------

const KNOWN_TRANSFORMS = new Set([
  "enum_map",
  "template",
  "split",
  "concat",
  "number",
  "boolean",
  "date",
  "phone",
  "truncate",
  "constant",
]);

/**
 * Rejects mappings that would misbehave — including, deliberately, any
 * transform tag we do not recognise. An unknown tag is more likely to be an
 * attempt at something clever than a typo, and either way it must not run.
 */
export function validateMappings(mappings: FieldMapping[]): MappingIssue[] {
  const issues: MappingIssue[] = [];
  const seen = new Map<string, number>();

  for (const [i, m] of mappings.entries()) {
    const where = `mappings[${i}] ${m.canonicalEntity}.${m.canonicalField}`;

    if (!m.canonicalField || !m.externalField) {
      issues.push({
        field: where,
        code: "incomplete",
        message: "both canonicalField and externalField are required",
      });
    }

    if (m.transform && !KNOWN_TRANSFORMS.has(m.transform.type)) {
      issues.push({
        field: where,
        code: "unknown_transform",
        message: `unknown transform "${(m.transform as { type: string }).type}" — transforms are a fixed set, not arbitrary code`,
      });
    }

    if (m.transform?.type === "enum_map") {
      if (Object.keys(m.transform.map).length === 0) {
        issues.push({
          field: where,
          code: "empty_map",
          message: "enum_map has no entries",
        });
      }
    }

    if (m.transform?.type === "truncate" && m.transform.maxLength <= 0) {
      issues.push({
        field: where,
        code: "range",
        message: "truncate maxLength must be positive",
      });
    }

    // Two mappings writing the same external field make the result depend on
    // array order — a bug that shows up months later as "sometimes the note is
    // wrong".
    if (m.direction !== "pull") {
      const key = `${m.canonicalEntity}:${m.externalObject}.${m.externalField}`;
      const prev = seen.get(key);
      if (prev !== undefined) {
        issues.push({
          field: where,
          code: "duplicate_target",
          message: `external field already written by mappings[${prev}]; the winner would depend on ordering`,
        });
      }
      seen.set(key, i);
    }
  }

  return issues;
}

export interface DryRunResult {
  samples: { input: Record<string, unknown>; output: Record<string, unknown> }[];
  errors: { index: number; field: string; message: string }[];
  unmappedFields: string[];
  /** Fields the mapping produces that appear in none of the samples. */
  alwaysEmpty: string[];
}

/**
 * Previews a mapping against real records without writing anything.
 *
 * `docs/07` makes this mandatory: nothing is written into a customer's
 * production CRM until a human has seen exactly what ten sample records would
 * become. A mapping that looks right in a form and is wrong in practice is
 * discovered here, not in their pipeline report.
 */
export function dryRun(
  samples: Record<string, unknown>[],
  mappings: FieldMapping[],
  entity: CanonicalEntity,
): DryRunResult {
  const out: DryRunResult = {
    samples: [],
    errors: [],
    unmappedFields: [],
    alwaysEmpty: [],
  };
  const unmapped = new Set<string>();
  const produced = new Set<string>();

  for (const [i, sample] of samples.entries()) {
    const result = mapOutbound(sample, mappings, entity);
    out.samples.push({ input: sample, output: result.record });
    for (const e of result.errors) {
      out.errors.push({ index: i, field: e.field, message: e.message });
    }
    for (const u of result.unmapped) unmapped.add(u);
    for (const k of Object.keys(result.record)) produced.add(k);
  }

  out.unmappedFields = [...unmapped].sort();
  out.alwaysEmpty = mappings
    .filter((m) => m.canonicalEntity === entity && m.direction !== "pull")
    .map((m) => m.externalField)
    .filter((f) => !produced.has(f))
    .sort();

  return out;
}
