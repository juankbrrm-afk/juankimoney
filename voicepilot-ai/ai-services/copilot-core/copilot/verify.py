"""Layer 4: does the context actually support what the model wrote?

`docs/06` §1 lists four layers, and says of this one:

> The fourth layer is the one almost nobody implements, and it is the one
> that turns "almost never hallucinates" into "does not hallucinate".

The design mirrors the compliance engine in `docs/06` §4, which is two layers
for the same reason: **the deterministic layer goes first and it rules.** A
rule a lawyer can read is instant, free, explainable and auditable. The
learned model is the safety net for the cases the rules cannot see.

`DeterministicVerifier` is that first layer, and it is honest about its
reach. It cannot judge whether "that puts you in a strong position" follows
from a financing table — no rule can. What it *can* do, with certainty, is
refuse the three things that make up nearly every hallucination that costs
money in this business:

1. **An invented number.** Hallucinations here are rarely a fabricated
   paragraph. They are one wrong figure inside an otherwise correct sentence:
   the chunk says 24 months at 0%, the model says 36, the agent repeats it,
   and the company is committed to terms it never offered.
2. **An invented promise.** "I guarantee you get every penny back" is the
   example `docs/06` §4 itself uses. Guarantees, refunds, "free", "lifetime"
   — if the material does not say it, the copilot may not either.
3. **Wholesale drift.** Text with almost nothing in common with the chunks it
   claims to be based on.

Everything else is left to the NLI layer, which plugs in through the same
`Verifier` protocol and is chained with `all_of`. Claiming more than this
would be the same failure as a hallucination: confident, plausible, wrong.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, Sequence

from .text import content_terms, normalise, numeric_facts, sentences
from .types import Chunk

# Below this share of the draft's content terms appearing in the cited
# context, the text is not a rephrasing of the material — it is new writing.
DEFAULT_GROUNDING_FLOOR = 0.35

# Promises that create liability. A short, closed, reviewable list, in both
# languages the product speaks. Adding to it is a product decision, not a
# tuning knob — every entry is something a regulator or a judge might read
# back to the company.
COMMITMENT_TERMS = frozenset(
    """
    guarantee guaranteed guarantees warranty warranties refund refunded
    refundable free lifetime forever unlimited permanent no-risk risk-free
    cancel-anytime money-back
    garantia garantizo garantizado garantizamos reembolso reembolsamos
    devolucion devolvemos gratis gratuito ilimitado permanente
    """.split()
)


@dataclass(frozen=True)
class Verdict:
    """Supported or not, plus the reason and the score that goes in the row.

    `grounding_score` is `NOT NULL` in the schema, so it must be produced
    even for a failure — a rejected suggestion is still a row in the review
    queue, and the score is what makes that queue sortable by how badly the
    model drifted.
    """

    ok: bool
    grounding_score: float
    detail: str = ""


class Verifier(Protocol):
    def check(self, draft_text: str, chunks: Sequence[Chunk]) -> Verdict: ...


class DeterministicVerifier:
    """Rules a lawyer can read. Runs first, and its refusal is final."""

    def __init__(self, *, grounding_floor: float = DEFAULT_GROUNDING_FLOOR) -> None:
        self._floor = grounding_floor

    def check(self, draft_text: str, chunks: Sequence[Chunk]) -> Verdict:
        if not chunks:
            return Verdict(False, 0.0, "no context to verify against")

        context = "\n".join(c.text for c in chunks)
        ctx_norm = normalise(context)
        ctx_terms = content_terms(context)
        ctx_numbers = numeric_facts(context)

        draft_terms = content_terms(draft_text)
        grounding = (
            len(draft_terms & ctx_terms) / len(draft_terms) if draft_terms else 0.0
        )

        # 1. Numbers. Checked per sentence so the report names the offender —
        #    "the suggestion is unsupported" is not something a reviewer can
        #    act on; "sentence 2 invents 36 months" is.
        for n, sentence in enumerate(sentences(draft_text), start=1):
            invented = numeric_facts(sentence) - ctx_numbers
            if invented:
                return Verdict(
                    False,
                    grounding,
                    f"sentence {n} states a figure the material does not: "
                    + ", ".join(sorted(invented)),
                )

        # 2. Commitments. A promise absent from the material is the most
        #    expensive sentence the copilot could produce.
        for term in sorted(COMMITMENT_TERMS & draft_terms):
            if term not in ctx_terms and term not in ctx_norm:
                return Verdict(
                    False,
                    grounding,
                    f"promises '{term}', which the material does not",
                )

        # 3. Drift.
        if grounding < self._floor:
            return Verdict(
                False,
                grounding,
                f"only {grounding:.0%} of its terms come from the cited material "
                f"(floor {self._floor:.0%})",
            )

        return Verdict(True, grounding)


class AlwaysPass:
    """For tests that are exercising a different layer. Never for production."""

    def check(self, draft_text: str, chunks: Sequence[Chunk]) -> Verdict:
        return Verdict(True, 1.0)


def all_of(*verifiers: Verifier) -> Verifier:
    """Chain verifiers; the first refusal wins.

    This is how the NLI model arrives without touching the pipeline: it
    becomes a second `Verifier` and is chained behind the deterministic one.
    The ordering is the design — the cheap, explainable, auditable check runs
    first, and a model is never asked to overrule it.
    """

    class _Chain:
        def check(self, draft_text: str, chunks: Sequence[Chunk]) -> Verdict:
            worst = 1.0
            for v in verifiers:
                verdict = v.check(draft_text, chunks)
                worst = min(worst, verdict.grounding_score)
                if not verdict.ok:
                    return Verdict(False, worst, verdict.detail)
            return Verdict(True, worst)

    return _Chain()
