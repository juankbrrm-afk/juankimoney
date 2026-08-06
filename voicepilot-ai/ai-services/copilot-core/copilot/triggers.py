"""When the copilot is allowed to speak.

`docs/06` §3: **the LLM is not called on every sentence.** It would be
expensive, slow, and it would fill the agent's screen with noise — and an
agent who learns to ignore the panel has turned the whole module into
decoration.

There is a second reason, less obvious and more important. Every suggestion
shown is an interruption of a person who is mid-conversation with a customer.
The cost of a wrong suggestion is not the tokens; it is the half second the
agent spent reading it while the customer was talking.

So the default is silence, and something specific has to happen to break it.
The spec budgets under 50 ms for this: a small model over text, not an LLM.
What is here is the deterministic core of that — the part that must work
identically every time, and the part a supervisor can be shown and argue with.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from .text import normalise
from .types import CallContext, Trigger

AGENT_SILENCE_S = 3.0

# Objection cues, both languages. Patterns rather than a bag of words: "too
# expensive" is an objection, "not too expensive" is a buying signal, and a
# keyword list cannot tell them apart.
_OBJECTION_PATTERNS = (
    r"\btoo (?:expensive|much|pricey|high)\b",
    r"\bcan'?t afford\b",
    r"\bmore than (?:i|we) (?:wanted|expected|planned)\b",
    r"\bout of (?:my|our) (?:budget|price range)\b",
    r"\bthat'?s a lot\b",
    r"\bnot interested\b",
    r"\bneed to think\b",
    r"\btalk to my (?:wife|husband|partner|spouse|accountant)\b",
    r"\bwhat'?s the catch\b",
    r"\bmuy caro\b",
    r"\bno me alcanza\b",
    r"\bno tengo (?:el )?presupuesto\b",
    r"\bmas de lo que (?:queria|esperaba|pensaba)\b",
    r"\bno me interesa\b",
    r"\btengo que pensarlo\b",
    r"\bconsultarlo con\b",
)

# A trailing "?" is the strongest signal and it is often missing from ASR
# output, so interrogative openers carry the rest.
_QUESTION_OPENERS = (
    r"^(?:what|when|where|why|how|who|which|does|do|did|is|are|can|could|"
    r"would|will|should|has|have|am)\b",
    r"^(?:que|qué|cuando|cuándo|donde|dónde|por que|por qué|como|cómo|quien|"
    r"quién|cual|cuál|cuanto|cuánto|puedo|puede|pueden|tiene|tienen|hay)\b",
)

_OBJECTION_RE = tuple(re.compile(p) for p in _OBJECTION_PATTERNS)
_QUESTION_RE = tuple(re.compile(p) for p in _QUESTION_OPENERS)

# Negation, which flips the meaning of every cue above. "That's too expensive"
# is an objection; "honestly, that's not too expensive" is a customer talking
# themselves into the sale, and interrupting *that* with a price rebuttal is
# how the copilot loses a deal the agent had already won.
#
# The Spanish objection patterns begin with their own negator ("no me
# alcanza"), so the window never sees it and they are unaffected.
_NEGATORS = frozenset(
    """
    not never no none nothing hardly barely
    nunca nada tampoco ningun ninguna
    isnt arent aint wasnt werent dont doesnt didnt wont cannot cant couldnt
    """.split()
)

# A comma or a full stop ends the clause, and with it the negation's reach.
# "No, that's too expensive" is a refusal followed by an objection — the "no"
# belongs to the previous clause and must not suppress what comes after it.
_CLAUSE_BREAK = re.compile(r"[,;:.!?¡¿]")

_NEGATION_WINDOW = 3


def _negated(text: str, match_start: int) -> bool:
    clause = _CLAUSE_BREAK.split(text[:match_start])[-1]
    recent = clause.split()[-_NEGATION_WINDOW:]
    return any(w.replace("'", "").strip('"') in _NEGATORS for w in recent)


@dataclass
class TriggerConfig:
    """Per-tenant. Keywords are the part every customer edits on day one.

    Competitor names, "cancel", "lawyer", "attorney", "abogado" — the words
    that mean the call just changed character and the agent needs help now.
    """

    keywords: tuple[str, ...] = ()
    silence_threshold_s: float = AGENT_SILENCE_S
    explicit: bool = False  # the agent pressed Ctrl+Space
    stage_changed: bool = False
    _normalised: tuple[str, ...] = field(default=(), init=False, repr=False)

    def __post_init__(self) -> None:
        self._normalised = tuple(normalise(k) for k in self.keywords if k.strip())


def detect(
    customer_text: str,
    context: CallContext,
    config: TriggerConfig | None = None,
) -> Trigger | None:
    """The first trigger that fires, or None — which means stay silent.

    Order is priority, and it is deliberate. An explicit request from the
    agent outranks everything: they asked, they get an answer, and second-
    guessing a human who pressed the button is how a tool becomes annoying.
    Keywords come next because they are the tenant's own definition of "this
    call needs help now".
    """
    cfg = config or TriggerConfig()

    if cfg.explicit:
        return Trigger.EXPLICIT

    text = normalise(customer_text).strip()

    if text:
        for kw in cfg._normalised:
            if kw and kw in text:
                return Trigger.KEYWORD
        for rx in _OBJECTION_RE:
            m = rx.search(text)
            if m and not _negated(text, m.start()):
                return Trigger.OBJECTION

    # Silence outranks a question: if the agent has gone quiet for three
    # seconds they are stuck, and that is more urgent than the grammar of
    # whatever the customer last said.
    if context.agent_silence_s >= cfg.silence_threshold_s:
        return Trigger.AGENT_SILENCE

    if text:
        if "?" in customer_text:
            return Trigger.QUESTION
        for rx in _QUESTION_RE:
            if rx.search(text):
                return Trigger.QUESTION

    if cfg.stage_changed:
        return Trigger.STAGE_CHANGE

    return None
