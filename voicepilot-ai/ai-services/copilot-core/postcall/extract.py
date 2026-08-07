"""Turning a transcript into a record the CRM can receive.

`docs/06` §6. The model runs once, with the whole transcript, against a strict
schema — there is no latency pressure here, so this is the highest-quality
model in the system and the one place we can afford to be slow.

Which makes it the one place where a hallucination is most likely to survive.
Nobody is listening to the recording; the supervisor reads the summary,
believes it, and coaches from it. A fabricated objection becomes a training
priority. A fabricated commitment becomes a promise the company did not make.

So every extraction is checked against the transcript before it becomes an
`Item`, and the check is the same mechanism that produces the timestamp:
**find the quote in what was actually said.** No quote, no moment; no moment,
no item.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, Sequence

from compliance.rules import Segment, Speaker
from copilot.text import canonical_phrase

from .analysis import CallAnalysis, Disposition, Item, Kind, TalkMetrics

#: Below this, a "quote" is not a quote. Two or three words appear in every
#: transcript by chance, so a model could anchor an invented objection to the
#: word "price" and pass the check.
MIN_QUOTE_WORDS = 4


@dataclass(frozen=True)
class Extraction:
    """What the summarising model returns, before it has earned anything."""

    kind: Kind
    text: str
    quote: str


@dataclass(frozen=True)
class Draft:
    summary: str
    summary_quotes: tuple[str, ...]
    extractions: tuple[Extraction, ...]
    disposition: str = ""
    disposition_quote: str = ""


class Summariser(Protocol):
    """The high-quality model, injected — same discipline as everywhere else."""

    def summarise(
        self,
        *,
        segments: Sequence[Segment],
        compliance_rule_ids: Sequence[str],
    ) -> Draft: ...


def _locate(quote: str, segments: Sequence[Segment]) -> Segment | None:
    """Find the segment a quote came from.

    Canonicalised on both sides — the same function compliance uses — so that
    punctuation and casing do not decide whether a supervisor can jump to the
    right second. A model that reproduces "that's a lot more than I wanted to
    spend" without the apostrophe is quoting correctly; failing it there would
    train us to loosen the check, which is how the check stops working.
    """
    if len(quote.split()) < MIN_QUOTE_WORDS:
        return None
    needle = canonical_phrase(quote)
    for seg in segments:
        if needle in canonical_phrase(seg.text):
            return seg
    return None


def talk_metrics(segments: Sequence[Segment], *, hangup_ms: int) -> TalkMetrics:
    """Arithmetic over timestamps. Deterministic, per `docs/06` §6 step 3.

    Segment duration is inferred from the gap to the next segment, capped so
    that a long pause is counted as silence rather than as somebody speaking
    for ninety seconds. Without the cap, one gap in the transcript makes the
    talk ratio meaningless — and the talk ratio is what coaching decisions get
    made from.
    """
    MAX_TURN_MS = 30_000
    agent = customer = silence = 0
    longest = 0
    interruptions = 0
    run = 0

    for i, seg in enumerate(segments):
        end = segments[i + 1].at_ms if i + 1 < len(segments) else hangup_ms
        span = max(0, end - seg.at_ms)
        spoken = min(span, MAX_TURN_MS)
        silence += span - spoken

        if seg.speaker is Speaker.AGENT:
            agent += spoken
            run += spoken
            longest = max(longest, run)
        else:
            customer += spoken
            run = 0

        # A turn starting less than a second after the previous one began is
        # somebody talking over somebody. Crude, deterministic, and it does
        # not need a model to be useful for coaching.
        if i > 0 and seg.speaker is not segments[i - 1].speaker:
            if seg.at_ms - segments[i - 1].at_ms < 1000:
                interruptions += 1

    return TalkMetrics(agent, customer, longest, silence, interruptions)


def analyse(
    *,
    call_id: str,
    tenant_id: str,
    segments: Sequence[Segment],
    summariser: Summariser,
    compliance_rule_ids: Sequence[str] = (),
    hangup_ms: int | None = None,
) -> CallAnalysis:
    """One call in, one auditable record out.

    Note what is *not* recomputed here: compliance. The violations come from
    the live engine, unchanged. Re-deriving them post-call would let this
    model quietly disagree with what the agent was told during the call, and
    "the panel said one thing and the report says another" destroys trust in
    both faster than either being wrong alone.
    """
    if not segments:
        raise ValueError("cannot analyse a call with no transcript")

    end = hangup_ms if hangup_ms is not None else segments[-1].at_ms
    draft = summariser.summarise(
        segments=segments, compliance_rule_ids=list(compliance_rule_ids)
    )

    items: list[Item] = []
    rejected = 0
    for ext in draft.extractions:
        seg = _locate(ext.quote, segments)
        if seg is None:
            # The model described something that was not said. Dropped, and
            # counted — a rising count is the earliest signal of drift.
            rejected += 1
            continue
        items.append(
            Item(
                kind=ext.kind,
                text=ext.text.strip(),
                quote=ext.quote.strip(),
                at_ms=seg.at_ms,
                speaker=seg.speaker.value,
            )
        )

    # The summary is held to the same standard, and it is the part a
    # supervisor actually reads. A summary whose supporting quotes cannot be
    # found is not a summary of this call.
    kept_quotes = tuple(q for q in draft.summary_quotes if _locate(q, segments))
    rejected += len(draft.summary_quotes) - len(kept_quotes)
    if not kept_quotes:
        raise ValueError(
            "the summary is not anchored to anything that was said; refusing "
            "to write it to a CRM"
        )

    disposition = None
    if draft.disposition:
        seg = _locate(draft.disposition_quote, segments)
        if seg is not None:
            disposition = Disposition(draft.disposition, draft.disposition_quote, seg.at_ms)
        else:
            rejected += 1

    return CallAnalysis(
        call_id=call_id,
        tenant_id=tenant_id,
        summary=draft.summary.strip(),
        summary_quotes=kept_quotes,
        items=tuple(items),
        metrics=talk_metrics(segments, hangup_ms=end),
        disposition=disposition,
        compliance_rule_ids=tuple(compliance_rule_ids),
        rejected=rejected,
    )


# ---------------------------------------------------------------------------
# What goes to the CRM
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class CrmWrite:
    """One operation for `shared/crm`'s sync queue to make idempotent.

    Deliberately not a CRM-specific payload. This module produces canonical
    intent — a note, a task, a disposition — and the adapter layer decides
    whether the tenant's CRM can accept it. That is the boundary `shared/crm`
    exists to hold: **we never show a button that is going to fail**, and the
    same rule means we never emit a write the adapter cannot make.
    """

    entity: str
    operation: str
    payload: dict[str, object]


def crm_writes(analysis: CallAnalysis) -> list[CrmWrite]:
    """The writes this call earned.

    The disposition is included only once a human has confirmed it. An
    unconfirmed proposal is a suggestion on a screen; writing it is how a
    pipeline fills with outcomes nobody chose.
    """
    writes: list[CrmWrite] = [
        CrmWrite(
            "note",
            "create",
            {
                "body": analysis.summary,
                "source": "ai_post_call",
                "call_id": analysis.call_id,
                # Timestamps travel with the note so a supervisor reading it
                # in the CRM can still jump into the recording.
                "anchors": [
                    {"at_ms": i.at_ms, "kind": i.kind.value, "quote": i.quote}
                    for i in analysis.items
                ],
            },
        )
    ]

    for step in analysis.of(Kind.NEXT_STEP) + analysis.of(Kind.COMMITMENT):
        writes.append(
            CrmWrite(
                "task",
                "create",
                {
                    "title": step.text,
                    "source": "ai_post_call",
                    "call_id": analysis.call_id,
                    "at_ms": step.at_ms,
                    "evidence": step.quote,
                },
            )
        )

    if analysis.disposition and analysis.disposition.writable():
        writes.append(
            CrmWrite(
                "lead",
                "update",
                {
                    "disposition": analysis.disposition.value,
                    "call_id": analysis.call_id,
                    "confirmed_by_agent": True,
                },
            )
        )

    return writes
