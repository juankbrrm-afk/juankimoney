"""Did the agent follow the script, and where did it come apart?

`docs/06` §6 step 4: *which steps were met, in what order, which were
skipped.* It is one line in the spec and it is what a floor supervisor
actually buys — compliance protects the company from a regulator, script
adherence is how a team gets better at selling.

Two decisions separate this from the score-out-of-100 that every QA product
ships with.

**Adherence is not a percentage.** "78% adherence" is a number a supervisor
cannot coach from. It does not say whether the agent skipped the discovery
questions or fumbled the close, and those are different conversations with
different people. So the output is a per-step verdict and a short list of
**named** failures. A number is offered too, because someone will want to
chart it, but it is derived from the verdicts rather than being the product.

**Order matters for some steps and not others.** Verifying identity has to
happen before pricing is discussed — that is not style, it is the sequence
the script exists to enforce. Whether the agent mentions the warranty before
or after the financing is nobody's business. Treating every step as ordered
produces a wall of false "out of order" findings, agents learn the report is
wrong, and the module joins the compliance panel nobody reads.

Compliance and this module deliberately stay separate. A missed script step
is a coaching note. A missed disclosure is a legal exposure. Merging them
gives you either a legal alert about small talk or a coaching tip about a
statute, and both are worse than having two lists.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Sequence

from compliance.engine import phrase_hit
from compliance.rules import Segment, Speaker


class Outcome(str, Enum):
    MET = "met"
    #: Said, but after a step it was supposed to precede.
    OUT_OF_ORDER = "out_of_order"
    #: Said, but past its deadline. Different coaching from skipping it.
    LATE = "late"
    SKIPPED = "skipped"


@dataclass(frozen=True)
class Step:
    id: str
    name: str
    phrases: tuple[str, ...]
    #: Optional steps are tracked and never counted as failures. Every real
    #: script has branches — "if they mention a competitor" — and marking
    #: those required makes the report wrong on most calls.
    required: bool = True
    #: Steps this one must come before. Empty means order does not matter.
    before: tuple[str, ...] = ()
    #: Seconds from the start of the call.
    deadline_s: float | None = None
    speaker: Speaker = Speaker.AGENT
    #: What the supervisor tells the agent. A finding without one is a
    #: complaint, not coaching.
    coaching: str = ""

    def __post_init__(self) -> None:
        if not self.phrases:
            raise ValueError(f"{self.id}: a step with no phrases matches nothing")
        if self.required and not self.coaching:
            raise ValueError(
                f"{self.id}: a required step needs coaching text — a finding "
                "with nothing to say about it is a complaint"
            )


@dataclass
class Script:
    id: str
    tenant_id: str
    name: str
    steps: list[Step] = field(default_factory=list)

    def __post_init__(self) -> None:
        ids = {s.id for s in self.steps}
        for s in self.steps:
            for other in s.before:
                if other not in ids:
                    raise ValueError(
                        f"{s.id} must come before {other!r}, which is not in "
                        "this script — an ordering rule pointing at nothing "
                        "would silently never fire"
                    )

    def step(self, step_id: str) -> Step | None:
        return next((s for s in self.steps if s.id == step_id), None)


@dataclass(frozen=True)
class StepResult:
    step: Step
    outcome: Outcome
    at_ms: int | None
    evidence: str
    detail: str = ""

    @property
    def failed(self) -> bool:
        return self.step.required and self.outcome is not Outcome.MET


@dataclass(frozen=True)
class Adherence:
    script_id: str
    results: tuple[StepResult, ...]

    @property
    def failures(self) -> tuple[StepResult, ...]:
        return tuple(r for r in self.results if r.failed)

    @property
    def score(self) -> float:
        """Derived, and offered second.

        Somebody will chart it, and a chart is a legitimate thing to want.
        It is computed from the verdicts rather than being the thing the
        module produces, so nobody can improve the number without improving
        the calls.
        """
        required = [r for r in self.results if r.step.required]
        if not required:
            return 1.0
        met = sum(1 for r in required if r.outcome is Outcome.MET)
        return met / len(required)

    def coaching_notes(self) -> list[str]:
        """What the supervisor says, in the order they should say it.

        Skips first: a step that never happened is a bigger gap than one that
        happened out of turn, and a coaching conversation that opens with
        sequencing when the agent forgot the close entirely is a conversation
        the agent stops listening to.
        """
        order = {Outcome.SKIPPED: 0, Outcome.LATE: 1, Outcome.OUT_OF_ORDER: 2}
        ranked = sorted(self.failures, key=lambda r: order.get(r.outcome, 3))
        return [f"{r.step.name}: {r.step.coaching}" for r in ranked]


def evaluate(
    script: Script,
    segments: Sequence[Segment],
    *,
    hangup_ms: int | None = None,
) -> Adherence:
    """Replay a call against a script.

    Reuses `phrase_hit` from the compliance engine rather than matching
    differently. Two matchers means a phrase can be "said" for one module and
    not the other, and then the compliance panel and the coaching report
    disagree about the same sentence in front of the same supervisor.
    """
    end = hangup_ms if hangup_ms is not None else (
        segments[-1].at_ms if segments else 0
    )

    first_hit: dict[str, tuple[int, str]] = {}
    for seg in segments:
        for step in script.steps:
            if step.id in first_hit:
                continue
            if step.speaker is not Speaker.ANY and step.speaker is not seg.speaker:
                continue
            if phrase_hit(seg.text, step.phrases) is not None:
                first_hit[step.id] = (seg.at_ms, seg.text)

    results: list[StepResult] = []
    for step in script.steps:
        hit = first_hit.get(step.id)
        if hit is None:
            results.append(
                StepResult(step, Outcome.SKIPPED, None, "",
                           f"never said during {end / 1000:.0f} s of call")
            )
            continue

        at_ms, evidence = hit

        # Order before deadline: saying the right thing at the right time in
        # the wrong sequence is a sequencing problem, and reporting it as
        # lateness sends the agent to fix the wrong thing.
        broke: list[str] = []
        for later_id in step.before:
            later = first_hit.get(later_id)
            if later is not None and later[0] < at_ms:
                name = (script.step(later_id) or step).name
                broke.append(name)
        if broke:
            results.append(
                StepResult(step, Outcome.OUT_OF_ORDER, at_ms, evidence,
                           "came after " + ", ".join(broke))
            )
            continue

        if step.deadline_s is not None and at_ms > step.deadline_s * 1000:
            results.append(
                StepResult(step, Outcome.LATE, at_ms, evidence,
                           f"at {at_ms / 1000:.0f} s, expected by "
                           f"{step.deadline_s:.0f} s")
            )
            continue

        results.append(StepResult(step, Outcome.MET, at_ms, evidence))

    return Adherence(script.id, tuple(results))


def current_stage(script: Script, segments: Sequence[Segment]) -> Step | None:
    """The furthest step reached so far.

    Feeds the copilot's `STAGE_CHANGE` trigger, so the two modules agree on
    where the call is. A copilot offering closing material while the agent is
    still doing discovery is worse than a silent one.
    """
    reached: Step | None = None
    seen: set[str] = set()
    for seg in segments:
        for step in script.steps:
            if step.id in seen:
                continue
            if step.speaker is not Speaker.ANY and step.speaker is not seg.speaker:
                continue
            if phrase_hit(seg.text, step.phrases) is not None:
                seen.add(step.id)
                reached = step
    return reached
