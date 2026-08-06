"""The types the anti-hallucination guarantee is built out of.

`docs/06-flujos-de-ia.md` §1 states the rule the whole copilot exists to
serve: *if it is not in the company's material, the copilot does not say it.*

That rule is not a sentence in a prompt. Prompts are advisory; a model that
ignores one produces a plausible, well-formatted, confident lie. The rule is
enforced by making the lie **unrepresentable** — a suggestion without a
citation is not a suggestion that gets discarded downstream, it is an object
that cannot be constructed.

This module is where that starts.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Protocol, Sequence


class Mode(str, Enum):
    """Which conversion mode the call is running in.

    It matters here for one reason only, and it is easy to get backwards:
    the suggestion must be written in the language **the agent is going to
    speak**, not the language the customer hears. In Mode B the agent speaks
    Spanish and the system translates; showing that agent an English
    suggestion makes them translate in their head, which is precisely the
    work we sell them out of.
    """

    A = "A"  # agent speaks English -> customer hears American English
    B = "B"  # agent speaks Spanish -> customer hears English

    @property
    def agent_language(self) -> str:
        return "en" if self is Mode.A else "es"


class Trigger(str, Enum):
    """Why the copilot woke up. See `docs/06` §3."""

    OBJECTION = "objection"
    QUESTION = "question"
    AGENT_SILENCE = "agent_silence"
    KEYWORD = "keyword"
    STAGE_CHANGE = "stage_change"
    EXPLICIT = "explicit"


class Refusal(str, Enum):
    """Every way the pipeline can decline to say anything.

    These are not errors. A copilot that is silent when it should be is
    working. Each one is counted, because the mix is the most useful signal
    we have about the quality of a customer's corpus: a tenant whose
    refusals are mostly BELOW_THRESHOLD has gaps in their material, while
    one whose refusals are mostly UNVERIFIED has a retrieval problem.
    """

    NO_TRIGGER = "no_trigger"              # nothing worth interrupting for
    BELOW_THRESHOLD = "below_threshold"    # nothing relevant in the corpus
    MODEL_DECLINED = "model_declined"      # the model itself said NO_ANSWER
    EMPTY = "empty"                        # the model returned nothing usable
    CITATION_INVALID = "citation_invalid"  # cited something it was not given
    UNVERIFIED = "unverified"              # a claim was not supported
    TOO_LONG = "too_long"                  # over the word budget


@dataclass(frozen=True)
class Chunk:
    """A retrievable piece of a company document.

    `heading_path` is not decoration. A call-center objection manual is a
    tree, and a fragment that reads only "Yes, but only for the first month"
    is useless alone and recoverable with "Objections > Price > Discounts"
    attached to it. See `chunking.py`.
    """

    id: str
    tenant_id: str
    kb_id: str
    kb_version: int
    doc_title: str
    heading_path: tuple[str, ...]
    text: str
    page: int | None = None

    def __post_init__(self) -> None:
        if not self.id:
            raise ValueError("chunk id is required")
        if not self.tenant_id:
            raise ValueError("chunk without a tenant_id is not storable")
        if not self.text.strip():
            raise ValueError("empty chunk")

    @property
    def heading_label(self) -> str:
        return " › ".join(self.heading_path) if self.heading_path else self.doc_title

    def contextualised(self) -> str:
        """The text as it is embedded and matched: situated in its document.

        `docs/06` §2 calls this contextual enrichment. Embedding the bare
        fragment loses the only thing that makes it findable.
        """
        head = self.doc_title
        if self.heading_path:
            head += " — " + " › ".join(self.heading_path)
        return f"{head}\n{self.text}"


@dataclass(frozen=True)
class Scored:
    """A chunk with the relevance the retriever assigned it, in [0, 1]."""

    chunk: Chunk
    score: float

    def __post_init__(self) -> None:
        if not 0.0 <= self.score <= 1.0:
            raise ValueError(f"relevance must be a bounded score, got {self.score}")


@dataclass(frozen=True)
class Citation:
    """Where a claim came from. Rendered to the agent, verbatim.

    The agent is about to repeat this to a customer who may later dispute
    it. "The AI said so" is not a defence; "page 7 of Objection Handling v4"
    is. That is why the citation carries the human-readable location and not
    just the chunk id.
    """

    chunk_id: str
    doc_title: str
    heading_label: str
    page: int | None
    kb_version: int


@dataclass(frozen=True)
class Suggestion:
    """What the agent sees.

    Layer 1 of the four in `docs/06` §1: **citations are NOT NULL**. In
    Postgres that is a column constraint; here it is this constructor. Both
    say the same thing — an ungrounded suggestion has no representation
    anywhere in the system, so no code path can leak one by forgetting a
    check.
    """

    text: str
    citations: tuple[Citation, ...]
    grounding_score: float
    trigger: Trigger
    language: str
    kb_version: int

    def __post_init__(self) -> None:
        if not self.text.strip():
            raise ValueError("a suggestion with no text is not a suggestion")
        if not self.citations:
            raise ValueError(
                "a suggestion without citations cannot exist — see docs/06 §1"
            )
        if not 0.0 <= self.grounding_score <= 1.0:
            raise ValueError("grounding_score must be in [0, 1]")

    @property
    def word_count(self) -> int:
        return len(self.text.split())


@dataclass(frozen=True)
class Answered:
    suggestion: Suggestion


@dataclass(frozen=True)
class Declined:
    """No suggestion, and exactly why.

    `detail` is for the weekly review queue, not for the agent. The agent
    sees nothing at all — a copilot that explains its own silence is noise
    on a screen someone is working from.
    """

    reason: Refusal
    detail: str = ""


Decision = Answered | Declined


@dataclass(frozen=True)
class Draft:
    """What a generator returns. Not yet a suggestion, and deliberately so.

    The model produces this; the pipeline decides whether it may become a
    `Suggestion`. Keeping the two types distinct is what stops a future
    edit from handing model output straight to the console.
    """

    text: str
    used_chunk_ids: tuple[str, ...]
    declined: bool = False


@dataclass(frozen=True)
class CallContext:
    """Everything about the call the copilot is allowed to know."""

    tenant_id: str
    kb_id: str
    kb_version: int
    mode: Mode
    stage: str = ""
    agent_silence_s: float = 0.0


class Generator(Protocol):
    """The language model, injected.

    Injected for the same reason the Rust engine injects its clock: a
    dependency you cannot replace is a dependency you cannot test against.
    The tests in `tests/test_pipeline.py` substitute a generator that lies
    on purpose — invents numbers, cites chunks it was never shown, answers
    when it was told to decline — and assert that nothing reaches the agent.

    A guarantee that only holds when the model behaves is not a guarantee.
    """

    def generate(
        self,
        *,
        question: str,
        chunks: Sequence[Chunk],
        language: str,
        context: CallContext,
    ) -> Draft: ...


class Embedder(Protocol):
    """Optional. Absent, retrieval is lexical only — loudly, never silently."""

    def embed(self, text: str) -> Sequence[float]: ...


@dataclass
class ReviewLog:
    """Discards, kept.

    `docs/06` §3 calls these the most useful signal for improving a
    customer's corpus, and it is right: every entry is a moment an agent
    needed an answer the company had not written down, or had written down
    somewhere the retriever could not reach.
    """

    entries: list[tuple[Refusal, str]] = field(default_factory=list)

    def record(self, reason: Refusal, detail: str = "") -> None:
        self.entries.append((reason, detail))

    def count(self, reason: Refusal) -> int:
        return sum(1 for r, _ in self.entries if r is reason)

    def __len__(self) -> int:
        return len(self.entries)
