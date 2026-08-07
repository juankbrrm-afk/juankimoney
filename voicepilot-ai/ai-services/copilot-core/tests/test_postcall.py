"""Post-call analysis: traceable, or it does not exist.

The failure this module guards against is quieter than the copilot's. Nobody
listens back to the recording. The supervisor reads the summary, believes it,
and coaches from it — so a fabricated objection becomes a training priority
and a fabricated commitment becomes a promise the company never made.
"""

from __future__ import annotations

import unittest

from compliance.rules import Segment, Speaker
from postcall import (
    CallAnalysis,
    Disposition,
    Draft,
    Extraction,
    Item,
    Kind,
    analyse,
    crm_writes,
    talk_metrics,
)

A = Speaker.AGENT
C = Speaker.CUSTOMER


def seg(speaker, text, at_s):
    return Segment(speaker, text, int(at_s * 1000))


CALL = [
    seg(A, "Hi Michael, this is Andrew with Solaris Energy.", 1),
    seg(C, "It's fine. What's this about?", 6),
    seg(A, "We're finishing installs on your street and I wanted to check "
           "what you're paying the utility right now.", 9),
    seg(C, "Somewhere around two-forty a month, I think.", 15),
    seg(A, "The system for a home your size runs about 28,000 installed.", 34),
    seg(C, "Whoa. That's a lot more than I wanted to spend.", 40),
    seg(A, "Nobody pays that up front — we split it over 24 months at zero "
           "interest, about 198 a month.", 47),
    seg(C, "Okay, that's not what I expected. What's the catch?", 59),
    seg(A, "No catch. The panels carry a 25 year warranty.", 68),
    seg(C, "Send me something in writing and I'll look at it this week.", 79),
    seg(A, "Done. I'll have it in your inbox within the hour.", 84),
]


class Faithful:
    """Quotes the transcript. What a well-behaved model looks like."""

    def summarise(self, *, segments, compliance_rule_ids):
        return Draft(
            summary="Homeowner paying ~$240/month. Objected at $28,000, "
                    "resolved with 24-month financing. Asked for a written "
                    "proposal this week.",
            summary_quotes=(
                "Somewhere around two-forty a month",
                "Send me something in writing and I'll look at it this week",
            ),
            extractions=(
                Extraction(Kind.OBJECTION, "Price objection at $28,000",
                           "That's a lot more than I wanted to spend"),
                Extraction(Kind.NEXT_STEP, "Send written proposal within the hour",
                           "I'll have it in your inbox within the hour"),
                Extraction(Kind.KEY_POINT, "Current utility bill ~$240/month",
                           "Somewhere around two-forty a month"),
            ),
            disposition="Interested — proposal sent",
            disposition_quote="Send me something in writing and I'll look at it",
        )


class Inventive:
    """Describes a call that did not happen, in fluent, plausible prose."""

    def summarise(self, *, segments, compliance_rule_ids):
        return Draft(
            summary="Customer agreed to sign today and requested expedited install.",
            summary_quotes=("Somewhere around two-forty a month",),
            extractions=(
                Extraction(Kind.COMMITMENT, "Customer agreed to sign today",
                           "Yes, let's go ahead and sign the paperwork now"),
                Extraction(Kind.OBJECTION, "Objected to the installation timeline",
                           "I need it installed before the end of the month"),
                Extraction(Kind.NEXT_STEP, "Send written proposal within the hour",
                           "I'll have it in your inbox within the hour"),
            ),
        )


class Anchorless:
    def summarise(self, *, segments, compliance_rule_ids):
        return Draft(
            summary="A great call, very positive throughout.",
            summary_quotes=("The customer was delighted with everything",),
            extractions=(),
        )


def run(summariser=None):
    return analyse(
        call_id="call-1",
        tenant_id="solaris",
        segments=CALL,
        summariser=summariser or Faithful(),
        compliance_rule_ids=("verify",),
        hangup_ms=90_000,
    )


class Traceability(unittest.TestCase):
    def test_every_item_resolves_to_a_moment_in_the_call(self):
        """docs/06 §6: the supervisor clicks the objection and jumps to that
        second of the recording."""
        a = run()
        self.assertTrue(a.items)
        for item in a.items:
            self.assertGreater(item.at_ms, 0)
            self.assertTrue(item.quote)

    def test_the_timestamp_is_the_moment_it_was_said(self):
        a = run()
        objection = a.of(Kind.OBJECTION)[0]
        self.assertEqual(objection.at_ms, 40_000)
        self.assertEqual(objection.speaker, "customer")

    def test_an_item_cannot_be_constructed_without_a_quote(self):
        with self.assertRaises(ValueError):
            Item(Kind.OBJECTION, "Price objection", "", 40_000, "customer")

    def test_the_reading_and_the_evidence_are_both_kept(self):
        """A supervisor has to be able to disagree with the AI's conclusion,
        which means seeing the words it concluded it from."""
        a = run()
        item = a.of(Kind.KEY_POINT)[0]
        self.assertNotEqual(item.text, item.quote)
        self.assertIn("two-forty", item.quote)


class Invention(unittest.TestCase):
    def test_an_event_that_never_happened_is_dropped(self):
        a = run(Inventive())
        texts = [i.text for i in a.items]
        self.assertNotIn("Customer agreed to sign today", texts)
        self.assertNotIn("Objected to the installation timeline", texts)

    def test_what_was_actually_said_still_survives(self):
        """The guarantee is worthless if it also discards the true items."""
        a = run(Inventive())
        self.assertEqual([i.text for i in a.items],
                         ["Send written proposal within the hour"])

    def test_drops_are_counted_not_hidden(self):
        """A rising count is the earliest signal the model has drifted."""
        self.assertEqual(run(Inventive()).rejected, 2)
        self.assertEqual(run().rejected, 0)

    def test_a_summary_anchored_to_nothing_is_refused_outright(self):
        with self.assertRaises(ValueError):
            run(Anchorless())

    def test_a_short_quote_is_not_a_quote(self):
        """Three words appear in every transcript by chance. A model could
        anchor an invented objection to the word 'price' and pass."""

        class Cheat:
            def summarise(self, *, segments, compliance_rule_ids):
                return Draft(
                    summary="s",
                    summary_quotes=("Somewhere around two-forty a month",),
                    extractions=(Extraction(Kind.OBJECTION, "Price objection", "a month"),),
                )

        self.assertEqual(run(Cheat()).items, ())

    def test_an_invented_disposition_does_not_become_one(self):
        class Wrong:
            def summarise(self, *, segments, compliance_rule_ids):
                return Draft(
                    summary="s",
                    summary_quotes=("Somewhere around two-forty a month",),
                    extractions=(),
                    disposition="Closed Won",
                    disposition_quote="I'll take it, where do I sign",
                )

        self.assertIsNone(run(Wrong()).disposition)


class TheHumanDecides(unittest.TestCase):
    def test_a_disposition_starts_unconfirmed(self):
        a = run()
        self.assertIsNotNone(a.disposition)
        self.assertFalse(a.disposition.confirmed_by_agent)
        self.assertFalse(a.disposition.writable())

    def test_an_unconfirmed_disposition_is_never_written(self):
        """An auto-applied disposition is how a pipeline fills with outcomes
        nobody chose, and a forecast built on those becomes fiction."""
        writes = crm_writes(run())
        self.assertNotIn("lead", [w.entity for w in writes])

    def test_once_the_agent_confirms_it_is_written(self):
        from dataclasses import replace

        a = run()
        a = CallAnalysis(
            **{**a.__dict__,
               "disposition": replace(a.disposition, confirmed_by_agent=True)}
        )
        writes = crm_writes(a)
        lead = next(w for w in writes if w.entity == "lead")
        self.assertEqual(lead.payload["disposition"], "Interested — proposal sent")


class ComplianceIsNotRecomputed(unittest.TestCase):
    def test_the_live_verdict_is_carried_over_unchanged(self):
        """'The panel said one thing and the report says another' destroys
        trust in both faster than either being wrong alone."""
        self.assertEqual(run().compliance_rule_ids, ("verify",))


class Metrics(unittest.TestCase):
    def test_talk_ratio_is_arithmetic_not_a_model(self):
        m = talk_metrics(CALL, hangup_ms=90_000)
        self.assertGreater(m.agent_ms, 0)
        self.assertGreater(m.customer_ms, 0)
        self.assertTrue(0.0 < m.talk_ratio < 1.0)

    def test_a_gap_in_the_transcript_becomes_silence_not_a_monologue(self):
        """Without the cap, one gap makes the talk ratio meaningless — and
        coaching decisions are made from the talk ratio."""
        sparse = [seg(A, "Hello there Michael.", 0), seg(C, "Yes hello.", 300)]
        m = talk_metrics(sparse, hangup_ms=310_000)
        self.assertLessEqual(m.agent_ms, 30_000)
        self.assertGreater(m.silence_ms, 200_000)

    def test_interruptions_are_counted(self):
        overlap = [seg(A, "So what I wanted to say is", 10),
                   seg(C, "No, listen to me", 10.4)]
        self.assertEqual(talk_metrics(overlap, hangup_ms=20_000).interruptions, 1)


class WhatReachesTheCrm(unittest.TestCase):
    def test_the_note_carries_its_anchors_into_the_crm(self):
        """So a supervisor reading it inside Salesforce can still jump into
        the recording."""
        note = next(w for w in crm_writes(run()) if w.entity == "note")
        anchors = note.payload["anchors"]
        self.assertTrue(anchors)
        self.assertIn("at_ms", anchors[0])

    def test_next_steps_become_tasks_with_their_evidence(self):
        task = next(w for w in crm_writes(run()) if w.entity == "task")
        self.assertEqual(task.payload["title"], "Send written proposal within the hour")
        self.assertTrue(task.payload["evidence"])

    def test_the_writes_are_canonical_not_crm_specific(self):
        """The adapter layer decides what the tenant's CRM can accept. This
        module never learns which CRM it is talking to."""
        for w in crm_writes(run()):
            self.assertIn(w.entity, {"note", "task", "lead"})
            self.assertIn(w.operation, {"create", "update"})


class TheExitCriterion(unittest.TestCase):
    """docs/10 §1.8: key-point coverage > 90% vs human QA."""

    #: What a human reviewer marked as the points that mattered.
    HUMAN_QA = {
        "Current utility bill ~$240/month",
        "Price objection at $28,000",
        "Send written proposal within the hour",
    }

    def test_coverage_against_human_qa(self):
        found = {i.text for i in run().items}
        coverage = len(found & self.HUMAN_QA) / len(self.HUMAN_QA)
        self.assertGreaterEqual(coverage, 0.90, f"coverage {coverage:.0%}")

    def test_the_grounding_check_does_not_cost_coverage(self):
        """The number that would make this module a bad trade: if refusing
        inventions also refused true findings, the guarantee would be paid
        for in usefulness."""
        faithful = {i.text for i in run().items}
        inventive = {i.text for i in run(Inventive()).items}
        self.assertTrue(inventive <= faithful | self.HUMAN_QA)
        self.assertEqual(len(faithful & self.HUMAN_QA), len(self.HUMAN_QA))


if __name__ == "__main__":
    unittest.main()
