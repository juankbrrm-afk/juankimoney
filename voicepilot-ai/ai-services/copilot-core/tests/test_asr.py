"""The ASR stream, tested against what recognisers actually do.

The headline test is `test_a_revised_partial_never_reaches_compliance`. It is
the reason the module exists: "I can't guarantee you'll get every penny back"
spends three revisions looking exactly like a critical FTC violation, and an
alert fired on one of those is an accusation about words nobody said — in
front of the agent, mid-sentence, demanding acknowledgement.
"""

from __future__ import annotations

import unittest

from asr import (
    Consumer,
    ENDPOINT_SILENCE_MS,
    Hypothesis,
    Kind,
    STABILITY_REVISIONS,
    Transcript,
    deloop,
)
from compliance import (
    CallMonitor, Kind as RuleKind, Rule, RuleSet, Segment, Severity, Speaker,
)

A = Speaker.AGENT
C = Speaker.CUSTOMER

NO_GUARANTEE = RuleSet("t1", [
    Rule("noguar", "t1", RuleKind.MUST_NOT_SAY, Severity.CRITICAL,
         "No prometer garantías inexistentes",
         remedy="Retráctate ahora.",
         phrases=("i guarantee", "every penny back"),
         authority="FTC Act §5"),
])


def partial(text, seq, *, channel=A, start=0, end=1000):
    return Hypothesis(channel, Kind.PARTIAL, text, start, end, seq)


def final(text, seq, *, channel=A, start=0, end=1000):
    return Hypothesis(channel, Kind.FINAL, text, start, end, seq)


class WhatComplianceIsAllowedToSee(unittest.TestCase):
    def test_a_revised_partial_never_reaches_compliance(self):
        """The whole module, in one test.

        Three of these four hypotheses contain `i guarantee`. The fourth is
        what the agent said and it means the opposite. An alert fired on any
        of the first three is a critical legal accusation over words nobody
        said.
        """
        revisions = [
            "I guarantee",
            "I get onto",
            "I guarantee you'll",
            "I can't guarantee you'll get every penny back",
        ]

        # The control. Without this the test above passes against an
        # implementation that simply never fires — which is the one way it
        # could be green and worthless.
        naive = CallMonitor(NO_GUARANTEE)
        for i, text in enumerate(revisions):
            naive.on_segment(Segment(A, text, i * 400))
        self.assertGreater(
            naive.critical_count(), 0,
            "the control failed: feeding partials straight through must "
            "produce the false alert this module exists to prevent",
        )

        t = Transcript()
        for seq, text in enumerate(revisions):
            t.apply(partial(text, seq))

        monitor = CallMonitor(NO_GUARANTEE)
        for seg in t.view(Consumer.ASSERTING):
            monitor.on_segment(seg)

        self.assertEqual(monitor.critical_count(), 0)

    def test_the_copilot_may_see_the_settled_prefix(self):
        """Latency is the copilot's reason to exist.

        Waiting for the turn to end before retrieving spends most of the
        budget. A wrong retrieval costs a suggestion the agent glances at;
        the asymmetry is the point.
        """
        t = Transcript()
        for seq in range(STABILITY_REVISIONS + 1):
            t.apply(partial("that's way too expensive", seq, channel=C))

        suggesting = t.view(Consumer.SUGGESTING)
        asserting = t.view(Consumer.ASSERTING)

        self.assertTrue(any("expensive" in s.text for s in suggesting))
        self.assertEqual(asserting, [])

    def test_an_unsettled_word_is_not_in_the_prefix_either(self):
        t = Transcript()
        t.apply(partial("I guarantee", 0))
        t.apply(partial("I get onto", 1))
        prefix = " ".join(s.text for s in t.view(Consumer.SUGGESTING))
        self.assertNotIn("guarantee", prefix)

    def test_a_final_reaches_both(self):
        t = Transcript()
        t.apply(final("I guarantee you'll get every penny back", 0))

        monitor = CallMonitor(NO_GUARANTEE)
        for seg in t.view(Consumer.ASSERTING):
            monitor.on_segment(seg)

        # Said for real this time. The alert must fire.
        self.assertEqual(monitor.critical_count(), 1)


class TransportMisbehaviour(unittest.TestCase):
    def test_a_stale_partial_arriving_after_a_final_is_dropped(self):
        """Transports reorder.

        Applying a stale partial after a final silently un-finalises a turn
        the engines have already acted on — the compliance report then
        disagrees with the alert the agent acknowledged.
        """
        t = Transcript()
        t.apply(final("I can't guarantee anything", 5))
        t.apply(partial("I guarantee", 3))

        self.assertEqual(len(t.committed()), 1)
        self.assertIn("can't", t.committed()[0].text)
        monitor = CallMonitor(NO_GUARANTEE)
        for seg in t.view(Consumer.ASSERTING):
            monitor.on_segment(seg)
        self.assertEqual(monitor.critical_count(), 0)

    def test_a_duplicated_hypothesis_does_not_duplicate_the_turn(self):
        t = Transcript()
        t.apply(final("hello there", 1))
        t.apply(final("hello there", 1))
        self.assertEqual(len(t.committed()), 1)

    def test_an_empty_final_commits_nothing(self):
        t = Transcript()
        t.apply(final("   ", 0))
        self.assertEqual(t.committed(), [])


class Endpointing(unittest.TestCase):
    def test_silence_closes_a_turn_the_recogniser_never_finalised(self):
        t = Transcript()
        t.apply(partial("send me something in writing", 0, channel=C, end=4_000))
        self.assertEqual(t.tick(4_000 + ENDPOINT_SILENCE_MS + 1)[0].text,
                         "send me something in writing")
        self.assertEqual(len(t.committed()), 1)

    def test_a_thinking_pause_does_not_split_a_sentence(self):
        """Everyone pauses mid-sentence.

        A turn cut in half hides a phrase that spans the cut from every
        phrase-matching rule in the product — including the compliance rules
        whose whole job is to find phrases.
        """
        t = Transcript()
        t.apply(partial("this call is being", 0, end=2_000))
        self.assertEqual(t.tick(2_400), [])
        t.apply(partial("this call is being recorded", 1, end=3_000))
        closed = t.tick(3_000 + ENDPOINT_SILENCE_MS + 1)
        self.assertEqual(len(closed), 1)
        self.assertIn("recorded", closed[0].text)

    def test_an_endpointed_turn_keeps_its_moment(self):
        """A violation has to point at when it happened, and that has to
        survive into the call player."""
        t = Transcript()
        t.apply(partial("hello", 0, start=12_000, end=13_000))
        closed = t.tick(13_000 + ENDPOINT_SILENCE_MS + 1)[0]
        self.assertEqual(closed.start_ms, 12_000)
        self.assertTrue(closed.final)


class Channels(unittest.TestCase):
    def test_a_customer_word_is_never_attributed_to_the_agent(self):
        t = Transcript()
        t.apply(final("I guarantee you'll get every penny back", 0, channel=C))

        monitor = CallMonitor(NO_GUARANTEE)
        for seg in t.view(Consumer.ASSERTING):
            monitor.on_segment(seg)

        # The customer said it. The agent did not, and a MUST_NOT_SAY rule is
        # about what the agent said.
        self.assertEqual(monitor.critical_count(), 0)

    def test_overlapping_speech_is_kept(self):
        """People talk over each other, and the moment the customer objects
        while the agent is still pitching is exactly the one worth
        reviewing."""
        t = Transcript()
        t.apply(final("and that's why the financing", 0, channel=A, start=1_000, end=4_000))
        t.apply(final("wait, how much", 1, channel=C, start=3_000, end=4_500))
        texts = [s.text for s in t.committed()]
        self.assertEqual(len(texts), 2)
        self.assertTrue(texts[0].startswith("and that's"))

    def test_turns_come_out_in_time_order_across_channels(self):
        t = Transcript()
        t.apply(final("second", 0, channel=A, start=5_000, end=6_000))
        t.apply(final("first", 1, channel=C, start=1_000, end=2_000))
        self.assertEqual([s.text for s in t.committed()], ["first", "second"])


class DecoderLoops(unittest.TestCase):
    """Whisper-family models loop on silence, music and hold tones."""

    def test_a_looping_phrase_is_collapsed(self):
        looped = "thank you for watching " * 12
        out = deloop(looped)
        self.assertEqual(out.strip(), "thank you for watching")

    def test_a_loop_would_otherwise_satisfy_a_must_say_rule(self):
        """The failure that makes this worth a module rather than a regex.

        A decoder stutter that happens to contain the disclosure marks the
        company compliant on a call where nobody said it.
        """
        rules = RuleSet("t1", [
            Rule("rec", "t1", RuleKind.MUST_SAY, Severity.CRITICAL,
                 "La grabación debe anunciarse", remedy="Dilo.",
                 phrases=("this call is being recorded",)),
        ])
        looped = "this call is being recorded " * 9
        self.assertEqual(deloop(looped).strip(), "this call is being recorded")
        # Collapsed or not, one genuine utterance still satisfies the rule —
        # the point is that the transcript records one, not nine.
        monitor = CallMonitor(rules)
        monitor.on_segment(Segment(A, deloop(looped), 1_000))
        self.assertEqual(monitor.critical_count(), 0)

    def test_genuine_repetition_is_left_alone(self):
        """People repeat themselves, and flattening it changes what they
        said."""
        self.assertEqual(deloop("no, no, no"), "no, no, no")
        self.assertEqual(deloop("yes yes"), "yes yes")

    def test_a_normal_sentence_is_untouched(self):
        s = "I hear you — nobody pays that up front, we split it over 24 months."
        self.assertEqual(deloop(s), s)


class WhatTheEnginesReceive(unittest.TestCase):
    def test_downstream_never_learns_text_arrived_in_pieces(self):
        """The ASR layer produces `Segment`s, which is what compliance,
        script and postcall already consume."""
        t = Transcript()
        t.apply(partial("this call is", 0, end=1_000))
        t.apply(partial("this call is being recorded", 1, end=2_000))
        t.apply(final("this call is being recorded", 2, start=500, end=2_000))

        segments = t.view(Consumer.ASSERTING)
        self.assertEqual(len(segments), 1)
        self.assertEqual(segments[0].speaker, A)
        self.assertEqual(segments[0].at_ms, 500)


if __name__ == "__main__":
    unittest.main()
