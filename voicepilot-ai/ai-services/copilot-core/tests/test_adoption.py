"""Copilot adoption: the number that decides whether this gets renewed.

It is also the easiest number in the product to inflate, so most of these
tests are about the ways it could read high when nothing happened.
"""

from __future__ import annotations

import unittest

from compliance.rules import Segment, Speaker
from postcall.adoption import (
    ADOPTED_SHARE,
    Adoption,
    WINDOW_MS,
    measure,
    report,
)

A = Speaker.AGENT
C = Speaker.CUSTOMER

SUGGESTION = (
    "Nobody pays the full amount up front. The installation is split over "
    "24 months at zero interest, which for a typical home works out to "
    "about $198 per month."
)


def seg(speaker, text, at_s):
    return Segment(speaker, text, int(at_s * 1000))


class WhenTheAgentUsesIt(unittest.TestCase):
    def test_a_restated_suggestion_counts_as_adopted(self):
        """Agents restate, they do not read aloud.

        A measure that only fires on a verbatim match would report ~0%
        adoption on every real call and the feature would be deleted as
        useless.
        """
        call = [
            seg(A, "So the system runs about 28,000 installed.", 36),
            seg(C, "Whoa. That's a lot more than I wanted to spend.", 43),
            seg(A, "I hear you — nobody pays that up front. We split it over "
                   "24 months at zero interest.", 48),
        ]
        use = measure("s1", SUGGESTION, 43_000, call)
        self.assertIs(use.outcome, Adoption.ADOPTED)
        self.assertEqual(use.at_ms, 48_000)
        self.assertIn("interest", use.terms)

    def test_the_evidence_is_kept(self):
        """A supervisor disputing "adopted" can see what it rested on.

        The same rule the copilot's citations follow: a claim the product
        makes about somebody's work has to be inspectable, or the first
        disagreement ends with the whole report being distrusted.
        """
        call = [seg(A, "We split it over 24 months at zero interest.", 48)]
        use = measure("s1", SUGGESTION, 43_000, call)
        self.assertTrue(set(use.terms) <= {"split", "24", "month", "zero", "interest"})
        self.assertGreater(len(use.terms), 0)


class WhenItLooksLikeAdoptionAndIsNot(unittest.TestCase):
    def test_an_on_topic_sentence_is_not_adoption(self):
        """The failure an embedding-based measure makes.

        The agent is talking about financing because the customer asked about
        financing. Semantic similarity scores this high; it is not evidence
        anybody read the panel.
        """
        call = [
            seg(C, "That's a lot more than I wanted to spend.", 43),
            seg(A, "Right, and there are options — let me pull up what your "
                   "neighbours went with.", 48),
        ]
        self.assertIs(measure("s1", SUGGESTION, 43_000, call).outcome, Adoption.IGNORED)

    def test_a_suggestion_the_agent_already_knew_is_not_adoption(self):
        """Good agents know their rebuttals.

        Counting the later overlap inflates the metric precisely in the
        accounts with the best agents — the ones most likely to notice.
        """
        call = [
            seg(A, "Nobody pays the full amount up front — we split the "
                   "installation over 24 months at zero interest, about "
                   "$198 per month for a typical home.", 20),
            seg(C, "That's a lot more than I wanted to spend.", 43),
            seg(A, "Like I said, split over 24 months at zero interest.", 48),
        ]
        self.assertIs(
            measure("s1", SUGGESTION, 43_000, call).outcome,
            Adoption.ALREADY_KNEW,
        )

    def test_a_turn_past_the_window_does_not_count(self):
        """Past the window the agent has moved on, and a match measures the
        script rather than the panel."""
        late = 43 + (WINDOW_MS / 1000) + 5
        call = [
            seg(C, "That's a lot more than I wanted to spend.", 43),
            seg(A, "We split it over 24 months at zero interest, about $198 "
                   "a month.", late),
        ]
        self.assertIs(measure("s1", SUGGESTION, 43_000, call).outcome, Adoption.IGNORED)

    def test_the_customer_repeating_it_is_not_the_agent_using_it(self):
        call = [
            seg(C, "So it's split over 24 months at zero interest?", 48),
        ]
        self.assertIs(measure("s1", SUGGESTION, 43_000, call).outcome, Adoption.IGNORED)

    def test_an_empty_suggestion_does_not_score_perfectly(self):
        """An empty denominator resolving to 100% is how a metric ends up
        looking flawless on the calls where it measured nothing."""
        use = measure("s1", "   ", 43_000, [seg(A, "anything at all", 48)])
        self.assertIs(use.outcome, Adoption.IGNORED)
        self.assertEqual(use.share, 0.0)


class PartialUse(unittest.TestCase):
    def test_a_partial_restatement_is_echoed_not_adopted(self):
        """Worth showing a supervisor, not worth counting as a win.

        Collapsing this into "used" is the single easiest way to make the
        number go up without anything changing on the floor.
        """
        call = [
            seg(C, "That's a lot more than I wanted to spend.", 43),
            seg(A, "Well, it splits over 24 months — nobody pays it in one go.", 48),
        ]
        use = measure("s1", SUGGESTION, 43_000, call)
        self.assertIs(use.outcome, Adoption.ECHOED)
        self.assertLess(use.share, ADOPTED_SHARE)

    def test_two_shared_words_are_not_an_echo(self):
        """A long suggestion and a short sentence overlapping on its single
        most obvious term is coincidence, not evidence.

        The agent knows the financing is interest-free; saying so does not
        show they read anything. Reporting this as partial use is how the
        metric drifts upward without the floor changing.
        """
        call = [
            seg(C, "That's a lot more than I wanted to spend.", 43),
            seg(A, "There's zero interest on it, if that helps.", 48),
        ]
        self.assertIs(measure("s1", SUGGESTION, 43_000, call).outcome, Adoption.IGNORED)

    def test_the_best_matching_turn_wins(self):
        call = [
            seg(C, "That's a lot more than I wanted to spend.", 43),
            seg(A, "Hang on.", 45),
            seg(A, "Nobody pays it up front — split over 24 months at zero "
                   "interest, about $198 a month.", 50),
            seg(A, "Anyway.", 60),
        ]
        use = measure("s1", SUGGESTION, 43_000, call)
        self.assertIs(use.outcome, Adoption.ADOPTED)
        self.assertEqual(use.at_ms, 50_000)


class TheReport(unittest.TestCase):
    def test_a_call_with_no_suggestions_has_no_rate(self):
        """Not 0%.

        Rendering an undefined rate as zero tells a customer their agents
        ignore the copilot on a call where it never spoke — the same rule as
        the close model's "calibrating" beating an invented 73%.
        """
        r = report([], [seg(A, "hello", 1)])
        self.assertIsNone(r.rate)
        self.assertEqual(r.summary(), "sin sugerencias que medir")

    def test_already_known_suggestions_leave_the_denominator(self):
        """Otherwise a copilot that offers a good agent things they already
        say scores as being ignored."""
        call = [
            seg(A, "Nobody pays the full amount up front, split over 24 "
                   "months at zero interest, about $198 per month for a "
                   "typical home.", 20),
            seg(C, "Too expensive.", 43),
            seg(A, "As I mentioned — 24 months, zero interest.", 48),
        ]
        r = report([("s1", SUGGESTION, 43_000)], call)
        self.assertIsNone(r.rate)
        # And the summary distinguishes this from "nothing was offered". The
        # finding is that the copilot worked and the agent did not need it,
        # which is a knowledge-base result rather than an adoption problem.
        self.assertIn("ya había dicho", r.summary())
        self.assertNotIn("sin sugerencias", r.summary())

    def test_an_ignored_suggestion_is_reportable(self):
        """The temptation is to loosen the threshold until adoption looks
        good. A number that only moves up is not a measurement, and a copilot
        being ignored usually means the knowledge base is wrong."""
        call = [
            seg(C, "Too expensive.", 43),
            seg(A, "Let me check with my manager.", 48),
        ]
        r = report([("s1", SUGGESTION, 43_000)], call)
        self.assertEqual(r.rate, 0.0)
        self.assertEqual(r.adopted, 0)
        self.assertIn("0/1", r.summary())


if __name__ == "__main__":
    unittest.main()
