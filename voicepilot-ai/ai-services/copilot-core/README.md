# copilot-core

Four modules of the Intelligence Plane: the **grounded copilot** (0 invented
answers), the **compliance engine** (recall > 0.95 on critical rules),
**post-call analysis** (key-point coverage > 90% vs human QA), and the
**model gateway** (routing, failover, deadlines, versioning, cost ceiling).
Pure Python 3.11, zero dependencies.

```bash
python3 -m unittest discover -s . -p "test_*.py" -t .   # 146 tests
python3 -m eval.run                                     # the exit criterion, measured
```

They live in one directory because they share `copilot/text.py`. If retrieval
and compliance disagreed about what a word is, a phrase could be "said" for
one and not the other — and the post-call extractor asks the same question of
the same text when it checks whether a quote is really in the transcript.

All three enforce the same discipline in three different shapes: **a claim
without evidence is not representable.** The copilot needs a citation, a
compliance violation needs the words that caused it, and a post-call item
needs a verbatim span of the transcript.

---

## The rule

From [`docs/06-flujos-de-ia.md`](../../docs/06-flujos-de-ia.md) §1:

> If it is not in the company's material, the copilot does not say it.
> It prefers silence to invention.

That is not a line in a prompt. Prompts are advisory, and a model that
ignores one produces a fluent, confident, well-cited lie. It is enforced in
four layers, none of which trusts the model:

| Layer | Where | What it makes impossible |
|---|---|---|
| 1 · Schema | `types.py` | A suggestion without citations **cannot be constructed**. Not "is rejected later" — has no representation anywhere in the system |
| 2 · Retrieval | `index.py` | Nothing above threshold ⇒ **the model is never called**. A model that is not invoked cannot invent |
| 3 · Generation | `pipeline.py` | The model sees only retrieved chunks, may cite only what it was handed, and is allowed to say `NO_ANSWER` |
| 4 · Verification | `verify.py` | Every figure and every promise checked against the cited text. One failure discards the **whole** suggestion |

Layer 2 does most of the work, and it is the cheapest. Of the 200 evaluation
trials, the model is called 55 times.

## Measured

`python3 -m eval.run`, 200 trials, against a generator that **lies in two
thirds of its calls** — shifting figures, promising refunds that do not
exist, drifting into sales prose, citing the wrong chunk. Delivered
suggestions are then re-audited by a function outside the pipeline, so a bug
in the verifier shows up as a failure rather than hiding behind itself.

| | Lexical only | Hybrid |
|---|---|---|
| **Unsupported statements delivered** | **0** | **0** |
| **Cross-tenant citations** | **0** | **0** |
| Suggestions delivered | 30 | 44 |
| Grounded but off-topic | 2 (7%) | 7 (16%) |
| Guardrail overhead, p95 | 0.4 ms | 0.5 ms |

The 800 ms budget in `docs/10` is the LLM call. This module adds under a
millisecond to it.

## Four findings

**Vector search is not an optimisation — the module does not work without
it.** Lexical retrieval answered **0 of 40** paraphrased objections; hybrid
answered 12. Those are sentences like *"that's a lot more than I wanted to
spend"* and *"no me alcanza el presupuesto"* — which is how customers
actually object. The manual says "It is too expensive"; nobody says that out
loud. `docs/06` §3 lists vector search alongside BM25 as if they were peers.
They are not: BM25 covers the phrasings that were written down, and the
embedding model covers the ones people use. **A real embedding model is a
Fase-1 blocker, not a Fase-2 improvement.**

**Silence has a cost, and it is now measured.** A copilot that answers
nothing hallucinates nothing and is worth nothing, so the evaluation grades
usefulness in the same run: how many answerable questions were reached, and
how many were lost. Without both numbers, "0 hallucinations" is trivially
achievable by returning nothing.

**Grounded is not the same as relevant.** 16% of what the hybrid
configuration delivered was supported by its citations and was not an answer
to the question asked — a warranty paragraph in reply to a question about
resale value. The guarantee this module makes is about *support*, and it
holds absolutely. Relevance is the cross-encoder's job, and until there is
one, this number is the honest size of the gap.

**Three defects were in the scoring, and each one was found by writing a
sentence the way a person says it.** Query terms absent from the corpus were
receiving maximum IDF and sinking legitimate matches. Then dropping them
entirely let *"Can I pay in Bitcoin?"* score a perfect 1.0, because the
question collapsed to `pay`. Then the topic-coverage check that fixed *that*
broke on `that's`, which the tokeniser was splitting into `that` + `s` — and
the junk `s` counted as a content word. All three are in the code with the
sentence that exposed them.

## What the tests protect

Not coverage — specific failure modes, each one a sentence that costs money:

| Test | What it prevents |
|---|---|
| `the model is never called when nothing is retrieved` | The entire class of hallucination, at the cheapest possible point |
| `an invented figure is caught` | "36 months" when the manual says 24 — the agent repeats it and the company is committed |
| `an invented guarantee is caught` | `docs/06` §4's own example: promising a refund that does not exist |
| `verification is against what was cited, not what was retrieved` | A citation that points the agent at material not containing the number they are about to say |
| `citing a chunk it was never given is refused` | Reasoning from somewhere we cannot audit — and the shape a cross-tenant leak would take |
| `another tenant's material is never retrieved` | One customer's pricing quoted to another customer's prospect |
| `a superseded kb_version is not retrieved` | A March call audited against December's manual |
| `the whole suggestion is discarded, not the bad sentence` | An agent reading a patched rebuttal aloud and stopping mid-argument |
| `headings are hard boundaries` | Objection 5.3's answer given to objection 5.4 |
| `a prohibition stays with what it forbids` | The copilot suggesting the one sentence the manual bans |
| `mode B asks for Spanish` | Making a Spanish-speaking agent translate in their head — the exact work we sell them out of |
| `negation does not flip a buying signal into an objection` | Interrupting *"that's not too expensive"* with a price rebuttal, and losing a won deal |
| `a refusal followed by an objection still fires` | Silence on "No, that's too expensive" — the negation belongs to the previous clause |
| `the deterministic layer refuses before the model is consulted` | A learned verifier overruling a rule a lawyer wrote |

## Boundaries

Honest about what is not here, because a stand-in presented as a solution is
the same failure as a hallucination:

- **No embedding model.** `Index` takes one through the `Embedder` protocol
  and reports `vector_search_enabled` rather than degrading quietly. The
  evaluation's `ConceptEmbedder` is a measuring instrument, confined to
  `eval/`, and must never be imported by `copilot/`.
- **No cross-encoder.** `_relevance()` is IDF-weighted coverage combined with
  cosine — a bounded, explainable floor. The cross-encoder keeps the same
  contract, a number in [0, 1], so `DEFAULT_THRESHOLD = 0.62` survives the
  upgrade.
- **No NLI verifier.** `DeterministicVerifier` is layer one of two, in the
  same shape as the compliance engine in `docs/06` §4: the rule a lawyer can
  read runs first and its refusal is final. The learned layer chains behind
  it through `all_of()`.
- **No LLM.** Injected through `Generator`, for the same reason the Rust
  engine injects its clock — a dependency you cannot replace is one you
  cannot test against.
- **In-memory index.** Postgres + pgvector in production. What is settled
  here is the scoping rule, the fusion and the bounded score; storage does
  not touch any of them.
- **Document frequency is global across tenants.** It affects ranking
  weights only, never which chunks are visible — but it is a shared statistic
  and the Postgres implementation should compute it per knowledge base.

## Contents

| Module | What it does |
|---|---|
| `types.py` | The entity model, and layer 1 in its constructors |
| `text.py` | One tokeniser, shared by retrieval and verification so they cannot disagree about what a word is |
| `chunking.py` | Heading-aware splitting; the heading path is the content |
| `index.py` | Scoped hybrid retrieval, RRF fusion, the threshold gate |
| `triggers.py` | When the copilot is allowed to interrupt a live conversation |
| `verify.py` | Layer 4: figures, promises, drift |
| `pipeline.py` | The single path text can take to reach an agent |
| `eval/` | The exit criterion, as a program |
| `compliance/rules.py` | The rule model, and the severity levels that decide whether any of it works |
| `compliance/engine.py` | Two layers, a clock, and the hard noise budget |
| `compliance/backtest.py` | What a rule would have done, before it is allowed to do anything |
| `postcall/analysis.py` | The record, and the rule that makes it worth reading |
| `postcall/extract.py` | Anchoring every extraction to the moment it happened |
| `gateway/gateway.py` | One door for every model call — and the deadline that belongs to the task |

---

# The compliance engine

`docs/06` §4. Four rule kinds — `must_say`, `must_say_before`,
`must_not_say`, `conditional` — matched deterministically first, with a
learned classifier as the safety net. Same two-layer shape as the copilot's
verifier, for the same reason: **a rule a lawyer can read runs first, and its
refusal is final.**

## The asymmetry that makes the safety net safe

Not in the spec, and the most important decision in the module:

- For **must_say**, the model may only *excuse* a miss — the agent covered
  the obligation in their own words and the rules did not see it.
- For **must_not_say**, the model may only *add* a violation. It can never
  suppress one the rules found.

So a model failure degrades in exactly one direction: more alerts, never
fewer, on the rules that carry legal exposure. There is a test where the
classifier claims everything is covered and nothing is ever a violation, and
the deterministic violation still reaches the agent.

## The number that decides whether any of this protects anyone

`docs/06` §4 says it plainly: *a badly designed alert trains the agent to
ignore alerts, and then the whole module is worth zero.* So there is a hard
cap of **3 live alerts per call**, enforced as a constant rather than a
setting — the first thing a customer asks for after a month is more alerts,
and granting it is how the panel becomes wallpaper.

`INFO` severity never appears during a call at all. Only in the report.

**And the budget is a ranking, not a queue.** The first implementation spent
it in arrival order: three warnings early in a call filled the panel, and the
critical legal alert at second 200 was silently deferred — the exact alert a
regulator would ask about, hidden behind three notes about script
completeness. Deferral is now decided at render time, so a later, more
serious violation can push an earlier one off.

## Before a rule is allowed to do anything

`POST /compliance-rules/{id}/test` in the spec; `backtest()` here. It replays
history **twice** — without the rule, then with it — because the number that
matters is not how often a rule fires. It is what the rule *costs*: the panel
holds three, so a fourth means an agent stops seeing something they used to
see. A single-rule test cannot show that.

The verdict reports **every** concern rather than the loudest one. A rule can
be both too noisy and displacing a critical alert, and those are different
fixes.

## What the compliance tests protect

| Test | What it prevents |
|---|---|
| `a late critical alert still reaches the agent` | A legal alert suppressed by three earlier warnings |
| `the model can never suppress a violation the rules found` | A learned component talking the system out of a fine |
| `a deadline fires during silence` | Never reporting the identity verification that never happened — the most common critical rule in this industry |
| `a phrase inside a larger sentence matches` | Punctuation deciding compliance: `recorded.` failing to satisfy a rule looking for `recorded` |
| `word order is part of the obligation` | "we do not guarantee a refund" satisfying a rule looking for "guarantee a refund" |
| `an info rule never appears during the call` | Interrupting an agent mid-sentence with an improvement tip, on the panel that also carries the legal alerts |
| `the same rule does not fire twice in one call` | The repetition that trains agents to stop looking |
| `an armed obligation still fires if the call ends first` | Hanging up as a way to satisfy a disclosure |
| `price and terms in the same breath is the normal case` | Punishing the correct behaviour |
| `no history is never a green light` | Activating a rule blind |
| `the cost of a new rule is what it displaces` | Growing a rule set without noticing the panel stopped working |
| `a critical rule must tell the agent what to do` | A red band with a sound and no instruction, mid-sentence |


---

# Post-call analysis

`docs/06` §6. One pass of the highest-quality model over the whole
transcript — no latency pressure here, which is exactly why it is the most
dangerous place in the system for a hallucination. Nobody listens back to the
recording. The supervisor reads the summary, believes it, and coaches from
it: a fabricated objection becomes a training priority, a fabricated
commitment becomes a promise the company never made.

## One constraint, two guarantees

The spec asks for `at_ms` on every extracted element so a supervisor can
click "price objection" and jump to second 145. Made structural — an item
**cannot be constructed** without a verbatim span of the transcript behind it
— the same field also makes invention impossible: a fabricated event has no
quote, a quote that is not in the transcript resolves to no moment, and an
item with no moment does not exist.

Measured on the test call, against a summariser that describes a call that
did not happen: **2 of 3 invented items dropped, 0 true items lost.** The
drops are counted rather than hidden — a rising count is the earliest signal
the model has drifted.

## Three smaller decisions

**Talk metrics are arithmetic, never a model.** A talk ratio that is
occasionally invented is worse than none, because coaching decisions get made
from it. Turn duration is capped so one gap in the transcript becomes silence
rather than a ninety-second monologue.

**Compliance is carried over, not recomputed.** The violations come from the
live engine unchanged. "The panel said one thing and the report says another"
destroys trust in both faster than either being wrong alone.

**The disposition is a proposal.** `confirmed_by_agent` lives on the type
rather than in the UI, so no code path can write an unconfirmed outcome by
forgetting a check. An auto-applied disposition is how a pipeline fills with
outcomes nobody chose.

| Test | What it prevents |
|---|---|
| `an event that never happened is dropped` | A fabricated commitment becoming a promise the company must keep |
| `what was actually said still survives` | Paying for the guarantee in usefulness |
| `a short quote is not a quote` | Anchoring an invented objection to the word "price" |
| `a summary anchored to nothing is refused outright` | Writing fiction into a customer's CRM |
| `an unconfirmed disposition is never written` | A forecast built on outcomes nobody chose |
| `a gap in the transcript becomes silence not a monologue` | A talk ratio that makes coaching decisions meaningless |
| `the note carries its anchors into the CRM` | A summary a supervisor cannot verify from inside Salesforce |
| `the writes are canonical, not CRM-specific` | This module learning which CRM it is talking to |


---

# The model gateway

`docs/06` §7: **the code is never coupled to a provider.** Prices and the
capability frontier move every quarter; changing models must be a
configuration change, not a code change.

Every learned component here is already injected behind a protocol, which
makes it replaceable *in a test*. This makes it replaceable **in production,
at 3am, without a deploy** — a different problem, needing failover,
deadlines, versioning and a cost ceiling.

## The deadline belongs to the task, not to the attempt

The decision the module is shaped around, and the opposite of what a retry
library does by default.

The copilot gets 800 ms because past that the agent has carried on speaking
and the suggestion arrives too late to use — worse than silence, since they
read it and lose their place. A failover that grants the backup a *fresh*
800 ms turns that into 1,600 ms and delivers a perfectly good suggestion into
a conversation that moved on two sentences ago.

So a slow primary does not get to spend the backup's time, and a late answer
is discarded rather than delivered. Returning nothing on time is a supported
outcome everywhere in this system: the copilot stays silent, compliance keeps
its deterministic verdict, the post-call summary runs later.

## Four smaller rules

**A provider without a version cannot be registered.** Six weeks after a
quality regression, the answer is in which model produced the output.

**The cost ceiling refuses, it does not warn.** A per-tenant runaway is
otherwise discovered on an invoice. Better to lose a feature for one tenant
for an hour than the margin on that tenant for a quarter — and an
unaffordable primary falls through to a cheaper backup rather than failing.

**The cache is scoped to one call.** The same question from a different
customer is a different question; a suggestion cached across calls would be
a data leak wearing a performance optimisation's clothes.

**A single-provider task is reported as such.** `has_failover()` puts it on a
dashboard instead of leaving it to be discovered during an incident.
