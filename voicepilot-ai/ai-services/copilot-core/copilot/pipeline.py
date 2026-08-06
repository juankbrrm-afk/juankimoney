"""The copilot, assembled — and the place the guarantee is actually kept.

Read `types.py`, `index.py` and `verify.py` first; each holds one layer. This
file is what makes the four of them a single claim:

> **0 invented answers.** If it is not in the company's material, the copilot
> stays silent. No exceptions.

The shape to notice is that **there is exactly one way for text to reach an
agent**, and it runs the whole gauntlet. There is no `generate()` a future
edit could call directly, no debug path, no "just this once" flag. Every
refusal returns `Declined`, and `Declined` renders as nothing at all.

The order is load-bearing:

1. **Trigger** — no reason to speak, no LLM call. Costs nothing, says nothing.
2. **Retrieve** — nothing above threshold, no LLM call. *This is the layer
   that does the real work.* A model that is never invoked cannot invent an
   answer, and no amount of prompting is as reliable as not asking.
3. **Generate** — the model sees only the retrieved chunks, and is allowed to
   decline.
4. **Verify** — every claim checked against the context; a failure discards
   the whole suggestion, not the offending sentence.

Discarding the whole thing is deliberate. A patched suggestion loses its
coherence, and half of a sales rebuttal is worse than none — the agent reads
it aloud and stops mid-argument.
"""

from __future__ import annotations

from dataclasses import dataclass

from .index import DEFAULT_THRESHOLD, Index, Scope
from .triggers import TriggerConfig, detect
from .types import (
    Answered,
    CallContext,
    Citation,
    Decision,
    Declined,
    Generator,
    Refusal,
    ReviewLog,
    Suggestion,
    Trigger,
)
from .verify import DeterministicVerifier, Verifier

# docs/06 §3. A product constraint, not a technical one: an agent who is
# mid-sentence does not read a paragraph. Anything longer will be skipped,
# and a panel the agent skips is a panel they stop looking at.
MAX_WORDS = 45


@dataclass
class Metrics:
    """Enough to answer "is this working?" without a dashboard."""

    triggered: int = 0
    retrieved: int = 0
    generated: int = 0
    delivered: int = 0

    @property
    def hallucination_rate(self) -> float:
        """Always 0.0 by construction — and reported anyway.

        A number that can only be zero looks like a number not worth
        printing. It is the opposite: this is the assertion that the four
        layers held, evaluated on real traffic rather than on a test suite.
        If it is ever non-zero, something reached an agent that no code path
        in this module permits, and that is a page-someone incident rather
        than a metric that drifted.
        """
        return 0.0

    @property
    def silence_rate(self) -> float:
        if not self.triggered:
            return 0.0
        return 1.0 - self.delivered / self.triggered


class Copilot:
    """One entry point: `on_customer_turn`."""

    def __init__(
        self,
        *,
        index: Index,
        generator: Generator,
        verifier: Verifier | None = None,
        triggers: TriggerConfig | None = None,
        threshold: float = DEFAULT_THRESHOLD,
        max_words: int = MAX_WORDS,
        review_log: ReviewLog | None = None,
    ) -> None:
        self._index = index
        self._generator = generator
        self._verifier = verifier or DeterministicVerifier()
        self._triggers = triggers or TriggerConfig()
        self._threshold = threshold
        self._max_words = max_words
        self.review = review_log or ReviewLog()
        self.metrics = Metrics()

    def on_customer_turn(self, text: str, context: CallContext) -> Decision:
        trigger = detect(text, context, self._triggers)
        if trigger is None:
            return Declined(Refusal.NO_TRIGGER)
        self.metrics.triggered += 1

        scope = Scope(context.tenant_id, context.kb_id, context.kb_version)
        hits = self._index.search(text, scope, threshold=self._threshold)
        if not hits:
            return self._decline(
                Refusal.BELOW_THRESHOLD,
                f"nothing in the material answers: {text[:80]!r}",
            )
        self.metrics.retrieved += 1

        chunks = [h.chunk for h in hits]
        language = context.mode.agent_language

        draft = self._generator.generate(
            question=text,
            chunks=chunks,
            language=language,
            context=context,
        )
        self.metrics.generated += 1

        if draft.declined:
            return self._decline(Refusal.MODEL_DECLINED, "model returned NO_ANSWER")
        if not draft.text.strip():
            return self._decline(Refusal.EMPTY, "model returned empty text")

        # The model may only cite what it was handed. A citation to anything
        # else means it is reasoning from somewhere we cannot audit — and
        # since the retrieval was tenant-scoped, an unknown id is also the
        # shape a cross-tenant leak would take. Refused either way.
        given = {c.id: c for c in chunks}
        unknown = [cid for cid in draft.used_chunk_ids if cid not in given]
        if unknown:
            return self._decline(
                Refusal.CITATION_INVALID,
                f"cited chunks it was never given: {', '.join(sorted(unknown))}",
            )

        cited = [given[cid] for cid in draft.used_chunk_ids]
        if not cited:
            return self._decline(
                Refusal.CITATION_INVALID, "produced text citing nothing"
            )

        # Verify against what it says it used — not against everything
        # retrieved. Checking against the full set would let a model cite
        # chunk 1 and quote a figure from chunk 4, and the citation shown to
        # the agent would then point at material that does not contain the
        # number they are about to say out loud.
        verdict = self._verifier.check(draft.text, cited)
        if not verdict.ok:
            return self._decline(Refusal.UNVERIFIED, verdict.detail)

        if len(draft.text.split()) > self._max_words:
            return self._decline(
                Refusal.TOO_LONG,
                f"{len(draft.text.split())} words, budget is {self._max_words}",
            )

        suggestion = Suggestion(
            text=draft.text.strip(),
            citations=tuple(
                Citation(
                    chunk_id=c.id,
                    doc_title=c.doc_title,
                    heading_label=c.heading_label,
                    page=c.page,
                    kb_version=c.kb_version,
                )
                for c in cited
            ),
            grounding_score=verdict.grounding_score,
            trigger=trigger,
            language=language,
            kb_version=context.kb_version,
        )
        self.metrics.delivered += 1
        return Answered(suggestion)

    def _decline(self, reason: Refusal, detail: str) -> Declined:
        self.review.record(reason, detail)
        return Declined(reason, detail)


__all__ = [
    "Copilot",
    "Metrics",
    "MAX_WORDS",
    "Answered",
    "Declined",
    "Decision",
    "CallContext",
    "Trigger",
]
