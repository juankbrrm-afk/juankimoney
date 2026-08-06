import { test } from "node:test";
import assert from "node:assert/strict";

import {
  AUTO_WRITE_CONFIDENCE,
  bindFromAgent,
  detect,
  hostMatches,
  matchUrlPattern,
  mayAutoWrite,
  type BindingConfig,
  type PageView,
} from "../src/binding.ts";
import {
  UNIVERSAL_BINDING_CONFIG,
  UNIVERSAL_L1_CAPABILITIES,
  onboardingChecklist,
} from "../src/providers/universal.ts";
import { availableSurfaces } from "../src/adapter.ts";
import {
  writeThroughForm,
  type FormField,
  type FormWriter,
} from "../src/overlay.ts";

/** A page we do not own, faked. */
function page(url: string, dom: Record<string, string> = {}): PageView {
  return {
    url,
    attribute: (selector, name) => dom[`${selector}[${name}]`] ?? null,
    read: (selector, from) => dom[`${selector}:${from}`] ?? null,
  };
}

const SALESFORCE: BindingConfig = {
  provider: "salesforce",
  version: 7,
  rules: [
    {
      entity: "lead",
      hostSuffix: "salesforce.com",
      urlPattern: "/lightning/r/Lead/:id/view",
      attribute: { selector: "[data-record-id]", name: "data-record-id" },
    },
  ],
};

// A CRM somebody's cousin wrote. No API, no data attributes, an id printed
// on the page. This is the case the whole tier exists for.
const HOMEMADE: BindingConfig = {
  provider: "acme-crm",
  version: 1,
  rules: [
    {
      entity: "lead",
      hostSuffix: "acme-leads.internal",
      selector: { selector: "#lead_number", from: "text" },
    },
  ],
};

test("a URL pattern binds the record", () => {
  const d = detect(
    page("https://acme.lightning.force.salesforce.com/lightning/r/Lead/00Q5g00000AbCdE/view"),
    SALESFORCE,
  );
  assert.equal(d.kind, "bound");
  if (d.kind !== "bound") return;
  assert.equal(d.externalId, "00Q5g00000AbCdE");
  assert.equal(d.rung, "url");
  assert.equal(d.configVersion, 7);
});

test("a lookalike domain does not activate the extension", () => {
  // endsWith("salesforce.com") also matches notsalesforce.com — which is a
  // way to make the extension bind, and behave, on a domain the tenant
  // never configured.
  assert.equal(hostMatches("evil-salesforce.com", "salesforce.com"), false);
  assert.equal(hostMatches("acme.salesforce.com", "salesforce.com"), true);
  assert.equal(hostMatches("salesforce.com", "salesforce.com"), true);
});

test("a URL with the wrong shape does not bind", () => {
  assert.equal(
    matchUrlPattern(
      "https://acme.salesforce.com/lightning/r/Account/001xx/view",
      "/lightning/r/Lead/:id/view",
      "salesforce.com",
    ),
    null,
  );
});

test("a malformed URL is refused rather than thrown on", () => {
  assert.equal(matchUrlPattern("not a url", "/x/:id", undefined), null);
});

test("two rungs agreeing corroborate rather than compete", () => {
  const d = detect(
    page("https://acme.salesforce.com/lightning/r/Lead/00Q5g/view", {
      "[data-record-id][data-record-id]": "00Q5g",
    }),
    SALESFORCE,
  );
  assert.equal(d.kind, "bound");
  if (d.kind !== "bound") return;
  assert.equal(d.rung, "url");
  assert.deepEqual(d.corroboratedBy, ["attribute"]);
});

test("two rungs disagreeing is refused, never voted on", () => {
  // The page has a stale fragment: the header shows the lead the agent just
  // left. Picking a winner here writes the call note onto the wrong customer.
  const d = detect(
    page("https://acme.salesforce.com/lightning/r/Lead/00Q5g/view", {
      "[data-record-id][data-record-id]": "00Q9z",
    }),
    SALESFORCE,
  );
  assert.equal(d.kind, "ambiguous");
  if (d.kind !== "ambiguous") return;
  assert.equal(d.candidates.length, 2);
});

test("an ambiguous page can never drive an automatic write", () => {
  const d = detect(
    page("https://acme.salesforce.com/lightning/r/Lead/00Q5g/view", {
      "[data-record-id][data-record-id]": "00Q9z",
    }),
    SALESFORCE,
  );
  assert.equal(mayAutoWrite(d), false);
});

test("a CSS selector binds but is not trusted enough to write", () => {
  // Reading an id out of rendered text is a guess about layout. It is good
  // enough to point the copilot at a record, and not good enough to write to
  // a customer's CRM without the agent confirming.
  const d = detect(
    page("https://crm.acme-leads.internal/lead.php?id=4471", {
      "#lead_number:text": "4471",
    }),
    HOMEMADE,
  );
  assert.equal(d.kind, "bound");
  if (d.kind !== "bound") return;
  assert.equal(d.rung, "selector");
  assert.ok(d.confidence < AUTO_WRITE_CONFIDENCE);
  assert.equal(mayAutoWrite(d), false);
});

test("a stale server config cannot take down the panel", () => {
  const exploding: PageView = {
    url: "https://acme.salesforce.com/lightning/r/Lead/00Q5g/view",
    attribute: () => {
      throw new Error("SyntaxError: bad selector");
    },
    read: () => {
      throw new Error("SyntaxError: bad selector");
    },
  };
  const d = detect(exploding, SALESFORCE);
  // The URL rung still works, so the agent keeps their copilot.
  assert.equal(d.kind, "bound");
});

test("no rule matching asks the agent instead of guessing", () => {
  const d = detect(page("https://crm.unknown.example/record/9"), SALESFORCE);
  assert.equal(d.kind, "none");
});

test("the agent's answer is ground truth and may write", () => {
  const d = bindFromAgent("lead", " 00Q5g ", 7);
  assert.equal(d.kind, "bound");
  if (d.kind !== "bound") return;
  assert.equal(d.externalId, "00Q5g");
  assert.equal(mayAutoWrite(d), true);
});

test("the config version travels with the binding", () => {
  // A binding that later looks wrong has to be traceable to the selector
  // config that produced it. Without this, "why did it write to the wrong
  // lead in March" is unanswerable.
  const d = detect(
    page("https://acme.salesforce.com/lightning/r/Lead/00Q5g/view"),
    SALESFORCE,
  );
  assert.equal(d.configVersion, 7);
});

// ---------------------------------------------------------------------------
// The universal tier: a CRM nobody has ever integrated with
// ---------------------------------------------------------------------------

test("an unknown CRM starts by asking the agent, and that works", () => {
  const d = detect(page("https://whatever.example/leads/9"), UNIVERSAL_BINDING_CONFIG);
  assert.equal(d.kind, "none");
  const bound = bindFromAgent("lead", "9", UNIVERSAL_BINDING_CONFIG.version);
  assert.equal(mayAutoWrite(bound), true);
});

test("the universal adapter renders no surface that would fail", () => {
  const s = availableSurfaces(UNIVERSAL_L1_CAPABILITIES);
  // No opportunity object, so no pipeline view. No task object, so no task
  // panel. No phone lookup, so no screen pop. Each of those absences is a
  // control that never renders rather than a control that errors in front of
  // the customer on the feature they were most excited about.
  assert.equal(s.pipeline, false);
  assert.equal(s.tasks, false);
  assert.equal(s.inboundScreenPop, false);
  // And no silent API writeback — L1 goes through the host form, verified,
  // with the agent pressing save.
  assert.equal(s.automaticWriteback, false);
});

test("an unknown CRM's audio path stays unknown, not assumed", () => {
  // docs/13: whether the dialer owns the audio path is the difference between
  // a weekend and a quarter. Defaulting it to the comfortable answer is how
  // that gets discovered after the contract is signed.
  const s = availableSurfaces({
    ...UNIVERSAL_L1_CAPABILITIES,
    ownsAudioPath: true,
  });
  assert.equal(s.audioIntegration, "unknown");
});

test("onboarding a new CRM is a checklist, not an opinion", () => {
  const todo = onboardingChecklist(UNIVERSAL_BINDING_CONFIG);
  assert.ok(todo.length > 0);
  assert.ok(todo.some((t) => t.includes("URL pattern")));

  const done = onboardingChecklist({
    provider: "acme",
    version: 2,
    rules: [
      {
        entity: "lead",
        hostSuffix: "acme-leads.internal",
        urlPattern: "/lead/:id",
        attribute: { selector: "[data-id]", name: "data-id" },
      },
    ],
  });
  assert.deepEqual(done, []);
});

// ---------------------------------------------------------------------------
// L1 writeback: filling somebody else's form and checking it took
// ---------------------------------------------------------------------------

/** A host form that behaves like host forms do. */
function form(opts: {
  fields: Record<string, string>;
  readOnly?: string[];
  missing?: string[];
  /** The CRM rewriting what we wrote, as they all do. */
  transform?: (selector: string, value: string) => string;
  rejects?: string[];
}): FormWriter {
  const state = { ...opts.fields };
  return {
    isEditable(selector) {
      if (opts.missing?.includes(selector)) throw new Error("no such element");
      return !opts.readOnly?.includes(selector);
    },
    fill(selector, value) {
      if (opts.rejects?.includes(selector)) throw new Error("field is disabled");
      state[selector] = opts.transform ? opts.transform(selector, value) : value;
    },
    read(selector) {
      return state[selector] ?? null;
    },
  };
}

test("a verified write is the only thing reported as success", () => {
  const w = form({ fields: { "#note": "" } });
  const r = writeThroughForm(w, [{ selector: "#note", value: "Interested, sending proposal." }]);
  assert.equal(r.ok, true);
  assert.equal(r.outcomes[0]!.status, "written");
});

test("a framework that swallows the value is caught, not reported as written", () => {
  // React ignores a programmatic .value= without an input event. The field
  // looks filled, the framework's state is empty, the agent presses save,
  // and nothing is saved. This is the single most common L1 failure.
  const w = form({ fields: { "#note": "" }, transform: () => "" });
  const r = writeThroughForm(w, [{ selector: "#note", value: "Interested." }]);
  assert.equal(r.ok, false);
  assert.equal(r.outcomes[0]!.status, "altered");
});

test("a CRM reformatting a phone number is not a failure", () => {
  const w = form({
    fields: { "#phone": "" },
    transform: (_s, v) => `(${v.slice(0, 3)}) ${v.slice(3, 6)}-${v.slice(6)}`,
  });
  const r = writeThroughForm(w, [
    { selector: "#phone", value: "3055550142", tolerate: "digits" },
  ]);
  assert.equal(r.ok, true, r.summary);
});

test("a truncated note is flagged, with what survived", () => {
  // The end of a summary is where the commitment lives. A note cut to fit a
  // column loses exactly the part that mattered.
  const long = "Customer interested. Objected on price, resolved with 24-month plan. " +
    "Promised written proposal by 6pm and a follow-up call Friday.";
  const w = form({ fields: { "#note": "" }, transform: (_s, v) => v.slice(0, 40) });
  const r = writeThroughForm(w, [{ selector: "#note", value: long }]);
  const o = r.outcomes[0]!;
  assert.equal(o.status, "altered");
  if (o.status !== "altered") return;
  assert.equal(o.truncated, true);
  assert.ok(o.kept.length < long.length);
});

test("one bad field does not lose the rest of the write", () => {
  const w = form({
    fields: { "#note": "", "#disposition": "", "#stage": "" },
    readOnly: ["#stage"],
  });
  const fields: FormField[] = [
    { selector: "#note", value: "Called, interested." },
    { selector: "#disposition", value: "Interested" },
    { selector: "#stage", value: "Proposal" },
  ];
  const r = writeThroughForm(w, fields);
  assert.equal(r.ok, false);
  assert.equal(r.outcomes.filter((o) => o.status === "written").length, 2);
  assert.equal(r.outcomes[2]!.status, "read_only");
});

test("read-only and missing are different problems for different people", () => {
  // read_only is the customer's admin. missing is our stale selector config.
  const w = form({ fields: { "#a": "", "#b": "" }, readOnly: ["#a"], missing: ["#b"] });
  const r = writeThroughForm(w, [
    { selector: "#a", value: "x" },
    { selector: "#b", value: "y" },
  ]);
  assert.equal(r.outcomes[0]!.status, "read_only");
  assert.equal(r.outcomes[1]!.status, "missing");
});

test("a field that throws on fill is reported with the reason", () => {
  const w = form({ fields: { "#note": "" }, rejects: ["#note"] });
  const r = writeThroughForm(w, [{ selector: "#note", value: "x" }]);
  const o = r.outcomes[0]!;
  assert.equal(o.status, "rejected");
  if (o.status !== "rejected") return;
  assert.match(o.reason, /disabled/);
});

test("whitespace and case differences are tolerated only when declared", () => {
  const w = form({ fields: { "#s": "" }, transform: (_s, v) => `  ${v.toUpperCase()} ` });
  assert.equal(
    writeThroughForm(w, [{ selector: "#s", value: "Interested" }]).ok,
    false,
    "the default is exact — an undeclared rewrite must surface",
  );
  assert.equal(
    writeThroughForm(w, [{ selector: "#s", value: "Interested", tolerate: "loose" }]).ok,
    true,
  );
});

test("an empty read-back never passes a digits comparison", () => {
  // digits("") === digits("") would otherwise call a lost write successful.
  const w = form({ fields: { "#phone": "" }, transform: () => "" });
  const r = writeThroughForm(w, [
    { selector: "#phone", value: "3055550142", tolerate: "digits" },
  ]);
  assert.equal(r.ok, false);
});

test("the summary names what needs a human", () => {
  const w = form({ fields: { "#note": "", "#stage": "" }, readOnly: ["#stage"] });
  const r = writeThroughForm(w, [
    { selector: "#note", value: "ok" },
    { selector: "#stage", value: "Proposal" },
  ]);
  assert.match(r.summary, /#stage/);
  assert.match(r.summary, /1\/2/);
});
