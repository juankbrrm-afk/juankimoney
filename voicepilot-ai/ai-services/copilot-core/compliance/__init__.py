"""Deterministic compliance, with a learned safety net.

`docs/06-flujos-de-ia.md` §4. Two layers, in a fixed order: the rule a lawyer
can read runs first and its refusal is final; the classifier is the net for
what the rules cannot phrase.

Lives beside `copilot/` rather than in its own distribution because both
share one tokeniser. If retrieval and compliance disagreed about what a word
is, a phrase could be "said" for one and not the other.
"""

from .backtest import Accuracy, BacktestResult, LabelledCall, backtest, measure
from .engine import (
    LIVE_ALERT_BUDGET,
    CallMonitor,
    NoClassifier,
    SemanticClassifier,
    phrase_hit,
    run_call,
)
from .rules import Kind, Rule, RuleSet, Segment, Severity, Speaker, Violation

__all__ = [
    "Accuracy", "BacktestResult", "CallMonitor", "Kind", "LIVE_ALERT_BUDGET",
    "LabelledCall", "NoClassifier", "Rule", "RuleSet", "Segment",
    "SemanticClassifier", "Severity", "Speaker", "Violation", "backtest",
    "measure", "phrase_hit", "run_call",
]
