"""The discipline around a live recogniser. `docs/06`.

A recogniser does not emit transcript, it emits a running argument with
itself, and the interim guesses are wrong in the most expensive possible
way: "I can't guarantee" spends three revisions looking exactly like "I
guarantee".

One rule: **partial text may influence what we offer, only stable text may
influence what we assert.** `Consumer` makes that structural rather than
something each call site has to remember.
"""

from .stream import (
    ENDPOINT_SILENCE_MS,
    MAX_PHRASE_REPEATS,
    STABILITY_REVISIONS,
    Channel,
    Consumer,
    Hypothesis,
    Kind,
    Stable,
    Transcript,
    deloop,
    merge_channels,
)

__all__ = [
    "Channel", "Consumer", "ENDPOINT_SILENCE_MS", "Hypothesis", "Kind",
    "MAX_PHRASE_REPEATS", "STABILITY_REVISIONS", "Stable", "Transcript",
    "deloop", "merge_channels",
]
