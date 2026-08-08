"""Which three calls does the supervisor need to be on, right now?

`docs/06` §5 says what the live analysis is actually for, and it is not the
chart:

> The floor dashboard sorts active calls by **risk**, not duration: falling
> sentiment, high stress, critical violations and prolonged silence
> combined. The supervisor sees the three calls that need intervention
> *now* at the top. **That is the real value of live analysis — not the
> pretty graph.**

Sorting by duration is the default every dashboard ships with, and it is
worse than useless: the longest call on the floor is usually the one going
well. A supervisor scanning twelve tiles has no attention budget for a
twelfth signal, so the ranking has to be opinionated and short.

Three, for the same reason the compliance panel holds three alerts. A ranked
list of forty is a list nobody reads, and it degrades to the same outcome as
no list at all.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .live import LiveSignals, Signal

#: How many calls a supervisor can actually act on at once.
ATTENTION_BUDGET = 3

#: Silence past this is a stuck agent, not a thinking customer.
DEAD_AIR_MS = 8_000


@dataclass(frozen=True)
class Factor:
    """One reason a call is ranked where it is.

    Kept and shown, because a ranking a supervisor cannot interrogate is a
    ranking they will overrule from instinct within a week. "Sentiment
    falling, critical compliance alert" is a reason to click; a risk score of
    0.78 is not.
    """

    name: str
    weight: float
    detail: str


@dataclass
class ActiveCall:
    call_id: str
    agent_name: str
    duration_ms: int
    signals: LiveSignals
    critical_violations: int = 0
    warning_violations: int = 0
    #: Set when the agent has already been alerted and acknowledged. A call
    #: whose problem is being handled should stop competing for attention
    #: with one whose problem is not.
    acknowledged: bool = False


@dataclass(frozen=True)
class Ranked:
    call: ActiveCall
    score: float
    factors: tuple[Factor, ...]

    @property
    def why(self) -> str:
        return " · ".join(f.detail for f in self.factors)


def risk(call: ActiveCall) -> tuple[float, tuple[Factor, ...]]:
    """Score one call. Higher is more urgent.

    The weights are ordered by what a supervisor can still change. A critical
    compliance violation is happening *now* and a supervisor can whisper a
    correction; a low interest score is a call that was probably never going
    to close. Ranking by "how bad is this" instead of "what can still be
    saved" puts the unsalvageable calls at the top of the screen.
    """
    factors: list[Factor] = []

    if call.critical_violations:
        factors.append(Factor(
            "compliance", 1.0,
            f"{call.critical_violations} alerta(s) crítica(s) de compliance",
        ))

    if call.signals.has(Signal.SENTIMENT):
        sentiment = call.signals.get(Signal.SENTIMENT)
        if sentiment < -0.2:
            factors.append(Factor(
                "sentiment", 0.7 * min(1.0, abs(sentiment)),
                f"sentimiento en {sentiment:+.2f}",
            ))

    if call.signals.has(Signal.STRESS):
        stress = call.signals.get(Signal.STRESS)
        if stress > 0.6:
            factors.append(Factor("stress", 0.5 * stress,
                                  f"estrés del agente en {stress:.0%}"))

    if call.signals.silence_ms >= DEAD_AIR_MS:
        factors.append(Factor(
            "silence", 0.6,
            f"{call.signals.silence_ms / 1000:.0f} s de silencio",
        ))

    if call.warning_violations:
        factors.append(Factor("warnings", 0.15 * call.warning_violations,
                              f"{call.warning_violations} advertencia(s)"))

    score = sum(f.weight for f in factors)

    # A handled problem stops competing with an unhandled one. Without this,
    # the same call sits at the top of the screen for six minutes after the
    # supervisor already dealt with it, and everything behind it is invisible.
    if call.acknowledged:
        score *= 0.4

    return score, tuple(factors)


def triage(calls: list[ActiveCall], *, limit: int = ATTENTION_BUDGET) -> list[Ranked]:
    """The three calls that need a supervisor now, and why.

    Calls with no risk factors are excluded rather than ranked last. An empty
    list is the correct, common, and quietly valuable output: it means the
    floor is fine, and a dashboard that says so in one glance is worth more
    than one that always finds three things to worry about.
    """
    ranked = []
    for call in calls:
        score, factors = risk(call)
        if score > 0:
            ranked.append(Ranked(call, score, factors))

    # Ties broken by duration descending: of two equally risky calls, the one
    # that has been going wrong for longer is the one to join first.
    ranked.sort(key=lambda r: (-r.score, -r.call.duration_ms, r.call.call_id))
    return ranked[:limit]


@dataclass
class FloorState:
    """What the supervisor's screen holds. Deliberately small."""

    active: list[ActiveCall] = field(default_factory=list)

    def needs_attention(self) -> list[Ranked]:
        return triage(self.active)

    def quiet(self) -> bool:
        return not self.needs_attention()
