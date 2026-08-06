# @voicepilot/crm-core

The canonical CRM model, the adapter contract, the field-mapping engine and the
idempotent sync queue. Zero dependencies.

```bash
npm test          # 67 tests, node:test, no install required
npm run typecheck # tsc --noEmit, strict
```

Runs on Node 22's native TypeScript type stripping — no build step, no bundler,
no `node_modules`.

---

## Why this exists before the connectors

`docs/07-flujo-crm.md` names the failure mode that sinks products which "also
come with a CRM": two data models, two sets of business rules, two places to fix
every bug, and features that exist in one mode and not the other.

So there is **one** canonical model. The native CRM is its reference
implementation; every connector is a translator between it and the outside
world. Assignment, scoring, post-call writeback and reporting all operate on
these types and never learn which mode the tenant is in.

## Contents

| Module | What it does |
|---|---|
| `canonical.ts` | The entity model from `docs/03`, plus strict validation |
| `adapter.ts` | The `CrmAdapter` contract and — the important part — `AdapterCapabilities` |
| `mapping.ts` | Declarative field mapping with transforms, validation and dry run |
| `sync-queue.ts` | Idempotent writes, bounded retries, dead-letter queue |
| `binding.ts` | **Which record is the agent looking at?** The detection cascade that makes L1 work on a CRM nobody has integrated with |
| `overlay.ts` | L1 writeback: fill the host CRM's own form, then verify the value actually landed |
| `providers/readymode.ts` | First integration target. See `docs/13` |
| `providers/universal.ts` | The adapter for a CRM we have never seen. This is what "works with any CRM" means concretely |

## Four decisions worth knowing about

**Capabilities are declared, not assumed.** CRMs are not interchangeable — some
have no "call" object, some forbid custom fields, some cap you at a few hundred
API calls a day. A connector layer that pretends otherwise fails at runtime, in
front of the customer, on the feature they were most excited about. Every
adapter declares what it can do and `availableSurfaces()` drives the UI from it.
If a CRM has no opportunity object, the pipeline view does not render for that
tenant. **We never show a button that is going to fail.**

**Transforms are data, never code.** A mapping that could carry arbitrary code
would be a remote execution vector in our own process, configured by whoever can
reach the integrations screen. Transforms are a closed tagged union, and an
unrecognised tag is refused rather than evaluated — there is a test for exactly
that.

**The idempotency key ignores time and payload.** It is derived from what the
operation *is*: connection, entity, operation, internal id. A retry carrying a
slightly edited payload must produce the same key, or "retry" silently means
"create another one" — which is how a customer's pipeline ends up with three
copies of the same note.

**Phone numbers are normalised once, strictly, and ambiguity is refused.**
`+1 305 555 0142`, `(305) 555-0142` and `13055550142` are one number to a human
and three different keys to a database. Anything that cannot be normalised
confidently throws rather than being guessed at — guessing is how a US campaign
dials Colombia at scale, and how a DNC check silently misses.

## How "works with any CRM" is actually true

`docs/07` §2 tiers the effort: L3 for Salesforce and HubSpot, L2 for Zoho and
Pipedrive, **L1 for everything else** — and everything else is most of this
market, including the in-house systems with no API at all. L3 on eight CRMs
is a permanent team maintaining somebody else's APIs. L1 covers 100% of the
market for 5% of the effort.

L1 rests on two questions, and both are here.

**Which record is open?** `docs/07` §6 gives the cascade — URL pattern, then
`data-*` attributes, then server-supplied CSS selectors, then ask the agent.
The cascade is the easy part. The design decision is **what happens when two
rungs disagree**: nothing is voted on, because a wrong answer here writes a
call note onto a different customer's record and nobody notices for weeks.
Conflicting evidence produces a refusal and a one-click question to the
agent, who can see the screen.

Confidence is per rung, and it gates writes separately from display. A CSS
selector reading rendered text is good enough to point the copilot at a
record and **not** good enough to write to a customer's CRM unattended. The
asymmetry is the point: a wrong suggestion wastes a suggestion; a wrong write
corrupts a pipeline.

**Did the write land?** `docs/07` §6 requires it be verified before the
operation is marked successful, and the reasons are all in `overlay.ts`:
React ignores a programmatic `.value =` without an input event, so the field
looks filled while the framework's state is empty; the CRM reformats
`3055550142` into `(305) 555-0142`; the CRM truncates a 900-character summary
to 500 and cuts off exactly the end, where the follow-up commitment lives.
Reporting any of those as "written" is how a customer finds out a month later
that a third of their call notes are missing. So every field gets a verdict,
and only `written` is success.

## What the tests are actually protecting

Not coverage. Specific failure modes that cost money:

| Test | What it prevents |
|---|---|
| `an unmapped enum throws rather than writing the raw value through` | Writing `sale_closed` into a CRM expecting `Closed Won` — garbage nobody notices until the forecast is wrong |
| `a failing field does not fail the whole write` | Losing an entire call note because one custom field was misconfigured |
| `two mappings writing the same external field are rejected` | A bug whose symptom, months later, is "sometimes the note is wrong" |
| `an unknown transform type is refused, not evaluated` | The integrations screen becoming a code execution vector |
| `enqueueing the same write twice does not create two operations` | Duplicated notes and a corrupted pipeline after a network blip |
| `a permanent failure is buried immediately` | Four hours and a rate-limit budget spent reaching the same 400 |
| `rate limiting backs off harder than an ordinary error` | Turning a temporary throttle into a sustained one |
| `jitter spreads retries` | A thousand failed operations retrying in lockstep against a system already unwell |
| `reviving a dead operation keeps its idempotency key` | A manual retry creating a duplicate of a write that partially landed |
| `a do-not-call flag must record why it was set` | A DNC that cannot be defended to a regulator or safely cleared |
| `aiScore is a probability and is range-checked` | Silently mixing `73` and `0.73` |
| `phone normalisation refuses ambiguous numbers` | Dialling the wrong country |
| `two rungs disagreeing is refused, never voted on` | A call note written onto a different customer's record |
| `a lookalike domain does not activate the extension` | `endsWith("salesforce.com")` also matching `evil-salesforce.com` |
| `a CSS selector binds but is not trusted enough to write` | Layout-guessing driving an unattended write |
| `a stale server config cannot take down the panel` | A bad selector killing the copilot mid-call |
| `a framework that swallows the value is caught` | The most common L1 failure: nothing saved, reported as saved |
| `a CRM reformatting a phone number is not a failure` | Retrying forever against a write that already succeeded |
| `a truncated note is flagged, with what survived` | Losing the end of a summary — where the commitment is |
| `read-only and missing are different problems` | Sending a stale-config bug to the customer's admin |
| `an unknown CRM's audio path stays unknown, not assumed` | Discovering ReadyMode's problem after the contract is signed |

## ReadyMode

The first target, and the one that changed the plan. `providers/readymode.ts`
is a **capability declaration, not a working connector** — it was written
without access to a live instance, and every detail that depends on their real
API, DOM or field names is `UNKNOWN` rather than guessed.

That is deliberate. A plausible-looking wrong selector is worse than a blank: it
produces a connector that appears to work and silently writes to the wrong
field. `required()` throws on an uncaptured value instead of proceeding, and
`integrationReadiness()` returns the specific list of what is still missing —
so "are we ready to build this?" is a function call rather than an opinion.

The finding that matters most is encoded as a capability flag:

```ts
ownsAudioPath: true,
supportsCustomSipTrunk: "unknown",
```

ReadyMode places the call, so our media plane cannot simply sit in the SIP path.
Whether it accepts a customer-supplied trunk decides between the architecture we
already built and a signed audio driver on every agent workstation — the
difference between a weekend and a quarter. `docs/13-integracion-readymode.md`
§6 says exactly how to find out.
