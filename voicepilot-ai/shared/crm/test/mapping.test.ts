import { test } from "node:test";
import assert from "node:assert/strict";

import {
  applyTransform,
  dryRun,
  mapInbound,
  mapOutbound,
  validateMappings,
  type FieldMapping,
} from "../src/mapping.ts";

const disposition: FieldMapping = {
  canonicalEntity: "call",
  canonicalField: "disposition",
  externalObject: "Call",
  externalField: "Outcome",
  direction: "push",
  transform: {
    type: "enum_map",
    map: { sale_closed: "Closed Won", not_interested: "Not Interested" },
  },
};

test("enum_map translates canonical values to the customer's own labels", () => {
  assert.equal(
    applyTransform("sale_closed", disposition.transform!, {}),
    "Closed Won",
  );
});

test("an unmapped enum throws rather than writing the raw value through", () => {
  // Passing "callback_scheduled" straight into a CRM expecting its own labels
  // writes garbage that nobody notices until the forecast is wrong.
  assert.throws(
    () => applyTransform("callback_scheduled", disposition.transform!, {}),
    /no mapping and no fallback/,
  );
});

test("an unmapped enum uses the fallback when one is configured", () => {
  assert.equal(
    applyTransform(
      "callback_scheduled",
      { type: "enum_map", map: {}, fallback: "Other" },
      {},
    ),
    "Other",
  );
});

test("template substitution is single-pass and cannot expand its own output", () => {
  // A record whose value contains "{secret}" must not cause a second expansion
  // that pulls in another field.
  const out = applyTransform(
    "",
    { type: "template", pattern: "Call with {name}: {summary}" },
    { name: "{summary}", summary: "confidential" },
  );
  assert.equal(out, "Call with {summary}: confidential");
});

test("phone normalisation refuses ambiguous numbers instead of guessing", () => {
  const t = { type: "phone" as const, defaultCountryCode: "1" };
  assert.equal(applyTransform("(305) 555-0142", t, {}), "+13055550142");
  assert.equal(applyTransform("+57 300 1234567", t, {}), "+573001234567");
  assert.equal(applyTransform("13055550142", t, {}), "+13055550142");
  // Nine digits: could be anything. Guessing is how a US campaign dials Colombia.
  assert.throws(() => applyTransform("305555014", t, {}), /country code/);
});

test("number transform scales and rejects non-numbers", () => {
  assert.equal(
    applyTransform("1250", { type: "number", scale: 100 }, {}),
    125000,
  );
  assert.throws(
    () => applyTransform("not money", { type: "number" }, {}),
    /not a number/,
  );
});

test("date transform emits every format the providers ask for", () => {
  const iso = "2026-08-05T14:22:10.000Z";
  assert.equal(applyTransform(iso, { type: "date", format: "iso" }, {}), iso);
  assert.equal(
    applyTransform(iso, { type: "date", format: "date_only" }, {}),
    "2026-08-05",
  );
  assert.equal(
    applyTransform(iso, { type: "date", format: "epoch_s" }, {}),
    1785939730,
  );
  assert.throws(
    () => applyTransform("yesterday", { type: "date", format: "iso" }, {}),
    /not a date/,
  );
});

test("truncate protects fields with provider length limits", () => {
  assert.equal(
    applyTransform("x".repeat(500), { type: "truncate", maxLength: 255 }, {})
      ?.toString().length,
    255,
  );
});

test("a failing field does not fail the whole write", () => {
  // A note that reaches the CRM missing one custom field beats no note at all.
  const mappings: FieldMapping[] = [
    {
      canonicalEntity: "call",
      canonicalField: "summary",
      externalObject: "Call",
      externalField: "Description",
      direction: "push",
    },
    disposition,
  ];
  const result = mapOutbound(
    { summary: "Customer asked for a callback", disposition: "unknown_value" },
    mappings,
    "call",
  );

  assert.equal(result.record["Description"], "Customer asked for a callback");
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0]?.field, "disposition");
});

test("unmapped source fields are reported, not silently dropped", () => {
  const result = mapOutbound(
    { summary: "hello", secretRevenueField: 42000 },
    [
      {
        canonicalEntity: "call",
        canonicalField: "summary",
        externalObject: "Call",
        externalField: "Description",
        direction: "push",
      },
    ],
    "call",
  );
  assert.deepEqual(result.unmapped, ["secretRevenueField"]);
});

test("direction is respected in both directions", () => {
  const pushOnly: FieldMapping = {
    canonicalEntity: "lead",
    canonicalField: "disposition",
    externalObject: "Lead",
    externalField: "Status",
    direction: "push",
  };
  assert.equal(
    mapInbound({ Status: "Working" }, [pushOnly], "lead").record["disposition"],
    undefined,
  );
  assert.equal(
    mapOutbound({ disposition: "contacted" }, [pushOnly], "lead").record[
      "Status"
    ],
    "contacted",
  );
});

test("an unknown transform type is refused, not evaluated", () => {
  // Transforms are a fixed set precisely so a mapping cannot become a code
  // execution vector for whoever can reach the integrations screen.
  const issues = validateMappings([
    {
      canonicalEntity: "lead",
      canonicalField: "x",
      externalObject: "Lead",
      externalField: "Y",
      direction: "push",
      transform: { type: "eval" } as never,
    },
  ]);
  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.code, "unknown_transform");
});

test("two mappings writing the same external field are rejected", () => {
  // Otherwise the winner depends on array order, and the bug surfaces months
  // later as "sometimes the note is wrong".
  const issues = validateMappings([
    {
      canonicalEntity: "call",
      canonicalField: "summary",
      externalObject: "Call",
      externalField: "Description",
      direction: "push",
    },
    {
      canonicalEntity: "call",
      canonicalField: "disposition",
      externalObject: "Call",
      externalField: "Description",
      direction: "push",
    },
  ]);
  assert.equal(issues.some((i) => i.code === "duplicate_target"), true);
});

test("dry run previews the write without performing it", () => {
  const mappings: FieldMapping[] = [
    {
      canonicalEntity: "call",
      canonicalField: "summary",
      externalObject: "Call",
      externalField: "Description",
      direction: "push",
    },
    disposition,
    {
      canonicalEntity: "call",
      canonicalField: "neverPresent",
      externalObject: "Call",
      externalField: "Unused__c",
      direction: "push",
    },
  ];

  const result = dryRun(
    [
      { summary: "First call", disposition: "sale_closed" },
      { summary: "Second call", disposition: "bogus" },
    ],
    mappings,
    "call",
  );

  assert.equal(result.samples.length, 2);
  assert.equal(result.samples[0]?.output["Outcome"], "Closed Won");
  // The bad row surfaces here, before anything reaches production.
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0]?.index, 1);
  // And a mapping that never produces anything is flagged as probably wrong.
  assert.deepEqual(result.alwaysEmpty, ["Unused__c"]);
});
