"""Did the agent actually use the suggestion?

`docs/07` §7 asks the call player to mark *which suggestions the agent used*.
It reads like a reporting detail and it is the number that decides whether
this product gets renewed: a copilot nobody takes is a copilot nobody is
paying for next year, and the only way to know is to measure it rather than
to ask agents in a survey.

It is also the easiest number in the product to fake, in either direction,
which is why the rules below are narrow.

**The measure is lexical overlap, not similarity.** An embedding would score
the agent's paraphrase higher and would also score *any* on-topic sentence
high — the agent saying something sensible about financing looks identical to
the agent reading the panel. Counting distinctive words the suggestion
contributed is a weaker signal and a much harder one to accidentally inflate.

**Only the words the suggestion could have supplied count.** "The", "you" and
"month" appear in both because they appear in everything. The evidence that a
suggestion was used is the agent saying `zero interest` forty seconds after
it appeared on their screen and never having said it before.

**A suggestion the agent already knew is not adoption.** Good agents know
their rebuttals. If the agent had already used the same phrases earlier in
the call, the overlap proves nothing, and counting it inflates the metric in
precisely the accounts with the best agents.

**And an unused suggestion is a real, reportable outcome.** The temptation is
to loosen the threshold until adoption looks good. A number that only moves
up is not a measurement, and a copilot that is being ignored is something the
customer needs to be told — it usually means the knowledge base is wrong, not
that the agents are.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Sequence

from compliance.rules import Segment, Speaker
from copilot.text import content_terms

#: How long a suggestion stays live. Past this the agent has moved on, and
#: matching a later turn measures the script, not the panel.
WINDOW_MS = 45_000

#: Share of the suggestion's distinctive terms the agent has to reproduce.
#:
#: Set where it is because agents restate rather than read. The suggestion
#: "the installation is split over 24 months at zero interest" spoken back as
#: "we split it over 24 months, zero interest" keeps roughly two thirds of the
#: distinctive terms and is unambiguously adoption; a sentence that shares a
#: third of them is usually two people discussing the same topic.
ADOPTED_SHARE = 0.5

#: Below this the overlap is coincidence: two sentences about financing share
#: `months` and `interest` whether or not anybody read anything.
ECHOED_SHARE = 0.25


class Adoption(str, Enum):
    ADOPTED = "adopted"
    #: Some of it came through. Worth showing a supervisor and not worth
    #: counting as a win.
    ECHOED = "echoed"
    IGNORED = "ignored"
    #: The agent said it before the panel offered it. Not adoption, and
    #: counting it as such flatters the accounts with the best agents.
    ALREADY_KNEW = "already_knew"


@dataclass(frozen=True)
class Use:
    suggestion_id: str
    outcome: Adoption
    #: The turn that used it, so the player can link the two. None when the
    #: suggestion went unused.
    at_ms: int | None
    share: float
    #: The distinctive words the agent took. Shown rather than summarised —
    #: a supervisor disputing "adopted" can see exactly what it was based on,
    #: which is the same rule the copilot's citations follow.
    terms: tuple[str, ...]

    @property
    def used(self) -> bool:
        return self.outcome is Adoption.ADOPTED


def _agent_turns(segments: Sequence[Segment], start_ms: int, end_ms: int) -> list[Segment]:
    return [
        s for s in segments
        if s.speaker is Speaker.AGENT and start_ms <= s.at_ms <= end_ms
    ]


def measure(
    suggestion_id: str,
    suggestion_text: str,
    offered_at_ms: int,
    segments: Sequence[Segment],
    *,
    window_ms: int = WINDOW_MS,
) -> Use:
    """Whether one suggestion reached the customer, and through which turn."""
    distinctive = content_terms(suggestion_text)
    if not distinctive:
        # Nothing to match on. Reported as ignored rather than adopted — an
        # empty denominator that resolves to 100% is how a metric ends up
        # looking perfect on the calls where it measured nothing.
        return Use(suggestion_id, Adoption.IGNORED, None, 0.0, ())

    # What the agent had already said before the panel offered it.
    prior: set[str] = set()
    for seg in segments:
        if seg.speaker is Speaker.AGENT and seg.at_ms < offered_at_ms:
            prior |= content_terms(seg.text)

    known = distinctive & prior
    # If the agent had already produced most of it unaided, the later overlap
    # is not evidence of anything.
    if len(known) / len(distinctive) >= ADOPTED_SHARE:
        return Use(
            suggestion_id, Adoption.ALREADY_KNEW, None,
            len(known) / len(distinctive), tuple(sorted(known)),
        )

    # Only terms the agent had NOT already used can count as contributed.
    contributable = distinctive - prior
    if not contributable:
        return Use(suggestion_id, Adoption.ALREADY_KNEW, None, 1.0, ())

    best: Use | None = None
    for seg in _agent_turns(segments, offered_at_ms, offered_at_ms + window_ms):
        taken = contributable & content_terms(seg.text)
        share = len(taken) / len(contributable)
        if best is not None and share <= best.share:
            continue
        outcome = (
            Adoption.ADOPTED if share >= ADOPTED_SHARE
            else Adoption.ECHOED if share >= ECHOED_SHARE
            else Adoption.IGNORED
        )
        best = Use(
            suggestion_id, outcome,
            seg.at_ms if outcome is not Adoption.IGNORED else None,
            share, tuple(sorted(taken)),
        )

    return best or Use(suggestion_id, Adoption.IGNORED, None, 0.0, ())


@dataclass(frozen=True)
class AdoptionReport:
    uses: tuple[Use, ...]

    @property
    def offered(self) -> int:
        return len(self.uses)

    @property
    def adopted(self) -> int:
        return sum(1 for u in self.uses if u.outcome is Adoption.ADOPTED)

    @property
    def rate(self) -> float | None:
        """None when nothing was offered, never 0.0 and never 1.0.

        A rate over zero suggestions is undefined, and rendering it as 0%
        tells a customer their agents ignore the copilot on a call where it
        never spoke. `docs/06`'s rule about the close model applies here too:
        the honest output of no data is "no data".
        """
        countable = [u for u in self.uses if u.outcome is not Adoption.ALREADY_KNEW]
        if not countable:
            return None
        return sum(1 for u in countable if u.outcome is Adoption.ADOPTED) / len(countable)

    def summary(self) -> str:
        known = sum(1 for u in self.uses if u.outcome is Adoption.ALREADY_KNEW)

        if self.offered == 0:
            return "sin sugerencias que medir"

        # Offered, but every one of them was something the agent had already
        # said. Distinct from "none were offered", and the distinction is the
        # whole finding: the copilot is working and the agent does not need
        # it, which is a knowledge-base result, not an adoption problem.
        if known == self.offered:
            return (
                "1 sugerencia que el agente ya había dicho" if known == 1
                else f"{known} sugerencias que el agente ya había dicho"
            )

        base = f"{self.adopted}/{self.offered - known} sugerencias usadas"
        if known:
            base += f" · {known} ya las sabía el agente"
        return base


def report(
    offered: Sequence[tuple[str, str, int]],
    segments: Sequence[Segment],
) -> AdoptionReport:
    """`offered` is (suggestion_id, text, at_ms) in the order they appeared."""
    return AdoptionReport(tuple(
        measure(sid, text, at_ms, segments) for sid, text, at_ms in offered
    ))
