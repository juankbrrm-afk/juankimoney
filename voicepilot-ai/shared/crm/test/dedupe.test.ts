/**
 * Deduplication, tested from the direction of the damage.
 *
 * Most of these are not "does it find the duplicate". They are "does it
 * refuse to merge two people", because that is the failure that is silent,
 * permanent and unrecoverable, and the one a plausible implementation makes.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  AUTO_MERGE_BASES,
  describe as summarise,
  findMatches,
  mergeContacts,
  plan,
} from "../src/dedupe.ts";
import type { Contact } from "../src/canonical.ts";

function contact(over: Partial<Contact> = {}): Contact {
  return {
    id: "c1",
    tenantId: "t1",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    externalIds: {},
    customFields: {},
    doNotCall: false,
    consentFlags: {},
    ...over,
  };
}

describe("what may be merged automatically", () => {
  test("a phone number is an identifier", () => {
    const existing = [contact({ id: "a", phoneE164: "+13055550142" })];
    const m = findMatches({ phoneE164: "+13055550142" }, existing);
    assert.equal(m[0]?.basis, "phone");
    assert.equal(m[0]?.autoMergeable, true);
  });

  test("an email is an identifier, compared case-insensitively", () => {
    const existing = [contact({ id: "a", email: "Ana.Ruiz@Example.com" })];
    const m = findMatches({ email: "ana.ruiz@example.com" }, existing);
    assert.equal(m[0]?.basis, "email");
    assert.equal(m[0]?.autoMergeable, true);
  });

  /**
   * The test this module exists for.
   *
   * There are many Maria Gonzalezes, and a call-centre list is exactly the
   * population where two of them turn up. Merging them is invisible and
   * unrecoverable: one person's number, consent state and call history
   * survive, the other's are gone with no record they were ever separate.
   */
  test("a name is not an identifier, even with a company", () => {
    const existing = [
      contact({ id: "a", firstName: "Maria", lastName: "Gonzalez", company: "Acme" }),
    ];
    const m = findMatches(
      { firstName: "Maria", lastName: "Gonzalez", company: "Acme" },
      existing,
    );
    assert.equal(m[0]?.basis, "name_company");
    assert.equal(m[0]?.autoMergeable, false);
  });

  test("the auto-merge set is exactly the identifiers", () => {
    // A guard against somebody adding "name_company" here to cut a review
    // queue. The queue is the product working.
    assert.deepEqual([...AUTO_MERGE_BASES], ["phone", "email"]);
  });

  test("a deleted contact is never matched", () => {
    const existing = [
      contact({ id: "a", phoneE164: "+13055550142", deletedAt: "2026-02-01T00:00:00Z" }),
    ];
    assert.equal(findMatches({ phoneE164: "+13055550142" }, existing).length, 0);
  });
});

describe("merging", () => {
  test("an empty field takes the incoming value", () => {
    const { merged, changes } = mergeContacts(
      contact({ firstName: "Ana" }),
      { lastName: "Ruiz" },
    );
    assert.equal(merged.lastName, "Ruiz");
    assert.deepEqual(changes, [{ field: "lastName", from: null, to: "Ruiz" }]);
  });

  /**
   * A CSV is usually older than the CRM it is being imported into, so
   * "incoming wins" is the wrong default and it overwrites what somebody
   * typed while on a call.
   */
  test("a populated field is not overwritten, and the loser is reported", () => {
    const { merged, discarded } = mergeContacts(
      contact({ email: "ana@work.com" }),
      { email: "ana@old.com" },
    );
    assert.equal(merged.email, "ana@work.com");
    assert.deepEqual(discarded, [
      { field: "email", from: "ana@old.com", to: "ana@work.com" },
    ]);
  });

  test("nothing is discarded silently", () => {
    const { discarded } = mergeContacts(
      contact({ phoneE164: "+13055550142", company: "Acme" }),
      { phoneE164: "+13055559999", company: "Acme Corp" },
    );
    assert.deepEqual(
      discarded.map((d) => d.field).sort(),
      ["company", "phoneE164"],
    );
  });
});

describe("do-not-call survives every merge", () => {
  /**
   * A call to a suppressed number is $500–$1,500 under the TCPA, *per call*,
   * and a merge is precisely the operation that would clear the flag at scale
   * and without a trace: one bad import, then a dialler working through it.
   */
  test("a flag on either side wins", () => {
    for (const [a, b] of [[true, false], [false, true], [true, true]] as const) {
      const { merged } = mergeContacts(
        contact({ doNotCall: a }),
        { doNotCall: b },
      );
      assert.equal(merged.doNotCall, true, `${a} + ${b}`);
    }
  });

  test("an incoming false cannot clear an existing flag", () => {
    const { merged } = mergeContacts(
      contact({ doNotCall: true, dncReason: "pidió no ser llamado" }),
      { doNotCall: false },
    );
    assert.equal(merged.doNotCall, true);
    assert.equal(merged.dncReason, "pidió no ser llamado");
  });

  test("a revoked consent cannot be un-revoked by a spreadsheet", () => {
    const { merged, discarded } = mergeContacts(
      contact({ consentFlags: { sms: false } }),
      { consentFlags: { sms: true } },
    );
    assert.equal(merged.consentFlags.sms, false);
    assert.equal(discarded.some((d) => d.field === "consent.sms"), true);
  });

  test("a revocation in the incoming record is applied", () => {
    const { merged } = mergeContacts(
      contact({ consentFlags: { sms: true } }),
      { consentFlags: { sms: false } },
    );
    assert.equal(merged.consentFlags.sms, false);
  });
});

describe("the dry run", () => {
  test("a clean file plans cleanly", () => {
    const p = plan(
      [{ phoneE164: "+13055550001" }, { phoneE164: "+13055550002" }],
      [],
    );
    assert.equal(p.counts.create, 2);
    assert.equal(p.cleanlyApplicable, true);
  });

  /**
   * The most common real import: the same person twice in one file.
   *
   * An importer that compares each row only against the database produces
   * exactly the duplicate it was bought to prevent.
   */
  test("a row duplicated inside the file collapses", () => {
    const p = plan(
      [
        { phoneE164: "+13055550001", firstName: "Ana" },
        { phoneE164: "+13055550001", lastName: "Ruiz" },
      ],
      [],
    );
    assert.equal(p.counts.create, 1);
    assert.equal(p.counts.merge, 1);
  });

  test("a name-only row does not join the pool as a match target", () => {
    // Two different people who share a name, neither with an identifier.
    // Both are created; the second must not be merged into the first.
    const p = plan(
      [
        { firstName: "Maria", lastName: "Gonzalez" },
        { firstName: "Maria", lastName: "Gonzalez" },
      ],
      [],
    );
    assert.equal(p.counts.create, 2);
    assert.equal(p.counts.merge, 0);
  });

  test("a shared name goes to review, never to merge", () => {
    const p = plan(
      [{ firstName: "Maria", lastName: "Gonzalez", company: "Acme" }],
      [contact({ id: "a", firstName: "Maria", lastName: "Gonzalez", company: "Acme" })],
    );
    assert.equal(p.counts.review, 1);
    assert.equal(p.cleanlyApplicable, false);
  });

  /**
   * The database already holds a duplicate, and the incoming row matches both.
   * Merging into either one picks a winner arbitrarily and strands the other.
   */
  test("a row matching two different existing contacts goes to review", () => {
    const p = plan(
      [{ phoneE164: "+13055550142", email: "ana@example.com" }],
      [
        contact({ id: "a", phoneE164: "+13055550142" }),
        contact({ id: "b", email: "ana@example.com" }),
      ],
    );
    assert.equal(p.counts.review, 1);
    const d = p.decisions[0];
    assert.equal(d?.action, "review");
    if (d.action === "review") {
      assert.match(d.reason, /duplicates of each other/);
      assert.equal(d.candidates.length, 2);
    }
  });

  /**
   * Same phone, different Salesforce ids. In Salesforce these are two
   * records, and our merging them makes our data disagree with theirs
   * permanently — a shared desk phone, or a number reassigned to a new hire.
   */
  test("conflicting ids in one external system go to review", () => {
    const p = plan(
      [{ phoneE164: "+13055550142", externalIds: { "conn-1": "003XX9" } }],
      [contact({ id: "a", phoneE164: "+13055550142", externalIds: { "conn-1": "003AA1" } })],
    );
    assert.equal(p.counts.review, 1);
    if (p.decisions[0]?.action === "review") {
      assert.match(p.decisions[0].reason, /different people/);
    }
  });

  test("different ids in different connections merge fine", () => {
    const p = plan(
      [{ phoneE164: "+13055550142", externalIds: { "conn-2": "L-77" } }],
      [contact({ id: "a", phoneE164: "+13055550142", externalIds: { "conn-1": "003AA1" } })],
    );
    assert.equal(p.counts.merge, 1);
    if (p.decisions[0]?.action === "merge") {
      assert.deepEqual(p.decisions[0].result.merged.externalIds, {
        "conn-1": "003AA1",
        "conn-2": "L-77",
      });
    }
  });

  test("planning writes nothing to the existing records", () => {
    const existing = [contact({ id: "a", phoneE164: "+13055550142" })];
    const before = JSON.stringify(existing);
    plan([{ phoneE164: "+13055550142", firstName: "Ana" }], existing);
    assert.equal(JSON.stringify(existing), before);
  });

  test("the summary leads with what needs a human", () => {
    const p = plan(
      [{ firstName: "Maria", lastName: "Gonzalez" }],
      [contact({ id: "a", firstName: "Maria", lastName: "Gonzalez" })],
    );
    assert.match(summarise(p), /^1 need a human/);
  });
});

describe("normalisation", () => {
  test("accents are folded when comparing names", () => {
    const existing = [contact({ id: "a", firstName: "José", lastName: "Muñoz" })];
    const m = findMatches({ firstName: "Jose", lastName: "Munoz" }, existing);
    assert.equal(m.length, 1);
    // Folded for *flagging*, and still not auto-mergeable. The bet that
    // Muñoz and Munoz are one person is reasonable for a review queue and
    // unreasonable for a merge.
    assert.equal(m[0]?.autoMergeable, false);
  });

  test("a phone number that is not E.164 does not match by luck", () => {
    const existing = [contact({ id: "a", phoneE164: "+13055550142" })];
    assert.equal(findMatches({ phoneE164: "(305) 555-0142" }, existing).length, 0);
  });
});
