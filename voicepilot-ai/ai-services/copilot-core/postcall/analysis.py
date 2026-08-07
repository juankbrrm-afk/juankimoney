"""The post-call record, and the rule that makes it worth reading.

`docs/06` §6 states the cross-cutting requirement, and it is easy to read as
a nice-to-have:

> **Every extracted element carries `at_ms`** — the exact moment of the call
> it came from. The supervisor clicks "price objection" and jumps to second
> 145 of the recording. Without that traceability, the analysis is a pretty
> text nobody verifies and nobody trusts.

It is not a nice-to-have, and it does more work than the spec claims. Made
structural — an item *cannot exist* without a verbatim span of the transcript
behind it — the same field that gives a supervisor a timestamp also makes
invention impossible. A model cannot fabricate an objection that was never
raised, because fabricating one means producing a quote that is not in the
transcript, and a quote that is not in the transcript does not resolve to a
moment, and an item that does not resolve to a moment is not constructible.

One constraint, two guarantees. That is the same trick as `Suggestion`
requiring citations, applied to a different failure: the copilot invents
answers, the post-call summary invents *events*.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class Kind(str, Enum):
    """What was extracted. A closed set, because each one is written to a
    different place in the CRM and an unrecognised kind has no destination."""

    KEY_POINT = "key_point"
    OBJECTION = "objection"
    NEXT_STEP = "next_step"
    PRODUCT = "product"
    COMPETITOR = "competitor"
    COMMITMENT = "commitment"


@dataclass(frozen=True)
class Item:
    """One extracted fact, anchored to the moment it happened.

    `quote` is verbatim from the transcript — not the model's paraphrase of
    it. `text` is the model's reading. Keeping both is what lets a supervisor
    disagree: they see what the AI concluded next to the words it concluded
    it from, which is the difference between a tool they audit and a tool
    they distrust.
    """

    kind: Kind
    text: str
    quote: str
    at_ms: int
    speaker: str

    def __post_init__(self) -> None:
        if not self.text.strip():
            raise ValueError("an item with no reading is not an item")
        if not self.quote.strip():
            raise ValueError(
                "an item without a verbatim quote cannot be traced, cannot be "
                "verified, and is indistinguishable from an invention"
            )
        if self.at_ms < 0:
            raise ValueError("negative timestamp")


@dataclass(frozen=True)
class TalkMetrics:
    """Deterministic. No model — `docs/06` §6 step 3.

    These are arithmetic over timestamps, and a model asked to compute them
    would sometimes be wrong in ways nobody checks. A talk ratio that is
    occasionally invented is worse than no talk ratio, because coaching
    decisions get made from it.
    """

    agent_ms: int
    customer_ms: int
    longest_agent_monologue_ms: int
    silence_ms: int
    interruptions: int

    @property
    def talk_ratio(self) -> float:
        """Share of speaking time that was the agent. 0.5 is balanced."""
        total = self.agent_ms + self.customer_ms
        return self.agent_ms / total if total else 0.0


@dataclass(frozen=True)
class Disposition:
    """What the AI thinks the outcome was. **A proposal, never a decision.**

    `docs/06` and the demo both say it: the AI proposes, the human disposes.
    An auto-applied disposition is how a pipeline fills with outcomes nobody
    chose, and how a forecast built on those outcomes becomes fiction. The
    flag is here rather than in the UI so that no code path can write an
    unconfirmed disposition to a CRM by forgetting a check.
    """

    value: str
    quote: str
    at_ms: int
    confirmed_by_agent: bool = False

    def __post_init__(self) -> None:
        if not self.value.strip():
            raise ValueError("empty disposition")
        if not self.quote.strip():
            raise ValueError("a disposition must point at what decided it")

    def writable(self) -> bool:
        return self.confirmed_by_agent


@dataclass(frozen=True)
class CallAnalysis:
    """Everything the supervisor reads and the CRM receives."""

    call_id: str
    tenant_id: str
    summary: str
    summary_quotes: tuple[str, ...]
    items: tuple[Item, ...]
    metrics: TalkMetrics
    disposition: Disposition | None
    #: Violations carried over from the live compliance engine, unmodified.
    #: Re-deriving them here would let the post-call model quietly disagree
    #: with what the agent was told during the call.
    compliance_rule_ids: tuple[str, ...] = ()
    #: Extractions dropped because their quote was not in the transcript.
    #: Kept as a number, not hidden: a rising count is the earliest signal
    #: that the summarising model has drifted.
    rejected: int = 0

    def of(self, kind: Kind) -> list[Item]:
        return [i for i in self.items if i.kind is kind]

    def __post_init__(self) -> None:
        if not self.summary.strip():
            raise ValueError("empty summary")
