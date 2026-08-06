# copilot-core

The grounded copilot: the module whose exit criterion is **0 invented
answers**. Pure Python 3.11, zero dependencies.

```bash
python3 -m unittest discover -s . -p "test_*.py" -t .   # 63 tests
python3 -m eval.run                                     # the exit criterion, measured
```

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
