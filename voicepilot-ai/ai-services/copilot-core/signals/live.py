"""Live signals, and the number we refuse to make up.

`docs/06` §5. Sentiment, stress, interest and purchase probability, updated
every two seconds while the call runs.

The section ends with the sentence that shapes this whole module:

> **Critical note on purchase probability:** this model is trained **per
> tenant**, on their own historical outcomes. A generic "close probability"
> model is astrology. Until a tenant has ~2,000 calls with a known outcome,
> the system shows *"calibrating"* instead of a fake number.
>
> I would rather show "not enough data" than an invented 73%. A supervisor
> who makes decisions from an invented number leaves us in two months.

So a probability is not a float here. It is a tagged union whose numeric arm
**cannot be constructed** without the history that earns it — the same
device as `Suggestion` requiring citations and a post-call `Item` requiring a
quote. Three modules, three different failures, one rule: **a claim with no
evidence has no representation.**
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum

#: `docs/06` §5. Below this many calls with a known outcome, a per-tenant
#: close model is fitting noise and reporting it as insight.
CALIBRATION_CALLS = 2_000

#: `docs/06` §5: signals refresh every 2 s.
REFRESH_MS = 2_000


class Signal(str, Enum):
    SENTIMENT = "sentiment"      # -1 .. +1
    STRESS = "stress"            # 0 .. 1
    FRUSTRATION = "frustration"  # 0 .. 1
    INTEREST = "interest"        # 0 .. 1
    AGENT_CONFIDENCE = "agent_confidence"  # 0 .. 1


@dataclass(frozen=True)
class Calibrating:
    """Not enough history to say anything. Shown as words, never as a number."""

    calls_with_outcome: int
    calls_needed: int = CALIBRATION_CALLS

    @property
    def progress(self) -> float:
        return min(1.0, self.calls_with_outcome / self.calls_needed)

    def __str__(self) -> str:
        return f"calibrando · {self.calls_with_outcome}/{self.calls_needed} llamadas"


@dataclass(frozen=True)
class Probability:
    """A number that was earned.

    Private constructor by convention is not enough — there is a real check
    in `estimate_close()`, and this type is never built anywhere else.
    `model_version` rides along for the same reason it does in the gateway:
    a quality regression six weeks from now has to be traceable to a model.
    """

    value: float
    tenant_calls: int
    model_version: str

    def __post_init__(self) -> None:
        if not 0.0 <= self.value <= 1.0:
            raise ValueError("a probability is in [0, 1]")
        if self.tenant_calls < CALIBRATION_CALLS:
            raise ValueError(
                f"{self.tenant_calls} calls is not enough to quote a close "
                f"probability; {CALIBRATION_CALLS} are needed. Show "
                "Calibrating instead — an invented 73% costs a customer"
            )
        if not self.model_version:
            raise ValueError("an unversioned score cannot be debugged later")


CloseEstimate = Calibrating | Probability


class CloseModel:
    """Per tenant. Injected, and it does not get to decide when it is ready."""

    def predict(self, features: dict[str, float]) -> float:  # pragma: no cover
        raise NotImplementedError

    @property
    def version(self) -> str:  # pragma: no cover
        raise NotImplementedError


def estimate_close(
    *,
    tenant_calls_with_outcome: int,
    model: CloseModel | None,
    features: dict[str, float],
) -> CloseEstimate:
    """The only way a close probability enters the system.

    The readiness check is here, not in the model, on purpose: a model asked
    whether it is ready will always say yes. Readiness is a property of the
    tenant's history, which is something the caller knows and the model does
    not.
    """
    if model is None or tenant_calls_with_outcome < CALIBRATION_CALLS:
        return Calibrating(tenant_calls_with_outcome)
    return Probability(
        value=max(0.0, min(1.0, model.predict(features))),
        tenant_calls=tenant_calls_with_outcome,
        model_version=model.version,
    )


# ---------------------------------------------------------------------------
# Smoothing
# ---------------------------------------------------------------------------

#: How fast a signal is allowed to *improve* per refresh.
RISE_ALPHA = 0.25
#: How fast it is allowed to *deteriorate*. Deliberately much faster.
FALL_ALPHA = 0.85


@dataclass
class Track:
    """One signal over time, smoothed **asymmetrically**.

    A bar that flickers on every ASR turn is noise, and a supervisor learns
    to ignore a flickering bar exactly as fast as they learn to ignore a
    noisy compliance panel. So the signals are smoothed.

    But symmetric smoothing hides the only event that matters. A customer who
    turns cold does it in one sentence — "that's a lot more than I wanted to
    spend" — and a filter that takes four refreshes to show it has delayed
    the supervisor by eight seconds on the one call they needed to hear.

    So deterioration is nearly instant and recovery is slow. The asymmetry
    reads as pessimism and it is: being told a call is going badly when it
    has recovered costs a supervisor ten seconds of listening, and missing a
    call that is going badly costs the deal.
    """

    signal: Signal
    value: float = 0.0
    _seen: bool = field(default=False, init=False)

    def update(self, observed: float) -> float:
        if not self._seen:
            self._seen = True
            self.value = observed
            return self.value
        worse = observed < self.value if self.signal is not Signal.STRESS else observed > self.value
        alpha = FALL_ALPHA if worse else RISE_ALPHA
        self.value += alpha * (observed - self.value)
        return self.value


@dataclass
class LiveSignals:
    """Everything the console shows while the call runs."""

    tracks: dict[Signal, Track] = field(default_factory=dict)
    close: CloseEstimate = field(default_factory=lambda: Calibrating(0))
    silence_ms: int = 0

    def observe(self, signal: Signal, value: float) -> float:
        track = self.tracks.get(signal)
        if track is None:
            track = Track(signal)
            self.tracks[signal] = track
        return track.update(value)

    def get(self, signal: Signal) -> float:
        track = self.tracks.get(signal)
        return track.value if track else 0.0

    def has(self, signal: Signal) -> bool:
        return signal in self.tracks
