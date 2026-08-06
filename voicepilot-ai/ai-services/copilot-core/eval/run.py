"""The exit criterion for module 1.6, as a program you can run.

`docs/10-roadmap.md` sets it: **0 hallucinations on a set of 200 objections,
p95 < 800 ms.** An exit criterion that is an opinion is not a criterion, so
this prints the number.

    python3 -m eval.run

The generator here is deliberately unreliable — it is a population of model
behaviours, some faithful, most not, drawn from the ways real language models
fail on this task: shifting a figure, inventing a promise, drifting into
sales prose, citing the wrong chunk, answering a question the corpus does not
cover. Each trial records what the pipeline *would have shown an agent*, and
every delivered suggestion is then independently re-checked against the
company's material by a function that is not part of the pipeline.

That last part matters. Grading the pipeline with its own verifier would only
prove it is self-consistent. The audit below re-derives support from the raw
corpus, so a bug in the verifier shows up as a failed audit rather than
hiding behind itself.
"""

from __future__ import annotations

import random
import time
from dataclasses import dataclass

from copilot import (
    Answered,
    CallContext,
    Chunk,
    Declined,
    Draft,
    Index,
    Mode,
    Refusal,
)
from copilot.pipeline import Copilot
from copilot.text import numeric_facts
from copilot.verify import COMMITMENT_TERMS, DeterministicVerifier

from .corpus import CORPUS, QUERIES, QueryKind
from .embedder import ConceptEmbedder


@dataclass
class Trial:
    query: str
    kind: QueryKind
    delivered: bool
    reason: Refusal | None
    text: str
    cited: tuple[str, ...]
    latency_ms: float


class PopulationGenerator:
    """A model that behaves like models behave: mostly wrong, plausibly.

    Faithful only a third of the time, on purpose. A benchmark against a
    well-behaved generator measures nothing — the guarantee exists precisely
    for the other two thirds.
    """

    def __init__(self, seed: int) -> None:
        self.rng = random.Random(seed)
        self.calls = 0

    def generate(self, *, question, chunks, language, context) -> Draft:
        self.calls += 1
        source = chunks[0]
        roll = self.rng.random()

        if roll < 0.34:
            # Faithful: quote the material back, trimmed to the word budget.
            return Draft(" ".join(source.text.split()[:40]), (source.id,))

        if roll < 0.48:
            # Shift a figure. The most common and most expensive failure.
            words = source.text.split()[:40]
            out = []
            for w in words:
                digits = "".join(c for c in w if c.isdigit())
                if digits and self.rng.random() < 0.5:
                    w = w.replace(digits, str(int(digits) + 12), 1)
                out.append(w)
            return Draft(" ".join(out), (source.id,))

        if roll < 0.60:
            return Draft(
                "I guarantee a full refund at any time if you are not "
                "completely satisfied.",
                (source.id,),
            )

        if roll < 0.72:
            return Draft(
                "Most families in your neighbourhood decide on the spot once "
                "they realise how quickly it pays for itself.",
                (source.id,),
            )

        if roll < 0.84 and len(chunks) > 1:
            # Say something true of chunk 2 while citing chunk 1.
            return Draft(" ".join(chunks[1].text.split()[:35]), (source.id,))

        if roll < 0.92:
            return Draft("We can approve a 40 percent discount today.", (source.id,))

        return Draft("", (), declined=True)


def audit(text: str, chunks: list[Chunk], tenant_id: str) -> str | None:
    """Independent grader. Returns the violation, or None if supported.

    Not the pipeline's verifier. This one is given the *whole* tenant corpus
    and still asks whether the delivered sentence is supported by the chunks
    that were actually cited — the strictest reading, and the one an auditor
    would take.
    """
    if not chunks:
        return "delivered with no citation"

    # The most serious violation there is, checked first and separately.
    # Everything else on this list costs money; this one ends the company.
    for c in chunks:
        if c.tenant_id != tenant_id:
            return f"CROSS-TENANT: cited {c.tenant_id}'s material to {tenant_id}"

    context = " ".join(c.text for c in chunks)
    invented = numeric_facts(text) - numeric_facts(context)
    if invented:
        return f"figures not in cited material: {', '.join(sorted(invented))}"
    lowered = text.lower()
    for term in COMMITMENT_TERMS:
        if term in lowered and term not in context.lower():
            return f"promise not in cited material: {term}"
    return None


def run(*, embedder) -> tuple[list[Trial], dict[str, Chunk], int]:
    index = Index(embedder=embedder)
    by_id: dict[str, Chunk] = {}
    for chunks in CORPUS.values():
        index.add(chunks)
        for c in chunks:
            by_id[c.id] = c

    # The same seed for both configurations, so the model misbehaves in
    # exactly the same way in each and the difference in the table is
    # retrieval and nothing else.
    gen = PopulationGenerator(seed=20260806)
    cop = Copilot(index=index, generator=gen, verifier=DeterministicVerifier())

    ctx = CallContext("solaris", "kb-main", 3, Mode.A)
    trials: list[Trial] = []

    # Five passes over the query set so every query meets several model
    # behaviours: 5 x 40 = 200, the roadmap's number.
    for _ in range(5):
        for query, kind in QUERIES:
            t0 = time.perf_counter()
            out = cop.on_customer_turn(query, ctx)
            dt = (time.perf_counter() - t0) * 1000
            if isinstance(out, Answered):
                trials.append(
                    Trial(query, kind, True, None, out.suggestion.text,
                          tuple(c.chunk_id for c in out.suggestion.citations), dt)
                )
            else:
                assert isinstance(out, Declined)
                trials.append(Trial(query, kind, False, out.reason, "", (), dt))
    return trials, by_id, gen.calls


def report(trials: list[Trial], by_id: dict[str, Chunk], model_calls: int,
           label: str) -> int:
    delivered = [t for t in trials if t.delivered]
    violations = [
        (t, v)
        for t in delivered
        if (v := audit(t.text, [by_id[cid] for cid in t.cited], "solaris")) is not None
    ]

    lat = sorted(t.latency_ms for t in trials)
    p50 = lat[len(lat) // 2]
    p95 = lat[int(len(lat) * 0.95)]

    print()
    print(f"  {label}")
    print("=" * 68)
    print(f"trials                       {len(trials)}")
    print(f"model calls                  {model_calls}")
    print(f"suggestions delivered        {len(delivered)}")
    print(f"suppressed                   {len(trials) - len(delivered)}")
    print()
    print(f"UNSUPPORTED STATEMENTS DELIVERED   {len(violations)}")
    print(f"   exit criterion (docs/10 §1.6)   0")
    print(f"   {'PASS' if not violations else 'FAIL'}")
    print()
    for t, v in violations[:10]:
        print(f"   ! {v}\n     {t.text[:90]}")
    print()

    print("Where suggestions were suppressed")
    print("-" * 68)
    counts: dict[Refusal, int] = {}
    for t in trials:
        if not t.delivered and t.reason:
            counts[t.reason] = counts.get(t.reason, 0) + 1
    for reason, n in sorted(counts.items(), key=lambda kv: -kv[1]):
        print(f"   {reason.value:<20} {n:>4}   {n / len(trials):>6.1%}")
    print()

    # Grounded, cited, verified — and about something else. The guarantee
    # this module makes is that nothing *unsupported* reaches the agent, and
    # it holds. It does not promise the answer is to the question that was
    # asked; that is relevance, and relevance is the reranker's job. Counted
    # here so the gap is a number rather than a surprise in a pilot.
    off_topic = [
        t for t in delivered
        if t.kind in (QueryKind.OUT_OF_CORPUS, QueryKind.OTHER_TENANT)
    ]
    print(f"grounded but off-topic       {len(off_topic)}"
          f"   ({len(off_topic) / max(len(delivered), 1):.0%} of what was shown)")
    print("   Supported by the cited material, and not an answer to the")
    print("   question. This is what the cross-encoder in docs/06 §3 is for.")
    print()

    print("By question type")
    print("-" * 68)
    print(f"   {'kind':<22}{'trials':>8}{'answered':>10}{'silent':>9}")
    for kind in QueryKind:
        subset = [t for t in trials if t.kind is kind]
        if not subset:
            continue
        ans = sum(1 for t in subset if t.delivered)
        print(
            f"   {kind.value:<22}{len(subset):>8}{ans:>10}"
            f"{len(subset) - ans:>9}"
        )
    print()

    # The questions the corpus should answer and the retriever could not reach.
    # This is the number that decides whether the module is useful, as opposed
    # to merely safe: a copilot that is silent on everything hallucinates
    # nothing and is worth nothing.
    answerable = [t for t in trials if t.kind is QueryKind.IN_CORPUS]
    reachable = {t.query for t in answerable if t.delivered or t.reason is not Refusal.BELOW_THRESHOLD}
    total_q = {t.query for t in answerable}
    print("Retrieval reach on questions the material does answer")
    print("-" * 68)
    print(f"   reached                   {len(reachable)}/{len(total_q)}")
    missed = sorted(total_q - reachable)
    for q in missed:
        print(f"   unreachable: {q}")
    print()

    print("Latency of the guardrails alone (no model, no network)")
    print("-" * 68)
    print(f"   p50                       {p50:.2f} ms")
    print(f"   p95                       {p95:.2f} ms")
    print("   The 800 ms budget in docs/10 is dominated by the LLM call;")
    print("   what is measured here is the overhead this module adds to it.")
    print()
    return len(violations)


def main() -> None:
    print()
    print("VoicePilot copilot — grounding evaluation")
    print("The generator lies in two thirds of calls, on purpose.")

    lex_trials, lex_ids, lex_calls = run(embedder=None)
    hyb_trials, hyb_ids, hyb_calls = run(embedder=ConceptEmbedder())

    bad = report(lex_trials, lex_ids, lex_calls,
                 "CONFIGURATION 1 — lexical retrieval only (no embedding model)")
    bad += report(hyb_trials, hyb_ids, hyb_calls,
                  "CONFIGURATION 2 — hybrid (lexical + vector)")

    print("  WHAT THE VECTOR HALF IS WORTH")
    print("=" * 68)
    print(f"   {'question type':<22}{'lexical':>10}{'hybrid':>10}{'delta':>9}")
    for kind in QueryKind:
        a = sum(1 for t in lex_trials if t.kind is kind and t.delivered)
        b = sum(1 for t in hyb_trials if t.kind is kind and t.delivered)
        n = sum(1 for t in lex_trials if t.kind is kind)
        if not n:
            continue
        print(f"   {kind.value:<22}{a:>4}/{n:<5}{b:>4}/{n:<5}{b - a:>+9}")
    print()
    print("   Vector search is not an optimisation of this module. Without it")
    print("   the copilot is silent on every objection a customer phrases in")
    print("   their own words — which is how customers phrase objections.")
    print()

    raise SystemExit(1 if bad else 0)


if __name__ == "__main__":
    main()
