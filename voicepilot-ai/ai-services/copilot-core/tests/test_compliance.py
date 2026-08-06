"""Compliance: the rules, the clock, and the noise budget.

Every test here is a specific way a compliance module stops protecting the
company — usually not by missing a violation, but by raising so many that the
agent stops reading the panel.
"""

from __future__ import annotations

import unittest

from compliance.backtest import (
    Accuracy,
    LabelledCall,
    NOISY_THRESHOLD,
    backtest,
    measure,
)
from compliance.engine import (
    LIVE_ALERT_BUDGET,
    CallMonitor,
    NoClassifier,
    phrase_hit,
    run_call,
)
from compliance.rules import (
    Kind,
    Rule,
    RuleSet,
    Segment,
    Severity,
    Speaker,
    Violation,
)

A = Speaker.AGENT
C = Speaker.CUSTOMER


def seg(speaker, text, at_s):
    return Segment(speaker, text, int(at_s * 1000))


RECORDING = Rule(
    id="rec",
    tenant_id="solaris",
    kind=Kind.MUST_SAY,
    severity=Severity.CRITICAL,
    title="La grabación debe anunciarse",
    remedy="Di: «esta llamada está siendo grabada».",
    phrases=("this call is being recorded", "esta llamada esta siendo grabada"),
    authority="Two-party consent · FL §934.03",
)

VERIFY = Rule(
    id="verify",
    tenant_id="solaris",
    kind=Kind.MUST_SAY_BEFORE,
    severity=Severity.WARNING,
    title="Verificar identidad antes del minuto 1",
    remedy="Confirma la dirección de servicio antes de hablar de precios.",
    phrases=("confirm the service address", "confirmar la direccion"),
    deadline_s=60,
)

NO_GUARANTEE = Rule(
    id="noguar",
    tenant_id="solaris",
    kind=Kind.MUST_NOT_SAY,
    severity=Severity.CRITICAL,
    title="No prometer garantías inexistentes",
    remedy="Retráctate ahora: «para ser preciso, la garantía cubre…».",
    phrases=("i guarantee", "money back", "te garantizo", "devolucion total"),
    authority="FTC Act §5 · publicidad engañosa",
)

PRICE_THEN_TERMS = Rule(
    id="terms",
    tenant_id="solaris",
    kind=Kind.CONDITIONAL,
    severity=Severity.WARNING,
    title="Si mencionas precio, menciona el financiamiento",
    remedy="Añade: «se divide en 24 meses sin interés».",
    when_mentioned=("28,000", "twenty eight thousand"),
    phrases=("24 months", "zero interest", "24 meses"),
    window_s=30,
)

TIP = Rule(
    id="tip",
    tenant_id="solaris",
    kind=Kind.MUST_SAY,
    severity=Severity.INFO,
    title="Menciona el vencimiento del crédito federal",
    phrases=("december 31", "31 de diciembre"),
)

FULL = RuleSet("solaris", [RECORDING, VERIFY, NO_GUARANTEE, PRICE_THEN_TERMS, TIP])


class RuleValidity(unittest.TestCase):
    def test_a_critical_rule_must_tell_the_agent_what_to_do(self):
        """A red band with a sound and no instruction is an interruption."""
        with self.assertRaises(ValueError):
            Rule("x", "t", Kind.MUST_SAY, Severity.CRITICAL, "Algo", phrases=("hola",))

    def test_a_deadline_rule_without_a_deadline_is_refused(self):
        with self.assertRaises(ValueError):
            Rule("x", "t", Kind.MUST_SAY_BEFORE, Severity.WARNING, "T",
                 phrases=("hola",))

    def test_a_conditional_with_no_trigger_can_never_arm(self):
        with self.assertRaises(ValueError):
            Rule("x", "t", Kind.CONDITIONAL, Severity.WARNING, "T", phrases=("hola",))

    def test_a_rule_with_no_phrases_matches_nothing(self):
        with self.assertRaises(ValueError):
            Rule("x", "t", Kind.MUST_SAY, Severity.WARNING, "T")

    def test_a_rule_set_refuses_another_tenants_rule(self):
        other = Rule("z", "northwind", Kind.MUST_SAY, Severity.WARNING, "T",
                     phrases=("hola",))
        with self.assertRaises(ValueError):
            RuleSet("solaris", [other])


class PhraseMatching(unittest.TestCase):
    def test_accents_and_casing_do_not_decide_compliance(self):
        self.assertIsNotNone(phrase_hit("CONFIRMAR LA DIRECCIÓN", ("confirmar la direccion",)))

    def test_word_order_is_part_of_the_obligation(self):
        """A bag of words would let 'we do not guarantee a refund' satisfy a
        rule looking for 'guarantee a refund'."""
        self.assertIsNone(phrase_hit("refund a guarantee we never", ("guarantee a refund",)))

    def test_a_phrase_inside_a_larger_sentence_matches(self):
        self.assertIsNotNone(
            phrase_hit("Just so you know, this call is being recorded, okay?",
                       ("this call is being recorded",))
        )


class TheDeterministicLayer(unittest.TestCase):
    def test_a_forbidden_promise_is_caught_immediately(self):
        m = CallMonitor(FULL)
        out = m.on_segment(seg(A, "I guarantee you get every penny back.", 40))
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0].rule_id, "noguar")
        self.assertEqual(out[0].layer, "deterministic")

    def test_the_violation_carries_the_words_that_caused_it(self):
        """A violation a compliance officer cannot read back is one they can
        neither defend nor dismiss."""
        m = CallMonitor(FULL)
        out = m.on_segment(seg(A, "Look, I guarantee it, no risk.", 40))
        self.assertIn("guarantee", out[0].evidence)
        self.assertTrue(out[0].authority)

    def test_the_violation_carries_where_in_the_call_it_happened(self):
        m = CallMonitor(FULL)
        out = m.on_segment(seg(A, "I guarantee it.", 145))
        self.assertEqual(out[0].at_ms, 145_000)

    def test_the_customer_saying_it_is_not_the_agent_saying_it(self):
        m = CallMonitor(FULL)
        self.assertEqual(m.on_segment(seg(C, "Do you guarantee that?", 40)), [])

    def test_the_same_rule_does_not_fire_twice_in_one_call(self):
        """Repeating the same red band is the noise that trains agents to
        stop looking."""
        m = CallMonitor(FULL)
        m.on_segment(seg(A, "I guarantee it.", 40))
        m.on_segment(seg(A, "Really, I guarantee it.", 50))
        self.assertEqual(m.critical_count(), 1)


class TheClock(unittest.TestCase):
    def test_a_deadline_fires_during_silence(self):
        """The most common critical rule in this industry is the identity
        verification that never happened. A monitor that only reacts to
        speech never reports it."""
        m = CallMonitor(FULL)
        m.on_segment(seg(A, "Hi Michael, how's your afternoon?", 5))
        self.assertEqual(m.tick(30_000), [])
        out = m.tick(61_000)
        self.assertEqual([v.rule_id for v in out], ["verify"])

    def test_saying_it_in_time_produces_no_violation(self):
        m = CallMonitor(FULL)
        m.on_segment(seg(A, "Can you confirm the service address?", 25))
        self.assertEqual(m.tick(90_000), [])

    def test_the_deadline_violation_is_stamped_at_the_deadline(self):
        m = CallMonitor(FULL)
        out = m.tick(120_000)
        v = next(v for v in out if v.rule_id == "verify")
        self.assertEqual(v.at_ms, 60_000, "not at the moment we noticed")

    def test_a_must_say_is_only_judged_at_hangup(self):
        m = CallMonitor(FULL)
        m.on_segment(seg(A, "Thanks for your time.", 300))
        self.assertEqual([v.rule_id for v in m.tick(299_000)], [])
        out = m.on_hangup(310_000)
        self.assertIn("rec", [v.rule_id for v in out])


class ConditionalRules(unittest.TestCase):
    def test_price_without_terms_violates_after_the_window(self):
        m = CallMonitor(FULL)
        m.on_segment(seg(A, "The system runs about 28,000 installed.", 100))
        self.assertEqual(m.tick(110_000), [])
        out = m.tick(135_000)
        self.assertEqual([v.rule_id for v in out], ["terms"])

    def test_price_and_terms_in_the_same_breath_is_the_normal_case(self):
        m = CallMonitor(FULL)
        m.on_segment(
            seg(A, "It's 28,000, and nobody pays that up front — 24 months at "
                   "zero interest.", 100)
        )
        self.assertEqual(m.tick(200_000), [])

    def test_terms_given_inside_the_window_discharge_the_obligation(self):
        m = CallMonitor(FULL)
        m.on_segment(seg(A, "About 28,000 installed.", 100))
        m.on_segment(seg(A, "But we split it over 24 months.", 115))
        self.assertEqual(m.tick(200_000), [])

    def test_an_armed_obligation_still_fires_if_the_call_ends_first(self):
        """Hanging up is not a way to satisfy a disclosure."""
        m = CallMonitor(FULL)
        m.on_segment(seg(A, "About 28,000 installed.", 100))
        out = m.on_hangup(105_000)
        self.assertIn("terms", [v.rule_id for v in out])


class TheSemanticLayer(unittest.TestCase):
    """The asymmetry: the model may excuse a miss, never suppress a hit."""

    class Excuses:
        def covers(self, text, phrases):
            return "recording" in text.lower()

        def violates(self, text, phrases):
            return False, ""

    class Accuses:
        def covers(self, text, phrases):
            return False

        def violates(self, text, phrases):
            if "every penny" in text.lower():
                return True, text
            return False, ""

    def test_the_agent_saying_it_in_their_own_words_is_accepted(self):
        m = CallMonitor(FULL, self.Excuses())
        m.on_segment(seg(A, "Heads up, we keep a recording of these calls.", 10))
        self.assertNotIn("rec", [v.rule_id for v in m.on_hangup(300_000)])

    def test_a_creative_promise_the_rules_missed_is_caught(self):
        m = CallMonitor(FULL, self.Accuses())
        out = m.on_segment(seg(A, "You will get every penny back, promise.", 40))
        self.assertEqual([v.rule_id for v in out], ["noguar"])
        self.assertEqual(out[0].layer, "semantic")

    def test_the_model_can_never_suppress_a_violation_the_rules_found(self):
        """A model failure degrades in one direction only: more alerts, never
        fewer, on the rules that carry legal exposure."""

        class Denies:
            def covers(self, text, phrases):
                return True  # claims everything is covered

            def violates(self, text, phrases):
                return False, ""  # and nothing is ever a violation

        m = CallMonitor(FULL, Denies())
        out = m.on_segment(seg(A, "I guarantee it.", 40))
        self.assertEqual([v.rule_id for v in out], ["noguar"])

    def test_running_without_a_model_is_reported_not_assumed(self):
        self.assertFalse(CallMonitor(FULL).semantic_enabled)
        self.assertTrue(CallMonitor(FULL, self.Accuses()).semantic_enabled)


class TheNoiseBudget(unittest.TestCase):
    """The number that decides whether any of this protects anyone."""

    def _many(self) -> RuleSet:
        rules = [
            Rule(f"w{i}", "solaris", Kind.MUST_SAY, Severity.WARNING,
                 f"Regla {i}", phrases=(f"frase inexistente {i}",))
            for i in range(8)
        ]
        return RuleSet("solaris", [NO_GUARANTEE, *rules])

    def test_never_more_than_three_alerts_reach_the_agent(self):
        m = run_call(
            self._many(),
            [seg(A, "I guarantee it.", 40)],
            hangup_ms=300_000,
        )
        self.assertLessEqual(len(m.live_alerts()), LIVE_ALERT_BUDGET)

    def test_what_the_budget_defers_is_kept_for_the_report(self):
        m = run_call(self._many(), [seg(A, "I guarantee it.", 40)], hangup_ms=300_000)
        self.assertGreater(len(m.report()), len(m.live_alerts()))
        self.assertTrue(any(v.deferred_to_report for v in m.report()))

    def test_the_critical_alert_is_the_one_that_survives(self):
        m = run_call(self._many(), [seg(A, "I guarantee it.", 40)], hangup_ms=300_000)
        self.assertEqual(m.live_alerts()[0].severity, Severity.CRITICAL)

    def test_an_info_rule_never_appears_during_the_call(self):
        """docs/06 §4: info goes in the post-call report only. An agent
        interrupted mid-sentence with an improvement tip learns to ignore the
        panel that also carries the legal alerts."""
        m = run_call(FULL, [seg(A, "Confirm the service address?", 10)],
                     hangup_ms=300_000)
        self.assertIn("tip", [v.rule_id for v in m.report()])
        self.assertNotIn("tip", [v.rule_id for v in m.live_alerts()])

    def test_a_late_critical_alert_still_reaches_the_agent(self):
        """The bug this test exists for.

        The first implementation spent the budget in arrival order. Three
        warnings early in the call filled it, and the critical legal alert at
        second 200 was silently deferred to a report nobody reads during a
        call — the exact alert a regulator would later ask about, hidden
        behind three notes about script completeness.

        The budget is a ranking, not a queue.
        """
        early = [
            Rule(f"w{i}", "solaris", Kind.MUST_NOT_SAY, Severity.WARNING,
                 f"Advertencia {i}", phrases=("good afternoon",))
            for i in range(3)
        ]
        rules = RuleSet("solaris", [*early, NO_GUARANTEE])
        m = run_call(
            rules,
            [seg(A, "Good afternoon, this is Andrew.", 5),
             seg(A, "I guarantee you money back.", 200)],
            hangup_ms=300_000,
        )
        self.assertEqual(len(m.live_alerts()), LIVE_ALERT_BUDGET)
        self.assertIn("noguar", [v.rule_id for v in m.live_alerts()])

    def test_deferral_is_decided_at_render_time_not_at_raise_time(self):
        early = [
            Rule(f"w{i}", "solaris", Kind.MUST_NOT_SAY, Severity.WARNING,
                 f"Advertencia {i}", phrases=("good afternoon",))
            for i in range(3)
        ]
        m = run_call(
            RuleSet("solaris", [*early, NO_GUARANTEE]),
            [seg(A, "Good afternoon.", 5), seg(A, "I guarantee it.", 200)],
            hangup_ms=300_000,
        )
        crit = next(v for v in m.report() if v.rule_id == "noguar")
        self.assertFalse(crit.deferred_to_report)
        self.assertEqual(sum(1 for v in m.report() if v.deferred_to_report), 1)

    def test_the_budget_is_a_constant_not_a_setting(self):
        self.assertEqual(LIVE_ALERT_BUDGET, 3)


class BeforeARuleIsActivated(unittest.TestCase):
    HISTORY = [
        [seg(A, "This call is being recorded. Confirm the service address?", 10),
         seg(A, "It's 28,000 over 24 months at zero interest.", 100)],
        [seg(A, "This call is being recorded.", 8),
         seg(A, "Confirm the service address?", 20),
         seg(A, "About 28,000, split over 24 months.", 90)],
        [seg(A, "This call is being recorded. Confirm the service address?", 12),
         seg(A, "I guarantee you money back.", 80)],
    ]

    def test_a_rule_that_never_fires_is_reported_as_such(self):
        candidate = Rule("never", "solaris", Kind.MUST_NOT_SAY, Severity.WARNING,
                         "Nunca mencionar la competencia",
                         phrases=("acme solar", "competidor"))
        r = backtest(candidate, RuleSet("solaris", []), self.HISTORY)
        self.assertEqual(r.calls_with_alert, 0)
        self.assertIn("never have fired", r.verdict())

    def test_a_rule_that_would_flood_the_panel_is_flagged(self):
        candidate = Rule("flood", "solaris", Kind.MUST_NOT_SAY, Severity.WARNING,
                         "No decir 'llamada'", phrases=("call",))
        r = backtest(candidate, RuleSet("solaris", []), self.HISTORY)
        self.assertTrue(r.noisy)
        self.assertGreater(r.hit_rate, NOISY_THRESHOLD)

    def test_the_cost_of_a_new_rule_is_what_it_displaces(self):
        """The number people forget. The panel holds three; a fourth means an
        agent stops seeing something they used to see."""
        base = RuleSet("solaris", [
            Rule(f"w{i}", "solaris", Kind.MUST_NOT_SAY, Severity.WARNING,
                 f"R{i}", phrases=("recorded",))
            for i in range(3)
        ])
        candidate = Rule("crit", "solaris", Kind.MUST_NOT_SAY, Severity.CRITICAL,
                         "Crítica nueva", remedy="Retráctate.",
                         phrases=("recorded",))
        r = backtest(candidate, base, self.HISTORY)
        self.assertGreater(r.calls_where_it_displaced_another, 0)
        self.assertIn("displace", r.verdict())

    def test_no_history_is_never_a_green_light(self):
        candidate = Rule("x", "solaris", Kind.MUST_NOT_SAY, Severity.WARNING,
                         "T", phrases=("hola",))
        r = backtest(candidate, RuleSet("solaris", []), [])
        self.assertIn("Do not activate blind", r.verdict())


class TheExitCriterion(unittest.TestCase):
    """docs/10 §1.7: recall > 0.95 on critical rules. docs/06 §7 adds
    precision > 0.85, and the two are never averaged — a false negative is a
    fine and a false positive is an agent who stops reading."""

    LABELLED = [
        LabelledCall(
            (seg(A, "This call is being recorded.", 5),
             seg(A, "I guarantee you money back.", 60)),
            frozenset({"noguar"}),
        ),
        LabelledCall(
            (seg(A, "This call is being recorded.", 5),
             seg(A, "The panels carry a 25 year warranty.", 60)),
            frozenset(),
        ),
        LabelledCall(
            (seg(A, "Good afternoon, this is Andrew.", 5),),
            frozenset({"rec"}),
        ),
        LabelledCall(
            (seg(A, "This call is being recorded. Te garantizo devolucion total.", 5),),
            frozenset({"noguar"}),
        ),
    ]

    def test_recall_on_critical_rules_clears_the_bar(self):
        acc = measure(FULL, self.LABELLED, only=Severity.CRITICAL)
        self.assertGreaterEqual(acc.recall, 0.95, f"recall {acc.recall:.2f}")

    def test_precision_on_critical_rules_clears_the_bar(self):
        acc = measure(FULL, self.LABELLED, only=Severity.CRITICAL)
        self.assertGreaterEqual(acc.precision, 0.85, f"precision {acc.precision:.2f}")

    def test_perfect_scores_on_an_empty_set_are_not_mistaken_for_evidence(self):
        acc = Accuracy(0, 0, 0)
        self.assertEqual((acc.recall, acc.precision), (1.0, 1.0))
        # Which is why the test above asserts against real labelled calls, and
        # why `backtest` refuses to bless a rule with no history.


if __name__ == "__main__":
    unittest.main()
