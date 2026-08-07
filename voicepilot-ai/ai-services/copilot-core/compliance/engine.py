"""The compliance engine: two layers, a clock, and a hard noise budget.

`docs/06` §4 specifies the layering and, more importantly, the order:

> **The deterministic layer goes first and it rules.** A rule of the form
> "must say phrase X before minute 1" is resolved by pattern matching: it is
> instant, free, explainable and auditable. **A lawyer can read the rule.**
>
> The semantic classifier is the safety net, for when the agent says the
> right thing in different words, or promises something forbidden creatively.

The asymmetry that makes this safe is not in the spec, and it is the most
important decision in this file:

- For **must_say**, the model may only *excuse* a miss. The agent covered the
  obligation in their own words; the rules did not see it; the model says
  they did. Nothing is added by the model, only forgiven.
- For **must_not_say**, the model may only *add* a violation. It can never
  suppress one the rules found.

So a model failure degrades in exactly one direction: more alerts, never
fewer, on the rules that carry legal exposure. A learned component is never
in a position to talk the system out of a violation a written rule detected.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from typing import Protocol, Sequence

from copilot.text import canonical_phrase

from .rules import Kind, RuleSet, Rule, Segment, Severity, Speaker, Violation

#: `docs/06` §4: **maximum 3 live alerts per call**, and the spec says the
#: limit "is deliberate and not configurable upward". It is enforced as a
#: constant rather than a setting, because the first thing a customer asks
#: for after a month is more alerts, and granting it is how the panel becomes
#: wallpaper and the module stops protecting anyone.
LIVE_ALERT_BUDGET = 3


class SemanticClassifier(Protocol):
    """The safety net. Injected, and never trusted with the final word.

    `covers(text, phrases)` answers: does this utterance discharge one of
    these obligations, however it was phrased?
    `violates(text, phrases)` answers: does this utterance do the forbidden
    thing, however creatively?
    """

    def covers(self, text: str, phrases: Sequence[str]) -> bool: ...
    def violates(self, text: str, phrases: Sequence[str]) -> tuple[bool, str]: ...


class NoClassifier:
    """No model wired. Deterministic only — and it says so rather than pretending.

    A legitimate configuration, and a materially weaker one: an agent who
    promises a refund in words the rule set never anticipated goes undetected.
    `CallMonitor.semantic_enabled` reports it so an operator is never left
    assuming coverage they do not have.
    """

    def covers(self, text: str, phrases: Sequence[str]) -> bool:
        return False

    def violates(self, text: str, phrases: Sequence[str]) -> tuple[bool, str]:
        return False, ""


def phrase_hit(text: str, phrases: Sequence[str]) -> str | None:
    """Return the phrase that matched, or None.

    Normalised on both sides so that `garantía` and `GARANTIA` are the same
    obligation. Matching is on a whole-word subsequence: a rule phrase is a
    sequence of words the agent must actually say, so word order is part of
    the obligation and must not be relaxed into a bag of words — "we do not
    guarantee a refund" would otherwise satisfy a rule looking for
    "guarantee a refund".
    """
    haystack = canonical_phrase(text)
    for phrase in phrases:
        if canonical_phrase(phrase) in haystack:
            return phrase
    return None


@dataclass
class _Armed:
    """A conditional obligation waiting to be discharged."""

    rule: Rule
    armed_at_ms: int
    trigger_evidence: str


@dataclass
class CallMonitor:
    """Watches one call. Fed segments as ASR finalises them, plus clock ticks.

    Clock ticks matter and are easy to forget: a `must_say_before` deadline
    has to fire when it passes, and it passes during silence. A monitor that
    only reacts to speech never reports the identity verification that never
    happened — which is the single most common critical rule in this industry.
    """

    rules: RuleSet
    classifier: SemanticClassifier = field(default_factory=NoClassifier)

    _violations: list[Violation] = field(default_factory=list, init=False)
    _satisfied: set[str] = field(default_factory=set, init=False)
    _fired: set[str] = field(default_factory=set, init=False)
    _armed: list[_Armed] = field(default_factory=list, init=False)
    _now_ms: int = field(default=0, init=False)

    @property
    def semantic_enabled(self) -> bool:
        return not isinstance(self.classifier, NoClassifier)

    # -- ingestion -------------------------------------------------------

    def on_segment(self, seg: Segment) -> list[Violation]:
        """Process one turn. Returns violations raised by *this* turn."""
        before = len(self._violations)
        self._now_ms = max(self._now_ms, seg.at_ms)

        self._check_must_not_say(seg)
        self._mark_satisfied(seg)
        self._arm_conditionals(seg)
        self._expire(self._now_ms)

        return self._violations[before:]

    def tick(self, at_ms: int) -> list[Violation]:
        """Advance the clock without speech. Deadlines fire here."""
        before = len(self._violations)
        self._now_ms = max(self._now_ms, at_ms)
        self._expire(self._now_ms)
        return self._violations[before:]

    def on_hangup(self, at_ms: int) -> list[Violation]:
        """Everything still outstanding becomes a violation at the end.

        A `must_say` with no deadline can only be judged here: the agent had
        the whole call to say it and did not.
        """
        before = len(self._violations)
        self._now_ms = max(self._now_ms, at_ms)
        self._expire(self._now_ms, final=True)
        return self._violations[before:]

    # -- the two layers --------------------------------------------------

    def _check_must_not_say(self, seg: Segment) -> None:
        for rule in self.rules.of_kind(Kind.MUST_NOT_SAY):
            if not self._applies(rule, seg):
                continue
            if rule.id in self._fired:
                # One violation per rule per call. The agent has been told;
                # repeating the same red band five times is the noise that
                # trains them to stop looking.
                continue

            hit = phrase_hit(seg.text, rule.phrases)
            if hit is not None:
                self._raise(rule, seg.at_ms, seg.text, "deterministic")
                continue

            # Safety net, and it may only *add*. The rules already said no.
            violated, why = self.classifier.violates(seg.text, rule.phrases)
            if violated:
                self._raise(rule, seg.at_ms, why or seg.text, "semantic")

    def _mark_satisfied(self, seg: Segment) -> None:
        for rule in self.rules.rules:
            if rule.kind is Kind.MUST_NOT_SAY or rule.id in self._satisfied:
                continue
            if not self._applies(rule, seg):
                continue

            if rule.kind is Kind.CONDITIONAL:
                # Handled against the armed instance, not the rule, because
                # the same rule can arm more than once in a call.
                continue

            if phrase_hit(seg.text, rule.phrases) is not None:
                self._satisfied.add(rule.id)
            elif self.classifier.covers(seg.text, rule.phrases):
                # The agent said the right thing in their own words. This is
                # the only direction the model may move a must_say.
                self._satisfied.add(rule.id)

        # Discharge armed conditionals.
        for armed in list(self._armed):
            if not self._applies(armed.rule, seg):
                continue
            if phrase_hit(seg.text, armed.rule.phrases) is not None or (
                self.classifier.covers(seg.text, armed.rule.phrases)
            ):
                self._armed.remove(armed)

    def _arm_conditionals(self, seg: Segment) -> None:
        for rule in self.rules.of_kind(Kind.CONDITIONAL):
            if rule.id in self._fired:
                continue
            hit = phrase_hit(seg.text, rule.when_mentioned)
            if hit is None:
                continue
            if any(a.rule.id == rule.id for a in self._armed):
                continue
            # Mentioning the trigger and satisfying the obligation in the same
            # breath is the normal, correct case: "it's $28,000, and nobody
            # pays that up front — we split it over 24 months."
            if phrase_hit(seg.text, rule.phrases) is not None:
                continue
            self._armed.append(_Armed(rule, seg.at_ms, seg.text))

    def _expire(self, now_ms: int, *, final: bool = False) -> None:
        for rule in self.rules.of_kind(Kind.MUST_SAY_BEFORE):
            if rule.id in self._satisfied or rule.id in self._fired:
                continue
            assert rule.deadline_s is not None
            if now_ms >= rule.deadline_s * 1000:
                self._raise(
                    rule,
                    int(rule.deadline_s * 1000),
                    f"not said within the first {rule.deadline_s:.0f} s",
                    "deterministic",
                )

        for armed in list(self._armed):
            if now_ms - armed.armed_at_ms >= armed.rule.window_s * 1000 or final:
                self._armed.remove(armed)
                if armed.rule.id in self._fired:
                    continue
                self._raise(
                    armed.rule,
                    armed.armed_at_ms,
                    armed.trigger_evidence,
                    "deterministic",
                )

        if final:
            for rule in self.rules.of_kind(Kind.MUST_SAY):
                if rule.id in self._satisfied or rule.id in self._fired:
                    continue
                self._raise(rule, now_ms, "never said during the call", "deterministic")

    # -- alert budget ----------------------------------------------------

    def _raise(self, rule: Rule, at_ms: int, evidence: str, layer: str) -> None:
        self._fired.add(rule.id)
        self._violations.append(
            Violation(
                rule_id=rule.id,
                severity=rule.severity,
                title=rule.title,
                remedy=rule.remedy,
                at_ms=at_ms,
                evidence=evidence.strip(),
                layer=layer,
                authority=rule.authority,
            )
        )

    def _applies(self, rule: Rule, seg: Segment) -> bool:
        return rule.speaker is Speaker.ANY or rule.speaker is seg.speaker

    # -- output ----------------------------------------------------------

    def live_alerts(self) -> list[Violation]:
        """What the agent sees: the three most severe, never more.

        `docs/06` §4: when more than three fire, **the three of highest
        severity are shown** and the rest go to the report.

        Which sounds obvious and was not what the first implementation did.
        It spent the budget in arrival order, so three warnings early in a
        call silently suppressed a critical legal alert later — the exact
        alert a regulator would ask about, hidden by three notes about script
        completeness. The budget is a ranking, not a queue, and it is decided
        at render time so that a violation raised at second 40 can still be
        pushed out by a more serious one at second 200.
        """
        live = [v for v in self._violations if v.severity.live]
        live.sort(key=lambda v: (-v.severity.rank, v.at_ms))
        return live[:LIVE_ALERT_BUDGET]

    def report(self) -> list[Violation]:
        """Everything: info, and everything the budget kept off the panel.

        `deferred_to_report` is filled in here rather than when the violation
        was raised, because during a live call it is not yet knowable — a
        later, more serious violation changes which three are on screen.
        """
        shown = {id(v) for v in self.live_alerts()}
        out = [
            replace(v, deferred_to_report=v.severity.live and id(v) not in shown)
            for v in self._violations
        ]
        return sorted(out, key=lambda v: (v.at_ms, -v.severity.rank))

    def critical_count(self) -> int:
        return sum(1 for v in self._violations if v.severity is Severity.CRITICAL)


def run_call(
    rules: RuleSet,
    segments: Sequence[Segment],
    *,
    classifier: SemanticClassifier | None = None,
    hangup_ms: int | None = None,
) -> CallMonitor:
    """Replay a whole call. The shape every test and every backtest uses."""
    monitor = CallMonitor(rules, classifier or NoClassifier())
    for seg in segments:
        monitor.on_segment(seg)
    end = hangup_ms if hangup_ms is not None else (
        segments[-1].at_ms if segments else 0
    )
    monitor.on_hangup(end)
    return monitor
