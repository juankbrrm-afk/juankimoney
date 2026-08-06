/**
 * Which record is the agent looking at?
 *
 * This is the question that makes "works with any CRM" true or false. L2 and
 * L3 read the answer from an API. L1 — the tier that covers everything else,
 * including the in-house PHP systems that are most of this market — has to
 * work it out from a page it does not own.
 *
 * `docs/07` §6 specifies the cascade, in order of reliability:
 *
 * ```
 * a) URL pattern            most stable
 * b) DOM data-* attributes
 * c) CSS selectors from the server
 * d) ask the agent          last resort, one click
 * ```
 *
 * The important design decision is not the cascade. It is what happens when
 * two rungs disagree.
 *
 * A wrong answer here is not a missing feature — it is a call note written
 * onto a different customer's record, a disposition set on the wrong lead,
 * and a pipeline the customer can no longer trust. Nobody notices for weeks,
 * and when they do, the damage is a data-integrity incident rather than a
 * bug. So conflicting evidence produces a refusal, never a majority vote:
 * ask the agent, who can see the screen.
 *
 * The same instinct as `providers/readymode.ts` returning `UNKNOWN` instead
 * of a plausible guess. A confidently wrong binding is worse than no binding.
 */

import type { CanonicalEntity } from "./canonical.ts";

/**
 * A read-only view of the host page.
 *
 * Injected rather than reaching for `document`, for the same reason the Rust
 * engine injects its clock: a dependency you cannot replace is one you cannot
 * test against. Every failure mode below is exercised against a fake page.
 *
 * Deliberately tiny. The extension has no business reading anything from a
 * customer's CRM beyond the identifier of the open record — `docs/07` §6:
 * *the extension stores no business data.* A narrow interface is how that
 * stays true when somebody adds a feature in six months.
 */
export interface PageView {
  readonly url: string;
  /** The attribute's value, or null. Never throws on a bad selector. */
  attribute(selector: string, name: string): string | null;
  /** The element's text or input value, or null. Never throws. */
  read(selector: string, from: "text" | "value"): string | null;
}

export type Rung = "url" | "attribute" | "selector" | "agent";

/**
 * Confidence per rung, and the reason for the ordering.
 *
 * A URL is part of the CRM's routing contract: it changes on a release, with
 * a redirect, and loudly. A `data-record-id` attribute is nearly as good. A
 * CSS selector reading visible text is a guess about layout that breaks
 * silently the next time somebody moves a column — it is good enough to
 * *offer* the agent a binding, never good enough to write without one.
 */
export const RUNG_CONFIDENCE: Readonly<Record<Rung, number>> = Object.freeze({
  url: 0.98,
  attribute: 0.9,
  selector: 0.6,
  agent: 1.0, // a human looking at the screen is the ground truth
});

/** Above this, a detection may drive an automatic write. */
export const AUTO_WRITE_CONFIDENCE = 0.85;

export interface DetectionRule {
  entity: CanonicalEntity;
  /**
   * Host suffix the rule applies to, e.g. `salesforce.com`. Matched as a
   * suffix on the *hostname*, so `evil-salesforce.com` does not match — a
   * substring check here would be a way to make the extension bind on a
   * lookalike domain.
   */
  hostSuffix?: string;
  /** Path pattern with a single `:id` segment, e.g. `/lightning/r/Lead/:id/view`. */
  urlPattern?: string;
  /** `data-*` or any attribute carrying the record id. */
  attribute?: { selector: string; name: string };
  /** Last automatic resort: read an id out of the rendered page. */
  selector?: { selector: string; from: "text" | "value" };
}

/**
 * Served by `GET /v1/extension/config`, versioned.
 *
 * `docs/07` §6: selectors live on the server because Salesforce changes its
 * DOM without warning, and a selector shipped inside the extension means a
 * Chrome Web Store review — days — while the product is broken for everyone.
 *
 * `version` is not decoration: a binding recorded against config v7 that
 * later looks wrong can be traced to the config that produced it.
 */
export interface BindingConfig {
  provider: string;
  version: number;
  rules: DetectionRule[];
}

export interface Candidate {
  rung: Rung;
  entity: CanonicalEntity;
  externalId: string;
}

export type Detection =
  | {
      kind: "bound";
      entity: CanonicalEntity;
      externalId: string;
      rung: Rung;
      confidence: number;
      configVersion: number;
      /** Rungs that agreed. More agreement is not more confidence — it is
       *  corroboration, and it is worth showing in a support ticket. */
      corroboratedBy: Rung[];
    }
  | {
      kind: "ambiguous";
      /** Shown to the agent so they pick, rather than being resolved for them. */
      candidates: Candidate[];
      reason: string;
      configVersion: number;
    }
  | { kind: "none"; reason: string; configVersion: number };

/**
 * Extract `:id` from a path pattern.
 *
 * Returns null rather than throwing on anything unexpected. This runs against
 * pages we do not control, on configs that may be stale; a thrown exception
 * here takes the agent's copilot panel down mid-call, which is a far worse
 * outcome than failing to detect a record.
 */
export function matchUrlPattern(
  url: string,
  pattern: string,
  hostSuffix?: string,
): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (hostSuffix && !hostMatches(parsed.hostname, hostSuffix)) return null;

  const want = pattern.split("/").filter((s) => s.length > 0);
  const got = parsed.pathname.split("/").filter((s) => s.length > 0);
  if (want.length !== got.length) return null;

  let id: string | null = null;
  for (let i = 0; i < want.length; i++) {
    if (want[i] === ":id") {
      id = decodeURIComponent(got[i]!);
      continue;
    }
    if (want[i] !== got[i]) return null;
  }
  return id && id.length > 0 ? id : null;
}

/**
 * Suffix match on hostname boundaries.
 *
 * `endsWith("salesforce.com")` also matches `notsalesforce.com`, which is a
 * way to get the extension to activate — and send a session token's worth of
 * behaviour — on a domain the tenant never configured.
 */
export function hostMatches(hostname: string, suffix: string): boolean {
  const h = hostname.toLowerCase();
  const s = suffix.toLowerCase().replace(/^\./, "");
  return h === s || h.endsWith("." + s);
}

/** Ids are compared after this. CRMs pad, case-shift and pretty-print them. */
function normaliseId(raw: string): string {
  return raw.trim().replace(/^#/, "");
}

export function detect(page: PageView, config: BindingConfig): Detection {
  const candidates: Candidate[] = [];

  for (const rule of config.rules) {
    if (rule.hostSuffix && !hostOf(page.url, rule.hostSuffix)) continue;

    if (rule.urlPattern) {
      const id = matchUrlPattern(page.url, rule.urlPattern, rule.hostSuffix);
      if (id) candidates.push({ rung: "url", entity: rule.entity, externalId: normaliseId(id) });
    }
    if (rule.attribute) {
      const v = safe(() => page.attribute(rule.attribute!.selector, rule.attribute!.name));
      if (v && v.trim()) {
        candidates.push({ rung: "attribute", entity: rule.entity, externalId: normaliseId(v) });
      }
    }
    if (rule.selector) {
      const v = safe(() => page.read(rule.selector!.selector, rule.selector!.from));
      if (v && v.trim()) {
        candidates.push({ rung: "selector", entity: rule.entity, externalId: normaliseId(v) });
      }
    }
  }

  if (candidates.length === 0) {
    return { kind: "none", reason: "no rule matched this page", configVersion: config.version };
  }

  // Disagreement is refused, never voted on. Two rungs pointing at different
  // records means one of them is reading a stale fragment of the page — a
  // list row left over from the previous lead, a cached header — and there is
  // no way to tell which from here. The agent can see the screen.
  const ids = new Set(candidates.map((c) => `${c.entity}:${c.externalId}`));
  if (ids.size > 1) {
    return {
      kind: "ambiguous",
      candidates,
      reason:
        "the page yielded more than one record; refusing to guess which one " +
        "the agent is working",
      configVersion: config.version,
    };
  }

  const best = candidates.reduce((a, b) =>
    RUNG_CONFIDENCE[b.rung] > RUNG_CONFIDENCE[a.rung] ? b : a,
  );
  const corroboratedBy = candidates.filter((c) => c.rung !== best.rung).map((c) => c.rung);

  return {
    kind: "bound",
    entity: best.entity,
    externalId: best.externalId,
    rung: best.rung,
    confidence: RUNG_CONFIDENCE[best.rung],
    configVersion: config.version,
    corroboratedBy,
  };
}

/**
 * Bind to what the agent picked.
 *
 * The bottom rung of the cascade, and the one that makes the other three
 * safe to be strict about: refusing an ambiguous page costs the agent one
 * click, so there is never a reason to guess.
 */
export function bindFromAgent(
  entity: CanonicalEntity,
  externalId: string,
  configVersion: number,
): Detection {
  const id = normaliseId(externalId);
  if (!id) {
    return { kind: "none", reason: "agent supplied an empty id", configVersion };
  }
  return {
    kind: "bound",
    entity,
    externalId: id,
    rung: "agent",
    confidence: RUNG_CONFIDENCE.agent,
    configVersion,
    corroboratedBy: [],
  };
}

/**
 * May this binding drive a write without the agent confirming the record?
 *
 * The asymmetry is deliberate. Showing the copilot against a possibly-wrong
 * record wastes a suggestion. Writing to a possibly-wrong record corrupts a
 * customer's CRM. The same detection is good enough for one and not the
 * other, and conflating them is how the second happens.
 */
export function mayAutoWrite(d: Detection): boolean {
  return d.kind === "bound" && d.confidence >= AUTO_WRITE_CONFIDENCE;
}

function hostOf(url: string, suffix: string): boolean {
  try {
    return hostMatches(new URL(url).hostname, suffix);
  } catch {
    return false;
  }
}

function safe<T>(f: () => T | null): T | null {
  try {
    return f();
  } catch {
    // A malformed selector from a stale server config must not take down the
    // panel. It degrades to "this rung found nothing", which the cascade
    // already knows how to handle.
    return null;
  }
}
