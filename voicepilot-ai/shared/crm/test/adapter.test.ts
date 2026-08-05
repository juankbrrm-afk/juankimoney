import { test } from "node:test";
import assert from "node:assert/strict";

import {
  availableSurfaces,
  canWrite,
  type AdapterCapabilities,
} from "../src/adapter.ts";
import {
  READYMODE_CAPABILITIES,
  READYMODE_SELECTORS,
  UNKNOWN,
  integrationReadiness,
  required,
} from "../src/providers/readymode.ts";
import { normaliseE164, validateContact, validateLead } from "../src/canonical.ts";

const fullFeatured: AdapterCapabilities = {
  provider: "salesforce",
  level: "bidirectional",
  entities: ["contact", "lead", "opportunity", "call", "note", "task"],
  writable: ["call", "note", "task", "lead.status", "opportunity"],
  readable: ["contact", "lead", "opportunity"],
  webhooks: true,
  customFields: true,
  resolveByPhone: true,
  ownsAudioPath: false,
};

test("the UI only offers surfaces the provider can actually serve", () => {
  // Never show a button that is going to fail.
  const rich = availableSurfaces(fullFeatured);
  assert.equal(rich.pipeline, true);
  assert.equal(rich.inboundScreenPop, true);
  assert.equal(rich.automaticWriteback, true);

  const lean = availableSurfaces(READYMODE_CAPABILITIES);
  assert.equal(lean.pipeline, false, "ReadyMode has no opportunity object");
  assert.equal(lean.inboundScreenPop, false);
  assert.equal(
    lean.automaticWriteback,
    false,
    "an overlay writes through the host's form fields, not an API",
  );
});

test("field-level write capability is respected", () => {
  assert.equal(canWrite(fullFeatured, "lead", "status"), true);
  assert.equal(canWrite(fullFeatured, "contact"), false);
  assert.equal(canWrite(READYMODE_CAPABILITIES, "note"), true);
  assert.equal(canWrite(READYMODE_CAPABILITIES, "opportunity"), false);
});

test("a provider that owns the audio path changes the integration route", () => {
  // The finding that reorganised the plan: ReadyMode places the call, so our
  // media plane cannot simply sit in the SIP path.
  assert.equal(availableSurfaces(fullFeatured).audioIntegration, "sip");
  assert.equal(
    availableSurfaces(READYMODE_CAPABILITIES).audioIntegration,
    "unknown",
    "until we know whether ReadyMode accepts our SIP trunk, the route is undecided",
  );

  assert.equal(
    availableSurfaces({
      ...READYMODE_CAPABILITIES,
      supportsCustomSipTrunk: "yes",
    }).audioIntegration,
    "sip",
  );
  assert.equal(
    availableSurfaces({
      ...READYMODE_CAPABILITIES,
      supportsCustomSipTrunk: "no",
    }).audioIntegration,
    "virtual-device",
    "no custom trunk means an agent-side audio device — a different project size",
  );
});

test("reading an uncaptured integration detail throws instead of guessing", () => {
  // A plausible-looking wrong selector is worse than a blank: it produces a
  // connector that appears to work and silently writes to the wrong field.
  assert.throws(
    () => required(READYMODE_SELECTORS.notesField, "notes field selector"),
    /not yet captured/,
  );
  assert.equal(required("#notes", "notes field selector"), "#notes");
});

test("integration readiness names its blockers instead of being an opinion", () => {
  const readiness = integrationReadiness();
  assert.equal(readiness.ready, false);
  assert.equal(readiness.audioPath, "unknown");
  assert.ok(
    readiness.blockers.some((b) => b.includes("SIP trunk")),
    "the audio path question must be listed first-class",
  );
  assert.ok(readiness.blockers.some((b) => b.includes("call-start")));
});

test("readiness clears once the details are captured", () => {
  const readiness = integrationReadiness(
    {
      agentScreenUrlPattern: "https://*.readymode.com/agent*",
      leadIdSource: { kind: "url", pattern: "/lead/(\\d+)" },
      callStartSignal: { kind: "dom_appears", selector: "#call-active" },
      callEndSignal: { kind: "dom_disappears", selector: "#call-active" },
      notesField: "#lead-notes",
      dispositionControl: "#disposition-select",
      customerPhoneField: "#lead-phone",
      customerNameField: "#lead-name",
      leadPanelInIframe: false,
    },
    { ...READYMODE_CAPABILITIES, supportsCustomSipTrunk: "yes" },
  );
  assert.equal(readiness.ready, true);
  assert.deepEqual(readiness.blockers, []);
  assert.equal(readiness.audioPath, "sip");
});

test("UNKNOWN is a distinct value, not a falsy string", () => {
  // So `if (selectors.notesField)` cannot accidentally pass on an empty string.
  assert.notEqual(UNKNOWN, "");
  assert.equal(typeof UNKNOWN, "symbol");
});

test("phone numbers are normalised once, strictly", () => {
  assert.equal(normaliseE164("(305) 555-0142"), "+13055550142");
  assert.equal(normaliseE164("+57 300 123 4567"), "+573001234567");
  assert.throws(() => normaliseE164("305-555-014"), /country code/);
  // An extension pasted into a phone field is the common case, and the error
  // should say so rather than talk about country codes.
  assert.throws(() => normaliseE164("ext. 401"), /too short|extension/);
  assert.throws(() => normaliseE164("n/a"), /no digits/);
});

test("tenantId is required on every record", () => {
  // The first of four independent layers of tenant isolation.
  const issues = validateLead({ status: "new" });
  assert.equal(issues.some((i) => i.field === "tenantId"), true);
});

test("a do-not-call flag must record why it was set", () => {
  // A DNC with no provenance cannot be defended to a regulator, and cannot be
  // safely cleared by anyone later.
  const issues = validateContact({ tenantId: "t1", doNotCall: true });
  assert.equal(issues.some((i) => i.field === "dncReason"), true);

  assert.deepEqual(
    validateContact({
      tenantId: "t1",
      doNotCall: true,
      dncReason: "customer request 2026-08-01",
    }),
    [],
  );
});

test("a stored phone that is not E.164 is a validation failure", () => {
  const issues = validateContact({ tenantId: "t1", phoneE164: "3055550142" });
  assert.equal(issues.some((i) => i.field === "phoneE164"), true);
});

test("aiScore is a probability and is range-checked", () => {
  assert.equal(
    validateLead({ tenantId: "t1", aiScore: 73 }).some((i) => i.code === "range"),
    true,
    "73 is a percentage; the field is 0..1 and mixing them silently is a real bug",
  );
  assert.deepEqual(validateLead({ tenantId: "t1", aiScore: 0.73 }), []);
});
