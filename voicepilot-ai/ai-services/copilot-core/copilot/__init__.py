"""VoicePilot copilot core — grounded suggestions, or silence.

The guarantee, from `docs/06-flujos-de-ia.md` §1:

    If it is not in the company's material, the copilot does not say it.
    It prefers to stay silent rather than invent.

Enforced in four layers — schema, retrieval, generation, verification — none
of which trusts a prompt. See `pipeline.py`.
"""

from .chunking import chunk_document
from .index import DEFAULT_THRESHOLD, Index, Scope
from .pipeline import MAX_WORDS, Copilot, Metrics
from .triggers import TriggerConfig, detect
from .types import (
    Answered,
    CallContext,
    Chunk,
    Citation,
    Decision,
    Declined,
    Draft,
    Mode,
    Refusal,
    ReviewLog,
    Scored,
    Suggestion,
    Trigger,
)
from .verify import DeterministicVerifier, Verdict, Verifier, all_of

__all__ = [
    "Answered",
    "CallContext",
    "Chunk",
    "Citation",
    "Copilot",
    "DEFAULT_THRESHOLD",
    "Decision",
    "Declined",
    "DeterministicVerifier",
    "Draft",
    "Index",
    "MAX_WORDS",
    "Metrics",
    "Mode",
    "Refusal",
    "ReviewLog",
    "Scope",
    "Scored",
    "Suggestion",
    "Trigger",
    "TriggerConfig",
    "Verdict",
    "Verifier",
    "all_of",
    "chunk_document",
    "detect",
]
