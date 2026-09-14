/**
 * Deciding whether two records are the same person.
 *
 * This is where CRMs destroy customer data, and the damage is asymmetric in a
 * way that dictates every rule below.
 *
 * A **missed duplicate** is visible and cheap. Two rows for Maria Gonzalez,
 * somebody notices, somebody merges them. Annoying.
 *
 * A **wrong merge** is invisible and permanent. Two different people are now
 * one record. One person's phone number, one person's consent state, one
 * person's call history — and the other person's data is gone, along with any
 * record that it was ever separate. Nobody notices for months, and when they
 * do, there is nothing to restore from. The first call to the surviving number
 * that should have gone to the other person is, at best, embarrassing.
 *
 * So:
 *
 *   **Automatic merging happens only on an identifier that is unique by
 *   construction.** A phone number or an email address. Never a name, never a
 *   name plus a company, never a fuzzy score over a threshold.
 *
 * Names are not identifiers. There are many Maria Gonzalezes, plenty of them
 * at the same company, and a call centre list is exactly the population where
 * that is most likely. Name similarity produces a *candidate for a human to
 * look at*, which is a different output with a different type.
 *
 * `docs/07` §8 asks for "duplicate detection and dry-run" on import. Detection
 * and merging are kept apart here for the same reason `binding.ts` refuses an
 * ambiguous page instead of voting: the confident wrong answer is the one that
 * costs money.
 */

import type { Contact, E164 } from "./canonical.ts";

/**
 * Why two records were judged the same.
 *
 * Kept on the result rather than reduced to a boolean, because the person
 * reviewing an import needs to know whether the system matched on a phone
 * number or on a surname before they approve 4,000 merges.
 */
export type MatchBasis = "phone" | "email" | "name_company" | "name_only";

/** Bases the system is permitted to act on without a human. */
export const AUTO_MERGE_BASES: readonly MatchBasis[] = Object.freeze([
  "phone",
  "email",
]);

export interface Match {
  existing: Contact;
  incoming: Partial<Contact>;
  basis: MatchBasis;
  /**
   * Confidence is reported but never compared against a threshold to decide
   * merging. `basis` decides. A number invites somebody to add a slider, and
   * a slider on this decision is a setting whose wrong position silently
   * destroys records — there is no position of that slider at which merging
   * two people who share a name is correct.
   */
  confidence: number;
  get autoMergeable(): boolean;
}

const CONFIDENCE: Readonly<Record<MatchBasis, number>> = Object.freeze({
  phone: 0.99,
  email: 0.97,
  name_company: 0.55,
  name_only: 0.2,
});

function match(existing: Contact, incoming: Partial<Contact>, basis: MatchBasis): Match {
  return {
    existing,
    incoming,
    basis,
    confidence: CONFIDENCE[basis],
    get autoMergeable() {
      return AUTO_MERGE_BASES.includes(basis);
    },
  };
}

/** Case and whitespace only. Emails are compared as the provider would. */
function normEmail(s: string | undefined): string | null {
  if (!s) return null;
  const t = s.trim().toLowerCase();
  return t.includes("@") ? t : null;
}

/**
 * Names are compared after this, and only ever to produce a *candidate*.
 *
 * Accents are folded because a CSV exported from one system and typed into
 * another will disagree about them — `Muñoz` and `Munoz` are one person's two
 * spellings far more often than they are two people. That is a reasonable bet
 * for flagging a candidate and an unreasonable one for merging, which is
 * exactly the distinction this module is built on.
 */
function normName(s: string | undefined): string {
  if (!s) return "";
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fullName(c: Partial<Contact>): string {
  return normName([c.firstName, c.lastName].filter(Boolean).join(" "));
}

/**
 * Find existing contacts that may be the incoming one.
 *
 * Returns every basis that matched, strongest first, rather than the single
 * best. An import review screen showing "matched on name" when the record also
 * matched on phone is a screen that gets a merge rejected for the wrong
 * reason.
 *
 * Linear over the candidate set on purpose. The production version indexes by
 * phone and email in Postgres; the ordering and the rules are what live here,
 * and they are what a query has to preserve.
 */
export function findMatches(incoming: Partial<Contact>, existing: Contact[]): Match[] {
  const out: Match[] = [];
  const phone = incoming.phoneE164?.trim();
  const email = normEmail(incoming.email);
  const name = fullName(incoming);
  const company = normName(incoming.company);

  for (const candidate of existing) {
    if (candidate.deletedAt) continue;

    if (phone && candidate.phoneE164 && candidate.phoneE164 === phone) {
      out.push(match(candidate, incoming, "phone"));
      continue;
    }
    if (email && normEmail(candidate.email) === email) {
      out.push(match(candidate, incoming, "email"));
      continue;
    }
    if (!name) continue;
    if (fullName(candidate) !== name) continue;

    // A shared name. This is a question for a human, and the two cases are
    // reported separately because they are not equally suspicious: a name
    // match inside one company is worth a look, a bare name match across a
    // 40,000-row list is mostly noise.
    if (company && normName(candidate.company) === company) {
      out.push(match(candidate, incoming, "name_company"));
    } else {
      out.push(match(candidate, incoming, "name_only"));
    }
  }

  const order: MatchBasis[] = ["phone", "email", "name_company", "name_only"];
  return out.sort((a, b) => order.indexOf(a.basis) - order.indexOf(b.basis));
}

// ---------------------------------------------------------------------------
// Merging
// ---------------------------------------------------------------------------

export interface FieldChange {
  field: string;
  from: unknown;
  to: unknown;
}

/**
 * The plain string fields a merge may fill in.
 *
 * Derived from `Contact` rather than written as a literal union, so a field
 * renamed on the canonical model breaks the build here instead of quietly
 * dropping out of every merge.
 */
type ScalarField = {
  [K in keyof Contact]-?: Contact[K] extends string | undefined ? K : never;
}[keyof Contact];

export interface MergeResult {
  merged: Contact;
  changes: FieldChange[];
  /**
   * Values the incoming record carried that were NOT taken, with the value
   * that won.
   *
   * A merge that silently discards data is how a phone number nobody can find
   * again disappears. Reporting the discard costs one array and makes the
   * import review honest: "kept +13055550142, discarded +13055559999" is a
   * sentence somebody can act on.
   */
  discarded: FieldChange[];
}

/**
 * Merge an incoming record into an existing one.
 *
 * Two rules, and the second one is the one with a statute behind it.
 *
 * **1. Filling a gap is safe; overwriting is not.** An empty field taking a
 * value loses nothing. A populated field being replaced destroys something
 * somebody entered, and the incoming record is not automatically newer or
 * better — a CSV is usually older than the CRM it is being imported into.
 * So existing values win and the loser is reported.
 *
 * **2. `doNotCall` is a one-way latch.** If either record says do-not-call,
 * the merged record says do-not-call, regardless of which is "newer" or which
 * side the flag came from. Under the TCPA a call to a number on a suppression
 * list is $500 to $1,500 *per call*, and a merge is exactly the operation that
 * would otherwise clear the flag at scale and silently — one bad import, then
 * a dialler working through it. There is no correct reason to drop a
 * suppression flag during a merge, so the operation cannot express it.
 */
export function mergeContacts(existing: Contact, incoming: Partial<Contact>): MergeResult {
  const merged: Contact = { ...existing };
  const changes: FieldChange[] = [];
  const discarded: FieldChange[] = [];

  // Every one of these is `string | undefined` on Contact, which is what
  // makes the indexed write below type-safe without a cast. If a non-string
  // optional field is ever added to this list, tsc rejects it here rather
  // than at whatever call site eventually reads the wrong type.
  const scalars: readonly ScalarField[] = [
    "firstName", "lastName", "company", "email", "phoneE164",
    "timezone", "country", "dncReason",
  ];

  for (const field of scalars) {
    const next = incoming[field];
    if (next === undefined || next === "") continue;

    const current = existing[field];
    if (current === undefined || current === "") {
      merged[field] = next;
      changes.push({ field, from: current ?? null, to: next });
    } else if (current !== next) {
      discarded.push({ field, from: next, to: current });
    }
  }

  // Rule 2. Deliberately not `incoming.doNotCall ?? existing.doNotCall`, which
  // would let an incoming `false` clear a flag that is there for a reason.
  const dnc = existing.doNotCall || incoming.doNotCall === true;
  if (dnc !== existing.doNotCall) {
    merged.doNotCall = dnc;
    changes.push({ field: "doNotCall", from: existing.doNotCall, to: dnc });
  }
  if (dnc && !merged.dncReason && incoming.dncReason) {
    merged.dncReason = incoming.dncReason;
  }

  // Consent flags follow the same asymmetry: a granted consent can be
  // recorded, a revoked one cannot be un-revoked by an import. `false` is a
  // decision somebody made, and it outranks a spreadsheet.
  merged.consentFlags = { ...existing.consentFlags };
  for (const [key, value] of Object.entries(incoming.consentFlags ?? {})) {
    const current = merged.consentFlags[key];
    if (current === false) {
      if (value === true) discarded.push({ field: `consent.${key}`, from: true, to: false });
      continue;
    }
    if (current === undefined) {
      merged.consentFlags[key] = value;
      changes.push({ field: `consent.${key}`, from: null, to: value });
    } else if (value === false) {
      merged.consentFlags[key] = false;
      changes.push({ field: `consent.${key}`, from: current, to: false });
    }
  }

  merged.externalIds = { ...existing.externalIds };
  for (const [connection, id] of Object.entries(incoming.externalIds ?? {})) {
    const current = merged.externalIds[connection];
    if (current === undefined) {
      merged.externalIds[connection] = id;
      changes.push({ field: `externalIds.${connection}`, from: null, to: id });
    } else if (current !== id) {
      // Two ids from the same connection means the two records are probably
      // NOT the same person in that system. Reported rather than resolved;
      // `plan()` treats it as a reason to ask.
      discarded.push({ field: `externalIds.${connection}`, from: id, to: current });
    }
  }

  merged.customFields = { ...existing.customFields };
  for (const [key, value] of Object.entries(incoming.customFields ?? {})) {
    if (merged.customFields[key] === undefined) {
      merged.customFields[key] = value;
      changes.push({ field: `customFields.${key}`, from: null, to: value });
    } else if (merged.customFields[key] !== value) {
      discarded.push({ field: `customFields.${key}`, from: value, to: merged.customFields[key] });
    }
  }

  return { merged, changes, discarded };
}

// ---------------------------------------------------------------------------
// The dry run
// ---------------------------------------------------------------------------

/**
 * Why a row needs a person, as a value rather than as prose.
 *
 * The `reason` string next to it is written for whoever is reading a log. It
 * is not an interface: a UI that switches on it breaks when somebody
 * improves the wording, and a UI that renders it directly ships English into
 * a Spanish product. The code is the stable thing — same split as the
 * copilot's `Refusal` enum and its free-text detail.
 */
export type ReviewCode =
  /** The database already holds two records this row matches. */
  | "existing_duplicates"
  /** Two ids in one external system: two people there. */
  | "external_id_conflict"
  /** Same name at the same company. Plausible, and not an identifier. */
  | "name_and_company"
  /** Same name, nothing else. */
  | "name_only";

export type Decision =
  | { action: "create"; incoming: Partial<Contact>; row: number }
  | {
      action: "merge";
      row: number;
      match: Match;
      result: MergeResult;
    }
  | {
      action: "review";
      row: number;
      /** Every candidate, so the reviewer chooses rather than confirms. */
      candidates: Match[];
      code: ReviewCode;
      /** For logs and support tickets. Never switched on, never rendered raw. */
      reason: string;
      incoming: Partial<Contact>;
    };

export interface ImportPlan {
  decisions: Decision[];
  counts: { create: number; merge: number; review: number };
  /**
   * True when the plan can be applied without anybody looking at it.
   *
   * `docs/07` §8 asks for a dry run, and a dry run that always ends in "looks
   * fine, apply" is theatre. This is false whenever a single row needs a
   * human, which is the common case for a real list and is the correct
   * outcome.
   */
  cleanlyApplicable: boolean;
}

/**
 * Plan an import without performing it.
 *
 * Nothing here writes. The plan is the artefact somebody reviews, and it is
 * also what the apply step consumes, so what was reviewed is exactly what
 * runs — a re-derivation at apply time is a second chance to decide
 * differently from what the human approved.
 */
export function plan(rows: Partial<Contact>[], existing: Contact[]): ImportPlan {
  const decisions: Decision[] = [];

  // Rows are matched against the growing set, so two duplicate rows *inside
  // the same file* collapse instead of both being created. A file that
  // contains the same person twice is the single most common import, and an
  // importer that only compares against the database produces the duplicate
  // it was bought to prevent.
  const pool = [...existing];

  rows.forEach((incoming, i) => {
    const row = i + 1;
    const matches = findMatches(incoming, pool);

    if (matches.length === 0) {
      decisions.push({ action: "create", incoming, row });
      // Only rows with an identifier join the pool. Adding a name-only row
      // would make the *next* identical name look like a duplicate of a row
      // that is itself unverified.
      if (incoming.phoneE164 || incoming.email) {
        pool.push(asContact(incoming));
      }
      return;
    }

    const auto = matches.filter((m) => m.autoMergeable);

    // Two different existing records, both matching on strong identifiers,
    // means the *database* holds a duplicate. Merging into either one picks a
    // winner arbitrarily and strands the other. A human has to see this.
    if (auto.length > 1 && new Set(auto.map((m) => m.existing.id)).size > 1) {
      decisions.push({
        action: "review",
        row,
        candidates: matches,
        code: "existing_duplicates",
        reason:
          "this row matches two different existing contacts on strong " +
          "identifiers — the existing records are probably duplicates of " +
          "each other, and merging into either one strands the other",
        incoming,
      });
      return;
    }

    if (auto.length === 1) {
      const m = auto[0]!;
      const result = mergeContacts(m.existing, incoming);
      const idConflict = result.discarded.some((d) => d.field.startsWith("externalIds."));
      if (idConflict) {
        decisions.push({
          action: "review",
          row,
          candidates: matches,
          code: "external_id_conflict",
          reason:
            "the two records carry different ids in the same external " +
            "system, which usually means they are different people there",
          incoming,
        });
        return;
      }
      decisions.push({ action: "merge", row, match: m, result });
      return;
    }

    const byName = matches[0]!.basis === "name_company";
    decisions.push({
      action: "review",
      row,
      candidates: matches,
      code: byName ? "name_and_company" : "name_only",
      reason: byName
        ? "same name at the same company — plausible, and not an identifier"
        : "same name only. Names are not identifiers",
      incoming,
    });
  });

  const counts = {
    create: decisions.filter((d) => d.action === "create").length,
    merge: decisions.filter((d) => d.action === "merge").length,
    review: decisions.filter((d) => d.action === "review").length,
  };

  return { decisions, counts, cleanlyApplicable: counts.review === 0 };
}

/** A minimal Contact for in-file matching. Never persisted from here. */
function asContact(p: Partial<Contact>): Contact {
  return {
    id: `pending:${p.phoneE164 ?? p.email ?? Math.random().toString(36)}`,
    tenantId: p.tenantId ?? "",
    createdAt: "", updatedAt: "",
    externalIds: {}, customFields: {},
    doNotCall: p.doNotCall ?? false,
    consentFlags: {},
    ...p,
  } as Contact;
}

/**
 * Human-readable summary of a plan.
 *
 * Leads with what needs attention rather than with the total, because the
 * total is the number that makes an import look successful and the review
 * count is the number that decides whether it is.
 */
export function describe(p: ImportPlan): string {
  const parts: string[] = [];
  if (p.counts.review > 0) parts.push(`${p.counts.review} need a human`);
  parts.push(`${p.counts.create} new`);
  parts.push(`${p.counts.merge} merged`);
  return parts.join(", ");
}

/** Numbers that could not be normalised are rejected, never guessed. */
export function isE164(s: string): s is E164 {
  return /^\+[1-9]\d{7,14}$/.test(s);
}
