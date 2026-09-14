/**
 * Generate the import review fixture by running a real file through `plan()`.
 *
 * Same discipline as the other three screens: the decisions on this page are
 * made by `shared/crm/src/dedupe.ts`, not by a JSON somebody typed. It
 * matters more here than anywhere else, because what this screen displays is
 * a set of refusals — "these two rows are not the same person" — and a
 * hand-written fixture would show refusals that no code makes.
 *
 * The file below is a realistic bad list. Every row is one of the ways a real
 * import goes wrong, and several of them are rows a naive importer merges
 * happily:
 *
 *   - the same person twice inside the file (the most common import there is)
 *   - two different people who share a name
 *   - a name match at the same company, which is plausible and still not an
 *     identifier
 *   - a row matching two existing contacts, meaning the database already
 *     holds a duplicate
 *   - conflicting ids in the same external system
 *   - a suppressed number returning as un-suppressed, which is the row that
 *     costs $500-$1,500 per call if the merge gets it wrong
 *
 *     node --experimental-strip-types generate_fixture.mjs > plan.json
 */

import { plan, mergeContacts, findMatches } from "../../shared/crm/src/dedupe.ts";

/** What is already in the CRM. */
const EXISTING = [
  contact("a1", {
    firstName: "Michael", lastName: "Reed", company: "Reed & Sons",
    phoneE164: "+13055550142", email: "m.reed@reedandsons.com",
    externalIds: { "conn-sf": "003AA1" },
  }),
  contact("a2", {
    firstName: "Maria", lastName: "Gonzalez", company: "Acme Roofing",
    phoneE164: "+13055550188",
  }),
  contact("a3", {
    firstName: "Denise", lastName: "Fowler",
    phoneE164: "+17865550110",
    // Asked not to be called. This flag is the one thing in the whole
    // importer that carries a statutory penalty if a merge drops it.
    doNotCall: true, dncReason: "Pidió no ser llamada — 12 feb",
  }),
  contact("a4", {
    firstName: "Harold", lastName: "Nguyen",
    email: "harold@nguyenhvac.com",
    // Already carries a Salesforce id. The incoming row brings a different
    // one from the same connection, which is the case that has to stop.
    externalIds: { "conn-sf": "003BB2" },
  }),
  // The database already holds a duplicate of the row below: one record has
  // the phone, another has the email.
  contact("a5", { firstName: "Trent", lastName: "Okafor", phoneE164: "+13055550177" }),
  contact("a6", { firstName: "Trent", lastName: "Okafor", email: "trent@okaforsolar.com" }),
  contact("a7", {
    firstName: "José", lastName: "Muñoz", company: "Muñoz Electric",
  }),
];

/** The CSV somebody just dropped in. */
const ROWS = [
  // Clean new contact.
  { firstName: "Lena", lastName: "Brooks", phoneE164: "+13055550201",
    email: "lena@brooksfamily.net", company: "—" },

  // Same phone as a1. Fills the blank timezone, and its older email loses.
  { firstName: "Michael", lastName: "Reed", phoneE164: "+13055550142",
    email: "mreed@oldmail.com", timezone: "America/New_York" },

  // Same person as the row above, again, inside this same file. An importer
  // that only compares against the database creates the duplicate it was
  // bought to prevent.
  { firstName: "Mike", lastName: "Reed", phoneE164: "+13055550142",
    company: "Reed and Sons LLC" },

  // Same name, same company, no identifier. Plausible — and a name is not an
  // identifier. Goes to a human.
  { firstName: "Maria", lastName: "Gonzalez", company: "Acme Roofing" },

  // Same name as the row above, different person, no identifier either.
  // Both must be created; neither may be merged into the other.
  { firstName: "Maria", lastName: "Gonzalez", company: "Vega Contracting" },

  // The dangerous one. A spreadsheet claiming a suppressed number is fine to
  // call. The merge must keep the suppression and report the attempt.
  { firstName: "Denise", lastName: "Fowler", phoneE164: "+17865550110",
    doNotCall: false, email: "denise.fowler@gmail.com" },

  // Same email as a4, different Salesforce id from the same connection.
  // Two records there usually means two people there.
  { firstName: "Harold", lastName: "Nguyen", email: "harold@nguyenhvac.com",
    externalIds: { "conn-sf": "003ZZ9" } },

  // Matches a5 by phone and a6 by email. The existing records are duplicates
  // of each other; merging into either strands the other.
  { firstName: "Trent", lastName: "Okafor", phoneE164: "+13055550177",
    email: "trent@okaforsolar.com" },

  // Accents. Folded for flagging, still not auto-merged.
  { firstName: "Jose", lastName: "Munoz", company: "Munoz Electric" },

  // A phone that is not E.164. Not matched by luck, and not guessed at.
  { firstName: "Sam", lastName: "Whitfield", phoneE164: "(305) 555-0199" },
];

function contact(id, over) {
  return {
    id, tenantId: "solaris",
    createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
    externalIds: {}, customFields: {},
    doNotCall: false, consentFlags: {},
    ...over,
  };
}

const p = plan(ROWS, EXISTING);

/**
 * Serialise a decision for the screen.
 *
 * The merge preview carries both what changed and what was discarded.
 * `dedupe.ts` reports discards rather than dropping them silently, and a
 * review screen that shows only the changes hides exactly the information
 * somebody is reviewing for: "kept +13055550142, discarded +13055559999" is
 * a sentence a person can act on.
 */
function serialise(d) {
  const label = (c) =>
    [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || c.phoneE164 || "—";

  if (d.action === "create") {
    return { action: "create", row: d.row, name: label(d.incoming), incoming: d.incoming };
  }
  if (d.action === "merge") {
    return {
      action: "merge", row: d.row,
      name: label(d.match.existing),
      basis: d.match.basis,
      confidence: d.match.confidence,
      existingId: d.match.existing.id,
      changes: d.result.changes,
      discarded: d.result.discarded,
      dncKept: d.result.merged.doNotCall,
    };
  }
  return {
    action: "review", row: d.row,
    name: label(d.incoming),
    code: d.code,
    reason: d.reason,
    candidates: d.candidates.map((c) => ({
      id: c.existing.id, name: label(c.existing), basis: c.basis,
      confidence: c.confidence, autoMergeable: c.autoMergeable,
      company: c.existing.company ?? null,
    })),
    incoming: d.incoming,
  };
}

/**
 * The suppression check, stated separately and loudly.
 *
 * It is the one outcome on this screen with a statute behind it, and burying
 * it inside a merge preview among six other field changes is how it stops
 * being noticed.
 */
const suppression = (() => {
  const row = ROWS.find((r) => r.doNotCall === false && r.phoneE164);
  if (!row) return null;
  const match = findMatches(row, EXISTING).find((m) => m.autoMergeable);
  if (!match || !match.existing.doNotCall) return null;
  const { merged } = mergeContacts(match.existing, row);
  return {
    name: [match.existing.firstName, match.existing.lastName].join(" "),
    phone: match.existing.phoneE164,
    fileSaid: row.doNotCall,
    kept: merged.doNotCall,
    reason: match.existing.dncReason,
  };
})();

process.stdout.write(JSON.stringify({
  file: { name: "leads-febrero.csv", rows: ROWS.length },
  counts: p.counts,
  cleanlyApplicable: p.cleanlyApplicable,
  decisions: p.decisions.map(serialise),
  suppression,
  generated_by: "frontend/import/generate_fixture.mjs — real dedupe engine",
}, null, 1));
