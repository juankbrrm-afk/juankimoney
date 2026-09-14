"""Turning a stream of ASR guesses into something the engines can act on.

The recogniser is a vendor decision — Deepgram, AssemblyAI, a hosted Whisper.
What is *not* a vendor decision, and what every one of them makes our problem,
is that a live recogniser does not emit transcript. It emits a running
argument with itself:

    0.4s  partial  "I guarantee"
    0.7s  partial  "I get onto"
    1.1s  partial  "I guarantee you'll"
    1.6s  final    "I can't guarantee you'll get every penny back"

Four of those five contain the phrase `i guarantee`. One of them is what the
agent said, and it means the opposite.

Feeding partials straight into the compliance engine produces a critical
legal alert, a red band, a sound, and a demand for acknowledgement — over
words nobody said, while the agent is mid-sentence. Do that twice and the
agent has learned to dismiss the band, which is the one alert in the product
that must never be ignored. The module that carefully ranks alerts instead of
queueing them is worthless if the text underneath it is a guess.

So the rule this module exists to enforce:

    **Partial text may influence what we offer. Only stable text may
    influence what we assert.**

The asymmetry is the same one the codebase keeps arriving at. A copilot
suggestion built on a partial that gets revised is a wasted suggestion — the
agent glances, it changes, nothing happens. A compliance violation built on
the same partial is an accusation. Those two are not entitled to the same
evidence, and `Consumer` below is how the difference stops being a thing
somebody has to remember.

What this module is not: it is not an acoustic model, and it does not try to
be. It is the discipline around one.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Iterator, Sequence

from compliance.rules import Segment, Speaker
from copilot.text import canonical_phrase, normalise

#: Silence that ends a turn.
#:
#: Below ~500 ms this splits people mid-sentence — everyone pauses to think,
#: and a turn cut in half hides the phrase that spans the cut from every
#: phrase-matching rule in the product. Above ~1 s the copilot answers a
#: question the customer finished asking a second ago, which on a call reads
#: as the system being slow rather than careful.
ENDPOINT_SILENCE_MS = 700

#: How many consecutive hypotheses a word must survive to count as stable.
#:
#: One is not enough: recognisers routinely keep a wrong word for a single
#: revision. Three is a quarter-second of extra latency on a compliance alert
#: that has seconds of headroom, and it is the difference between alerting on
#: what was said and alerting on what was guessed.
STABILITY_REVISIONS = 2


class Kind(str, Enum):
    PARTIAL = "partial"
    FINAL = "final"


@dataclass(frozen=True)
class Hypothesis:
    """One message from the recogniser.

    `seq` is per channel and monotonic. It is not decoration: transports
    reorder, and a stale partial applied after a final silently un-finalises
    a turn the engines have already acted on.
    """

    channel: Speaker
    kind: Kind
    text: str
    #: Start of the audio this covers, ms from call start.
    start_ms: int
    end_ms: int
    seq: int
    #: The recogniser's own confidence, 0..1, where it offers one.
    confidence: float | None = None


@dataclass(frozen=True)
class Stable:
    """Text the engines may assert on.

    Carries its own audio window so a compliance violation can point at the
    moment, and the moment survives into the call player.
    """

    channel: Speaker
    text: str
    start_ms: int
    end_ms: int
    final: bool

    def segment(self) -> Segment:
        return Segment(self.channel, self.text, self.start_ms)


class Consumer(str, Enum):
    """Who is asking, and therefore what they are entitled to see.

    The whole point of naming these is that the choice stops being a
    judgement call at each call site. A new module asks for `ASSERTING` or
    `SUGGESTING` and gets the right text by construction.
    """

    #: The copilot, the stage tracker, the sentiment track. A wrong input
    #: costs a wasted suggestion; latency costs the feature's reason to exist.
    SUGGESTING = "suggesting"
    #: Compliance, script adherence, the post-call record, anything written
    #: to a CRM. A wrong input is an accusation or a corrupted record.
    ASSERTING = "asserting"


def _words(text: str) -> list[str]:
    return normalise(text).split()


@dataclass
class Channel:
    """One speaker's stream.

    Separate per channel because in this product they genuinely are separate
    audio paths — the agent's microphone and the customer's leg — and merging
    them before stabilisation is how a customer's word gets attributed to the
    agent in a compliance report.
    """

    speaker: Speaker
    _seq: int = -1
    _text: str = ""
    _start_ms: int = 0
    _end_ms: int = 0
    #: Per-word count of consecutive hypotheses that agreed.
    _survived: list[int] = field(default_factory=list)
    _last_audio_ms: int = 0
    _committed: list[Stable] = field(default_factory=list)

    def apply(self, h: Hypothesis) -> None:
        if h.seq <= self._seq:
            # Late or duplicated. Dropping it is correct and quiet: applying
            # a stale partial after a final would un-finalise a turn the
            # engines have already acted on.
            return
        self._seq = h.seq
        self._last_audio_ms = max(self._last_audio_ms, h.end_ms)

        if h.kind is Kind.FINAL:
            self._commit(h.text, h.start_ms, h.end_ms, final=True)
            self._text = ""
            self._survived = []
            return

        incoming = _words(h.text)
        previous = _words(self._text)

        # Count agreement word by word from the start. A recogniser revising
        # the tail leaves the head alone, so the prefix that keeps surviving
        # is the part that has settled.
        survived: list[int] = []
        for i, word in enumerate(incoming):
            if i < len(previous) and previous[i] == word:
                survived.append((self._survived[i] if i < len(self._survived) else 0) + 1)
            else:
                survived.append(0)

        self._survived = survived
        self._text = h.text
        if not previous:
            self._start_ms = h.start_ms
        self._end_ms = h.end_ms

    def _commit(self, text: str, start_ms: int, end_ms: int, *, final: bool) -> None:
        if not text.strip():
            return
        self._committed.append(Stable(self.speaker, text.strip(), start_ms, end_ms, final))

    def stable_prefix(self) -> str:
        """The part of the live partial that has survived enough revisions."""
        words = self._text.split()
        keep = 0
        for count in self._survived:
            if count < STABILITY_REVISIONS:
                break
            keep += 1
        return " ".join(words[:keep])

    def endpoint(self, now_ms: int) -> Stable | None:
        """Close the turn if the speaker has stopped.

        Returns what was closed so the caller can feed it downstream. A turn
        ended by silence is as final as one the recogniser declared: the
        recogniser is not going to revise audio it stopped receiving.
        """
        if not self._text.strip():
            return None
        if now_ms - self._last_audio_ms < ENDPOINT_SILENCE_MS:
            return None
        closed = Stable(self.speaker, self._text.strip(), self._start_ms, self._end_ms, True)
        self._committed.append(closed)
        self._text = ""
        self._survived = []
        return closed


class Transcript:
    """The stream, and the two views onto it.

    Downstream modules take `Segment`s, which is what `compliance`, `script`
    and `postcall` already consume — so the ASR layer produces exactly what
    they already expect and nothing downstream learns that text arrives in
    pieces.
    """

    def __init__(self) -> None:
        self._channels: dict[Speaker, Channel] = {
            Speaker.AGENT: Channel(Speaker.AGENT),
            Speaker.CUSTOMER: Channel(Speaker.CUSTOMER),
        }

    def apply(self, h: Hypothesis) -> None:
        channel = self._channels.get(h.channel)
        if channel is None:
            return
        channel.apply(h)

    def tick(self, now_ms: int) -> list[Stable]:
        """Advance the clock. Returns turns closed by silence."""
        closed = [c.endpoint(now_ms) for c in self._channels.values()]
        out = [c for c in closed if c is not None]
        out.sort(key=lambda s: s.start_ms)
        return out

    def view(self, consumer: Consumer) -> list[Segment]:
        """What this consumer is allowed to see.

        `ASSERTING` gets committed text only. `SUGGESTING` additionally gets
        the stable prefix of whatever is still being spoken — enough for the
        copilot to start retrieving on "that's way too expens…" without
        waiting for the turn to end, which is most of the latency budget.
        """
        segments: list[Segment] = []
        for channel in self._channels.values():
            segments.extend(s.segment() for s in channel._committed)

            if consumer is Consumer.SUGGESTING:
                prefix = channel.stable_prefix()
                if prefix:
                    segments.append(Segment(channel.speaker, prefix, channel._start_ms))

        segments.sort(key=lambda s: s.at_ms)
        return segments

    def committed(self) -> list[Stable]:
        out = [s for c in self._channels.values() for s in c._committed]
        out.sort(key=lambda s: s.start_ms)
        return out


# ---------------------------------------------------------------------------
# Recogniser pathologies
# ---------------------------------------------------------------------------

#: A phrase repeated more than this many times in one turn is a decoder loop.
#:
#: Whisper-family models do this on silence, music and hold tones: they emit
#: the same clause over and over, sometimes for a minute. Passed through, it
#: lands in the transcript, in the CRM note, in the report, and it will
#: satisfy any MUST_SAY rule that happens to match the looping phrase — the
#: company is marked compliant because a decoder stuttered.
MAX_PHRASE_REPEATS = 3


def deloop(text: str, *, max_repeats: int = MAX_PHRASE_REPEATS) -> str:
    """Collapse a decoder loop, keeping one copy.

    Conservative on purpose: only *adjacent* repeats of the same phrase are
    collapsed, and only past the threshold. People do repeat themselves —
    "no, no, no", "yes yes" — and flattening genuine repetition changes what
    somebody said.
    """
    words = text.split()
    if len(words) < max_repeats * 2:
        return text

    for size in range(1, 9):
        i = 0
        out: list[str] = []
        while i < len(words):
            window = words[i:i + size]
            if len(window) < size:
                out.extend(words[i:])
                break
            repeats = 1
            j = i + size
            while (
                j + size <= len(words)
                and canonical_phrase(" ".join(words[j:j + size]))
                == canonical_phrase(" ".join(window))
            ):
                repeats += 1
                j += size
            if repeats > max_repeats:
                out.extend(window)
                i = j
            else:
                out.extend(window)
                i += size
        if len(out) < len(words):
            words = out

    return " ".join(words)


def merge_channels(stables: Sequence[Stable]) -> Iterator[Segment]:
    """Interleave the two channels into one transcript, in time order.

    Overlap is preserved rather than resolved. People talk over each other,
    and a transcript that silently drops the quieter speaker loses exactly
    the moment worth reviewing — the customer objecting while the agent is
    still pitching.
    """
    for s in sorted(stables, key=lambda x: (x.start_ms, x.channel.value)):
        yield s.segment()
