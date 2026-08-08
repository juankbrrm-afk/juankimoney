"""Script adherence: named findings, not a score out of 100."""

from __future__ import annotations

import unittest

from compliance.rules import Segment, Speaker
from script import Adherence, Outcome, Script, Step, current_stage, evaluate

A = Speaker.AGENT
C = Speaker.CUSTOMER


def seg(speaker, text, at_s):
    return Segment(speaker, text, int(at_s * 1000))


SCRIPT = Script("solar-q3", "solaris", "Solar Q3", [
    Step("greet", "Saludo e identificación",
         ("this is", "le habla"),
         deadline_s=15,
         coaching="Preséntate con tu nombre y el de la empresa en los primeros 15 s."),
    Step("verify", "Verificar dirección de servicio",
         ("confirm the service address", "confirmar la direccion"),
         before=("price",), deadline_s=60,
         coaching="Confirma la dirección ANTES de hablar de precios."),
    Step("discover", "Descubrimiento: factura actual",
         ("what you're paying", "cuanto paga"),
         before=("price",),
         coaching="Pregunta la factura actual antes de dar un número."),
    Step("price", "Presentar el precio",
         ("28,000", "twenty eight thousand"),
         coaching="Da el precio completo, no por partes."),
    Step("terms", "Financiamiento",
         ("24 months", "24 meses"),
         coaching="Menciona los 24 meses sin interés justo después del precio."),
    Step("close", "Cierre y siguiente paso",
         ("send you", "te lo envio", "written proposal"),
         coaching="Cierra con un compromiso concreto y una fecha."),
    Step("competitor", "Manejo de competencia",
         ("acme solar",), required=False,
         coaching=""),
])

GOOD_CALL = [
    seg(A, "Hi Michael, this is Andrew with Solaris Energy.", 2),
    seg(A, "Can you confirm the service address ends in Palmetto Drive?", 20),
    seg(C, "That's right.", 26),
    seg(A, "And what you're paying the utility right now?", 30),
    seg(C, "Around two-forty.", 36),
    seg(A, "The system runs about 28,000 installed.", 50),
    seg(A, "Nobody pays that up front — 24 months at zero interest.", 58),
    seg(A, "I'll send you the written proposal within the hour.", 80),
]


class NamedFindingsNotAScore(unittest.TestCase):
    def test_a_clean_call_has_no_failures(self):
        a = evaluate(SCRIPT, GOOD_CALL, hangup_ms=90_000)
        self.assertEqual(a.failures, ())
        self.assertEqual(a.score, 1.0)

    def test_a_skipped_step_is_named_with_what_to_do_about_it(self):
        """'78% adherence' is a number a supervisor cannot coach from."""
        call = [s for s in GOOD_CALL if "28,000" not in s.text]
        a = evaluate(SCRIPT, call, hangup_ms=90_000)
        notes = a.coaching_notes()
        self.assertTrue(any("Presentar el precio" in n for n in notes))
        self.assertTrue(any("no por partes" in n for n in notes))

    def test_the_score_is_derived_and_offered_second(self):
        # Nobody can improve the number without improving the calls.
        call = [s for s in GOOD_CALL if "28,000" not in s.text]
        a = evaluate(SCRIPT, call, hangup_ms=90_000)
        self.assertLess(a.score, 1.0)
        self.assertEqual(len(a.failures), 1)

    def test_skips_are_coached_before_sequencing(self):
        """A conversation that opens with sequencing when the agent forgot
        the close entirely is one the agent stops listening to."""
        call = [
            seg(A, "The system runs about 28,000 installed.", 10),
            seg(A, "Hi Michael, this is Andrew.", 20),
            seg(A, "And what you're paying the utility right now?", 30),
            seg(A, "24 months at zero interest.", 40),
        ]
        a = evaluate(SCRIPT, call, hangup_ms=90_000)
        first = a.coaching_notes()[0]
        self.assertTrue(
            first.startswith("Verificar") or first.startswith("Cierre"),
            f"skips should come first, got {first!r}",
        )


class Ordering(unittest.TestCase):
    def test_pricing_before_verification_is_out_of_order_not_skipped(self):
        call = [
            seg(A, "Hi Michael, this is Andrew.", 2),
            seg(A, "The system runs about 28,000 installed.", 25),
            seg(A, "Can you confirm the service address?", 40),
            seg(A, "And what you're paying the utility right now?", 45),
            seg(A, "24 months at zero interest.", 50),
            seg(A, "I'll send you the proposal.", 70),
        ]
        a = evaluate(SCRIPT, call, hangup_ms=90_000)
        verify = next(r for r in a.results if r.step.id == "verify")
        self.assertIs(verify.outcome, Outcome.OUT_OF_ORDER)
        self.assertIn("Presentar el precio", verify.detail)

    def test_unordered_steps_never_produce_out_of_order_findings(self):
        """Treating every step as ordered produces a wall of false findings
        and agents learn the report is wrong."""
        swapped = [
            seg(A, "Hi Michael, this is Andrew.", 2),
            seg(A, "Can you confirm the service address?", 20),
            seg(A, "And what you're paying the utility right now?", 30),
            seg(A, "24 months at zero interest.", 45),   # terms before price
            seg(A, "The system runs about 28,000 installed.", 50),
            seg(A, "I'll send you the proposal.", 70),
        ]
        a = evaluate(SCRIPT, swapped, hangup_ms=90_000)
        self.assertEqual(
            [r for r in a.results if r.outcome is Outcome.OUT_OF_ORDER], []
        )

    def test_an_ordering_rule_pointing_at_nothing_is_refused(self):
        with self.assertRaises(ValueError):
            Script("s", "t", "S", [
                Step("a", "A", ("hola",), before=("ghost",), coaching="x"),
            ])


class Lateness(unittest.TestCase):
    def test_late_is_distinguished_from_skipped(self):
        # Different coaching: one agent forgot, the other buried it.
        call = [seg(A, "Hi Michael, this is Andrew.", 40), *GOOD_CALL[1:]]
        a = evaluate(SCRIPT, call, hangup_ms=90_000)
        greet = next(r for r in a.results if r.step.id == "greet")
        self.assertIs(greet.outcome, Outcome.LATE)
        self.assertIn("40 s", greet.detail)

    def test_order_is_judged_before_lateness(self):
        """Saying the right thing at the right time in the wrong sequence is a
        sequencing problem; reporting it as lateness sends the agent to fix
        the wrong thing."""
        call = [
            seg(A, "Hi Michael, this is Andrew.", 2),
            seg(A, "The system runs about 28,000 installed.", 30),
            seg(A, "Can you confirm the service address?", 90),
        ]
        a = evaluate(SCRIPT, call, hangup_ms=120_000)
        verify = next(r for r in a.results if r.step.id == "verify")
        self.assertIs(verify.outcome, Outcome.OUT_OF_ORDER)


class OptionalBranches(unittest.TestCase):
    def test_an_untaken_branch_is_never_a_failure(self):
        """Every real script has branches. Marking them required makes the
        report wrong on most calls."""
        a = evaluate(SCRIPT, GOOD_CALL, hangup_ms=90_000)
        comp = next(r for r in a.results if r.step.id == "competitor")
        self.assertIs(comp.outcome, Outcome.SKIPPED)
        self.assertFalse(comp.failed)

    def test_a_required_step_without_coaching_is_refused(self):
        with self.assertRaises(ValueError):
            Step("x", "X", ("hola",), coaching="")


class Evidence(unittest.TestCase):
    def test_a_met_step_carries_when_and_what(self):
        a = evaluate(SCRIPT, GOOD_CALL, hangup_ms=90_000)
        price = next(r for r in a.results if r.step.id == "price")
        self.assertEqual(price.at_ms, 50_000)
        self.assertIn("28,000", price.evidence)

    def test_the_customer_saying_it_does_not_credit_the_agent(self):
        call = [seg(C, "I'll send you my utility bill.", 10)]
        a = evaluate(SCRIPT, call, hangup_ms=20_000)
        close = next(r for r in a.results if r.step.id == "close")
        self.assertIs(close.outcome, Outcome.SKIPPED)

    def test_the_matcher_is_the_same_one_compliance_uses(self):
        # Two matchers means a phrase can be "said" for one module and not the
        # other, and then the panel and the report disagree in front of the
        # same supervisor.
        call = [seg(A, "Confirm the service address, please.", 10)]
        a = evaluate(SCRIPT, call, hangup_ms=20_000)
        verify = next(r for r in a.results if r.step.id == "verify")
        self.assertIs(verify.outcome, Outcome.MET)


class Stage(unittest.TestCase):
    def test_the_stage_tracks_the_furthest_step_reached(self):
        partial = GOOD_CALL[:6]
        self.assertEqual(current_stage(SCRIPT, partial).id, "price")

    def test_a_call_that_has_not_started_has_no_stage(self):
        self.assertIsNone(current_stage(SCRIPT, []))

    def test_the_stage_is_what_the_copilot_uses_to_stay_in_step(self):
        """A copilot offering closing material during discovery is worse than
        a silent one."""
        self.assertEqual(current_stage(SCRIPT, GOOD_CALL[:4]).id, "discover")


if __name__ == "__main__":
    unittest.main()
