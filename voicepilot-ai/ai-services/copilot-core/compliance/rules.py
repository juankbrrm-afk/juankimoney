"""Compliance rules, and the severity model that decides whether they work.

`docs/06-flujos-de-ia.md` §4. The detection is the easy half. The hard half is
the sentence that follows it in the spec:

> **A badly designed alert trains the agent to ignore alerts, and then the
> whole module is worth zero.**

That is not a UX note. It is the failure mode of every compliance product
that has ever shipped: a rule set grows, alerts multiply, agents learn the
panel is noise, and the one alert that mattered — the one a regulator will
ask about — scrolls past unread. The module then costs money and provides
negative value, because the customer believes they are covered.

So the severity model here is deliberately narrow, and the noise budget in
`engine.py` is a hard cap rather than a default.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class Severity(str, Enum):
    """Three levels, each with a fixed presentation. See `docs/06` §4.

    The presentation is attached to the severity rather than configured per
    rule on purpose. If a customer can make every rule critical, every rule
    becomes critical, and the level stops carrying information.
    """

    #: Legal exposure. Red band, short sound, and the agent must acknowledge.
    CRITICAL = "critical"
    #: Script incomplete. Amber text, no sound, no acknowledgement.
    WARNING = "warning"
    #: Improvement. **Post-call report only — never shown during the call.**
    INFO = "info"

    @property
    def live(self) -> bool:
        return self is not Severity.INFO

    @property
    def rank(self) -> int:
        return {Severity.CRITICAL: 3, Severity.WARNING: 2, Severity.INFO: 1}[self]


class Kind(str, Enum):
    #: A phrase that must appear at some point in the call.
    MUST_SAY = "must_say"
    #: A phrase that must appear before a deadline. Verified against the clock.
    MUST_SAY_BEFORE = "must_say_before"
    #: A phrase that must never appear. The expensive one.
    MUST_NOT_SAY = "must_not_say"
    #: If A is mentioned, B must follow within a window. A state machine.
    CONDITIONAL = "conditional"


class Speaker(str, Enum):
    AGENT = "agent"
    CUSTOMER = "customer"
    ANY = "any"


@dataclass(frozen=True)
class Rule:
    """One rule. Written so a lawyer can read it, per `docs/06` §4.

    `phrases` are the deterministic patterns: alternative wordings of the same
    obligation. Matching any one satisfies (or, for `MUST_NOT_SAY`, violates)
    the rule. They are matched on normalised text, so accents and casing do
    not decide whether a company is compliant.
    """

    id: str
    tenant_id: str
    kind: Kind
    severity: Severity
    title: str
    #: What the agent should do about it. Shown in the alert; an alert that
    #: only reports a problem makes the agent stop mid-sentence to think.
    remedy: str = ""
    phrases: tuple[str, ...] = ()
    speaker: Speaker = Speaker.AGENT
    #: `MUST_SAY_BEFORE` only: seconds from the start of the call.
    deadline_s: float | None = None
    #: `CONDITIONAL` only: mentioning any of these arms the obligation.
    when_mentioned: tuple[str, ...] = ()
    #: `CONDITIONAL` only: seconds allowed to satisfy it once armed.
    window_s: float = 60.0
    #: Legal citation or internal policy reference, carried into the record.
    authority: str = ""

    def __post_init__(self) -> None:
        if not self.id or not self.tenant_id:
            raise ValueError("a rule needs an id and a tenant")
        if self.kind is Kind.MUST_SAY_BEFORE and self.deadline_s is None:
            raise ValueError(
                f"{self.id}: must_say_before without a deadline is a must_say "
                "wearing the wrong label — and it would never fire"
            )
        if self.kind is Kind.CONDITIONAL and not self.when_mentioned:
            raise ValueError(
                f"{self.id}: a conditional rule with no trigger can never arm"
            )
        if not self.phrases:
            raise ValueError(f"{self.id}: a rule with no phrases matches nothing")
        if self.severity is Severity.CRITICAL and not self.remedy:
            # A red band with a sound and no instruction is an interruption,
            # not help. The agent is mid-sentence with a customer.
            raise ValueError(
                f"{self.id}: a critical rule must tell the agent what to do"
            )


@dataclass(frozen=True)
class Segment:
    """One final ASR turn."""

    speaker: Speaker
    text: str
    at_ms: int

    def __post_init__(self) -> None:
        if self.speaker is Speaker.ANY:
            raise ValueError("a transcript segment has an actual speaker")
        if self.at_ms < 0:
            raise ValueError("negative timestamp")


@dataclass(frozen=True)
class Violation:
    rule_id: str
    severity: Severity
    title: str
    remedy: str
    #: Where in the call. `docs/06` §6: without this the analysis is a pretty
    #: text nobody verifies and nobody trusts — the supervisor clicks the
    #: violation and lands on that second of the recording.
    at_ms: int
    #: The words that triggered it, verbatim. A violation a compliance officer
    #: cannot read back is a violation they cannot defend or dismiss.
    evidence: str
    #: `deterministic` or `semantic`. Which layer found it, always recorded.
    layer: str
    authority: str = ""
    #: True when the noise budget kept this out of the live panel.
    deferred_to_report: bool = False

    @property
    def live(self) -> bool:
        return self.severity.live and not self.deferred_to_report


@dataclass
class RuleSet:
    tenant_id: str
    rules: list[Rule] = field(default_factory=list)

    def __post_init__(self) -> None:
        seen: set[str] = set()
        for r in self.rules:
            if r.tenant_id != self.tenant_id:
                raise ValueError(
                    f"{r.id} belongs to {r.tenant_id}, not {self.tenant_id}"
                )
            if r.id in seen:
                raise ValueError(f"duplicate rule id: {r.id}")
            seen.add(r.id)

    def of_kind(self, kind: Kind) -> list[Rule]:
        return [r for r in self.rules if r.kind is kind]
