"""The pieces, tested for the specific ways each one fails in the field."""

from __future__ import annotations

import unittest

from copilot import CallContext, Chunk, Mode, Trigger, TriggerConfig, detect
from copilot.chunking import chunk_document
from copilot.text import numeric_facts, sentences, tokenize
from copilot.verify import DeterministicVerifier, all_of

CTX = CallContext("t", "kb", 1, Mode.A)


def chunk(text: str) -> Chunk:
    return Chunk("c1", "t", "kb", 1, "Manual", ("Sec",), text)


class Tokenising(unittest.TestCase):
    def test_identifiers_survive_intact(self):
        """Splitting SKU-4471 is how lexical search stops finding the exact
        term the customer just read off a box."""
        self.assertIn("sku-4471", tokenize("Do you carry SKU-4471?"))

    def test_accents_are_folded_so_the_manual_is_findable(self):
        self.assertEqual(tokenize("garantía"), tokenize("garantia"))

    def test_negation_is_never_dropped(self):
        """'we do not guarantee that' and 'we guarantee that' must not
        tokenise the same. A long stoplist is a retrieval bug."""
        self.assertIn("no", tokenize("no hay garantia"))
        self.assertIn("not", tokenize("we do not guarantee"))


class NumericFacts(unittest.TestCase):
    def test_the_same_amount_written_three_ways_is_one_fact(self):
        a = numeric_facts("$28,000")
        b = numeric_facts("28.000")
        c = numeric_facts("28000")
        self.assertTrue(a & b & c)

    def test_different_amounts_stay_different(self):
        self.assertFalse(numeric_facts("24 months") & numeric_facts("36 months"))

    def test_percentages_are_captured(self):
        self.assertTrue(any(f.startswith("pct:") for f in numeric_facts("30 percent")))

    def test_sentences_split_on_spanish_punctuation(self):
        self.assertEqual(len(sentences("¿Cuánto cuesta? Son $198 al mes.")), 2)


class Verification(unittest.TestCase):
    def setUp(self):
        self.v = DeterministicVerifier()
        self.ctx = [
            chunk(
                "The installation is split over 24 months at zero interest, about "
                "$198 per month. The panels carry a 25 year production warranty."
            )
        ]

    def test_a_faithful_paraphrase_passes(self):
        v = self.v.check(
            "We split the cost over 24 months at zero interest — about $198 a month.",
            self.ctx,
        )
        self.assertTrue(v.ok, v.detail)

    def test_a_changed_figure_is_named_in_the_detail(self):
        v = self.v.check("We split it over 36 months.", self.ctx)
        self.assertFalse(v.ok)
        self.assertIn("36", v.detail)

    def test_an_absent_promise_is_refused(self):
        v = self.v.check(
            "You get a full refund over 24 months if you change your mind.", self.ctx
        )
        self.assertFalse(v.ok)
        self.assertIn("refund", v.detail)

    def test_a_promise_the_material_does_make_is_allowed(self):
        v = self.v.check("The panels carry a 25 year warranty.", self.ctx)
        self.assertTrue(v.ok, v.detail)

    def test_no_context_is_never_verified(self):
        self.assertFalse(self.v.check("Anything at all.", []).ok)

    def test_a_grounding_score_is_produced_even_on_failure(self):
        """The column is NOT NULL, and the review queue sorts by this."""
        v = self.v.check("We split it over 36 months.", self.ctx)
        self.assertFalse(v.ok)
        self.assertGreaterEqual(v.grounding_score, 0.0)

    def test_the_first_refusal_in_a_chain_wins(self):
        class NeverPasses:
            def check(self, text, chunks):
                from copilot.verify import Verdict

                return Verdict(False, 0.0, "nli says no")

        chained = all_of(self.v, NeverPasses())
        v = chained.check("We split it over 24 months at zero interest.", self.ctx)
        self.assertFalse(v.ok)
        self.assertEqual(v.detail, "nli says no")

    def test_the_deterministic_layer_refuses_before_the_model_is_consulted(self):
        calls = []

        class Counting:
            def check(self, text, chunks):
                from copilot.verify import Verdict

                calls.append(text)
                return Verdict(True, 1.0)

        chained = all_of(self.v, Counting())
        chained.check("We split it over 36 months.", self.ctx)
        self.assertEqual(calls, [], "a model is never asked to overrule a rule")


class Chunking(unittest.TestCase):
    DOC = """
# Objection Handling

## 5. OBJECTIONS

### 5.3 It is too expensive

Primary response: split over 24 months.

Never say: that the price is negotiable.

### 5.4 I need to think about it

Offer to send the proposal.
"""

    def setUp(self):
        self.chunks = chunk_document(
            text=self.DOC,
            tenant_id="t",
            kb_id="kb",
            kb_version=1,
            doc_title="Objection Handling",
            doc_id="d1",
        )

    def test_headings_are_hard_boundaries(self):
        """5.3 and 5.4 must never share a chunk — that is how a copilot
        suggests the answer to a different objection."""
        for c in self.chunks:
            self.assertFalse("5.3" in c.heading_label and "5.4" in c.heading_label)

    def test_the_full_heading_path_is_kept(self):
        target = next(c for c in self.chunks if "negotiable" in c.text)
        self.assertIn("OBJECTIONS", target.heading_label)
        self.assertIn("5.3", target.heading_label)

    def test_a_prohibition_stays_with_what_it_forbids(self):
        """'Never say:' separated from its subject is how the copilot ends up
        suggesting the one sentence the manual bans."""
        target = next(c for c in self.chunks if "Never say" in c.text)
        self.assertIn("5.3", target.heading_label)

    def test_contextualised_text_situates_the_fragment(self):
        c = self.chunks[0]
        self.assertIn("Objection Handling", c.contextualised())
        self.assertIn(c.text.split()[0], c.contextualised())

    def test_ids_are_stable_across_republish(self):
        again = chunk_document(
            text=self.DOC,
            tenant_id="t",
            kb_id="kb",
            kb_version=2,
            doc_title="Objection Handling",
            doc_id="d1",
        )
        self.assertEqual([c.id for c in self.chunks], [c.id for c in again])

    def test_an_oversized_paragraph_is_split_rather_than_dropped(self):
        big = "# H\n\n" + " ".join(["word"] * 3000)
        out = chunk_document(
            text=big, tenant_id="t", kb_id="kb", kb_version=1,
            doc_title="D", doc_id="d2",
        )
        self.assertGreater(len(out), 1)
        self.assertTrue(all(len(c.text.split()) <= 900 for c in out))


class Triggers(unittest.TestCase):
    def test_an_ordinary_reply_does_not_wake_the_copilot(self):
        self.assertIsNone(detect("Yeah, sounds good to me.", CTX))

    def test_a_price_objection_fires(self):
        self.assertIs(detect("That's way too expensive.", CTX), Trigger.OBJECTION)

    def test_a_spanish_objection_fires(self):
        self.assertIs(detect("Es muy caro para mi.", CTX), Trigger.OBJECTION)

    def test_negation_does_not_flip_a_buying_signal_into_an_objection(self):
        """'not too expensive' is a customer talking themselves into it."""
        self.assertIsNot(
            detect("Honestly that's not too expensive at all.", CTX),
            Trigger.OBJECTION,
        )

    def test_a_question_fires(self):
        self.assertIs(detect("Does it work with my roof?", CTX), Trigger.QUESTION)

    def test_a_question_without_its_question_mark_still_fires(self):
        """ASR drops terminal punctuation constantly."""
        self.assertIs(detect("how long does the install take", CTX), Trigger.QUESTION)

    def test_a_tenant_keyword_outranks_the_generic_classifier(self):
        cfg = TriggerConfig(keywords=("lawyer", "abogado"))
        self.assertIs(
            detect("That's too expensive, I'll call my lawyer.", CTX, cfg),
            Trigger.KEYWORD,
        )

    def test_an_explicit_request_outranks_everything(self):
        cfg = TriggerConfig(explicit=True)
        self.assertIs(detect("", CTX, cfg), Trigger.EXPLICIT)

    def test_a_stuck_agent_is_helped_even_when_the_customer_said_nothing(self):
        ctx = CallContext("t", "kb", 1, Mode.A, agent_silence_s=4.0)
        self.assertIs(detect("", ctx), Trigger.AGENT_SILENCE)

    def test_silence_outranks_a_question_because_the_agent_is_stuck(self):
        ctx = CallContext("t", "kb", 1, Mode.A, agent_silence_s=5.0)
        self.assertIs(detect("Does it work with my roof?", ctx), Trigger.AGENT_SILENCE)


if __name__ == "__main__":
    unittest.main()


class NegationScope(unittest.TestCase):
    """Negation is the difference between rescuing a call and ruining one."""

    def test_a_refusal_followed_by_an_objection_still_fires(self):
        """'No, that's too expensive' — the 'no' belongs to the clause before
        it. Suppressing on it would silence a real objection."""
        self.assertIs(detect("No, that's too expensive.", CTX), Trigger.OBJECTION)

    def test_spanish_negated_price_is_not_an_objection(self):
        self.assertIsNot(detect("No es muy caro, la verdad.", CTX), Trigger.OBJECTION)

    def test_spanish_objections_that_start_with_no_still_fire(self):
        self.assertIs(detect("No me alcanza el presupuesto.", CTX), Trigger.OBJECTION)
        self.assertIs(detect("No me interesa, gracias.", CTX), Trigger.OBJECTION)

    def test_a_contraction_negator_is_caught(self):
        self.assertIsNot(
            detect("I don't think it's too expensive.", CTX), Trigger.OBJECTION
        )

    def test_negation_does_not_reach_across_a_full_stop(self):
        self.assertIs(
            detect("I'm not worried. That's too expensive though.", CTX),
            Trigger.OBJECTION,
        )
