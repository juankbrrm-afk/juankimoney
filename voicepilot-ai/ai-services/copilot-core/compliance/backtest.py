"""What a rule would have done, before it is allowed to do anything.

`docs/06` §4 ends with the endpoint that makes the rest safe:

> And that is why `POST /compliance-rules/{id}/test` exists: **no rule is
> activated without first seeing how many alerts it would have generated in
> the last 1,000 calls.**

Without this, a rule set degrades in one direction only. Somebody adds a
sensible-sounding rule, it fires on 40% of calls because of a phrasing nobody
anticipated, agents learn within a week that the panel is noise, and the
critical alert that a regulator will one day ask about scrolls past unread.
The damage is done to *every* rule, not just the bad one — attention is a
shared resource and a bad rule spends everyone's.

So this module answers three questions about a proposed rule, from history:
how often would it fire, on how many calls, and — the one people forget —
what would it have pushed out of the live panel.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

from .engine import LIVE_ALERT_BUDGET, SemanticClassifier, run_call
from .rules import Rule, RuleSet, Segment, Severity

#: A rule firing on more than this share of calls is describing normal
#: behaviour, not an exception. It may still be correct — but it needs a human
#: decision, not an automatic activation.
NOISY_THRESHOLD = 0.20


@dataclass(frozen=True)
class BacktestResult:
    rule_id: str
    calls: int
    calls_with_alert: int
    total_alerts: int
    #: Calls where adding this rule pushed an existing alert out of the live
    #: panel. The hidden cost of every new rule, and the number that decides
    #: whether a rule set is still working as a whole.
    calls_where_it_displaced_another: int
    #: Alerts of this rule that the budget would itself have deferred.
    times_deferred: int
    examples: tuple[str, ...]

    @property
    def hit_rate(self) -> float:
        return self.calls_with_alert / self.calls if self.calls else 0.0

    @property
    def noisy(self) -> bool:
        return self.hit_rate > NOISY_THRESHOLD

    def verdict(self) -> str:
        """Every concern, not the first one.

        A verdict that reports the loudest problem and stops is how the
        second one ships. A rule can be both too noisy *and* displacing a
        critical alert, and those are different fixes.
        """
        if self.calls == 0:
            return "No history to test against. Do not activate blind."
        if self.calls_with_alert == 0:
            return (
                f"Would never have fired in {self.calls} calls. Either the "
                "phrasing does not match how agents actually speak, or the "
                "rule describes something that does not happen."
            )

        concerns: list[str] = []
        if self.noisy:
            concerns.append(
                "At that rate it is describing normal behaviour, not an "
                "exception, and it will spend the attention the critical "
                "rules need."
            )
        if self.calls_where_it_displaced_another:
            concerns.append(
                f"On {self.calls_where_it_displaced_another} call(s) it "
                "displaces another alert out of the live panel — check what "
                "it pushes off before activating."
            )
        if self.times_deferred:
            concerns.append(
                f"{self.times_deferred} of its own alerts would themselves be "
                "deferred to the report, unseen during the call."
            )

        head = (
            f"Fires on {self.hit_rate:.0%} of calls "
            f"({self.calls_with_alert}/{self.calls})."
        )
        return head + (" " + " ".join(concerns) if concerns else " Safe to activate.")


def backtest(
    candidate: Rule,
    active: RuleSet,
    history: Sequence[Sequence[Segment]],
    *,
    classifier: SemanticClassifier | None = None,
) -> BacktestResult:
    """Replay history twice: without the rule, then with it.

    Twice, rather than once with the rule alone, because the number that
    matters is not how often the rule fires — it is what the rule *costs*.
    The live panel holds three alerts. A fourth does not appear; it displaces
    nothing and is itself deferred, or it outranks something that was already
    there. Either way an agent stops seeing something they used to see, and a
    single-rule test cannot show that.
    """
    with_rule = RuleSet(active.tenant_id, [*active.rules, candidate])

    calls_with_alert = 0
    total_alerts = 0
    displaced = 0
    deferred = 0
    examples: list[str] = []

    for segments in history:
        base = run_call(active, segments, classifier=classifier)
        after = run_call(with_rule, segments, classifier=classifier)

        mine = [v for v in after.report() if v.rule_id == candidate.id]
        if mine:
            calls_with_alert += 1
            total_alerts += len(mine)
            deferred += sum(1 for v in mine if v.deferred_to_report)
            for v in mine:
                if v.evidence and len(examples) < 5:
                    examples.append(v.evidence[:120])

        before_live = {v.rule_id for v in base.live_alerts()}
        after_live = {v.rule_id for v in after.live_alerts()}
        if before_live - after_live:
            displaced += 1

    return BacktestResult(
        rule_id=candidate.id,
        calls=len(history),
        calls_with_alert=calls_with_alert,
        total_alerts=total_alerts,
        calls_where_it_displaced_another=displaced,
        times_deferred=deferred,
        examples=tuple(examples),
    )


@dataclass(frozen=True)
class LabelledCall:
    """A past call with the violations a human reviewer actually found."""

    segments: tuple[Segment, ...]
    expected_rule_ids: frozenset[str]


@dataclass(frozen=True)
class Accuracy:
    """The exit criterion for module 1.7, per `docs/06` §7 and `docs/10`.

    Two numbers, and the spec is explicit about why each one matters more
    than a combined score would suggest:

    - **recall on critical rules > 0.95** — a false negative is a fine.
    - **precision > 0.85** — a false positive trains the agent to ignore.

    Averaging them into an F1 hides exactly the trade a compliance officer
    needs to see, so they are never averaged here.
    """

    true_positives: int
    false_positives: int
    false_negatives: int

    @property
    def recall(self) -> float:
        d = self.true_positives + self.false_negatives
        return self.true_positives / d if d else 1.0

    @property
    def precision(self) -> float:
        d = self.true_positives + self.false_positives
        return self.true_positives / d if d else 1.0


def measure(
    rules: RuleSet,
    labelled: Sequence[LabelledCall],
    *,
    classifier: SemanticClassifier | None = None,
    only: Severity | None = None,
) -> Accuracy:
    """Score a rule set against human-labelled calls.

    `only=Severity.CRITICAL` scores just the rules that carry legal exposure,
    which is how the roadmap's criterion is written. A recall figure averaged
    over informational rules is a number that cannot fail.
    """
    ids = {r.id for r in rules.rules if only is None or r.severity is only}
    tp = fp = fn = 0

    for call in labelled:
        monitor = run_call(rules, call.segments, classifier=classifier)
        found = {v.rule_id for v in monitor.report() if v.rule_id in ids}
        expected = call.expected_rule_ids & ids
        tp += len(found & expected)
        fp += len(found - expected)
        fn += len(expected - found)

    return Accuracy(tp, fp, fn)
