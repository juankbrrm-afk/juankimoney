"""Script adherence. `docs/06` §6 step 4.

Separate from compliance on purpose: a missed script step is a coaching
note, a missed disclosure is a legal exposure. Merging them gives you either
a legal alert about small talk or a coaching tip about a statute.
"""

from .adherence import (
    Adherence,
    Outcome,
    Script,
    Step,
    StepResult,
    current_stage,
    evaluate,
)

__all__ = [
    "Adherence", "Outcome", "Script", "Step", "StepResult", "current_stage",
    "evaluate",
]
