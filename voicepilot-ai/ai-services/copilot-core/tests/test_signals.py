"""Live signals: the number we refuse to invent, and the ranking that matters."""

from __future__ import annotations

import unittest

from signals import (
    ATTENTION_BUDGET,
    CALIBRATION_CALLS,
    ActiveCall,
    Calibrating,
    CloseModel,
    FloorState,
    LiveSignals,
    Probability,
    Signal,
    Track,
    estimate_close,
    risk,
    triage,
)


class Model(CloseModel):
    def predict(self, features):
        return 0.73

    @property
    def version(self):
        return "close-v3"


def call(cid, *, sentiment=None, stress=None, silence_ms=0, crit=0, warn=0,
         duration_ms=60_000, acknowledged=False):
    s = LiveSignals()
    if sentiment is not None:
        s.observe(Signal.SENTIMENT, sentiment)
    if stress is not None:
        s.observe(Signal.STRESS, stress)
    s.silence_ms = silence_ms
    return ActiveCall(cid, "Andrés", duration_ms, s, crit, warn, acknowledged)


class TheNumberWeRefuseToInvent(unittest.TestCase):
    def test_a_new_tenant_gets_words_not_a_number(self):
        """A supervisor who makes decisions from an invented number leaves
        us in two months."""
        e = estimate_close(tenant_calls_with_outcome=40, model=Model(), features={})
        self.assertIsInstance(e, Calibrating)
        self.assertIn("calibrando", str(e))

    def test_a_probability_cannot_be_constructed_without_the_history(self):
        with self.assertRaises(ValueError) as cm:
            Probability(0.73, tenant_calls=100, model_version="v1")
        self.assertIn("invented", str(cm.exception))

    def test_a_model_does_not_get_to_decide_it_is_ready(self):
        # A model asked whether it is ready always says yes. Readiness is a
        # property of the tenant's history, which the model cannot see.
        e = estimate_close(tenant_calls_with_outcome=1_999, model=Model(), features={})
        self.assertIsInstance(e, Calibrating)
        e = estimate_close(tenant_calls_with_outcome=2_000, model=Model(), features={})
        self.assertIsInstance(e, Probability)

    def test_no_model_at_all_is_calibrating_not_zero(self):
        e = estimate_close(tenant_calls_with_outcome=50_000, model=None, features={})
        self.assertIsInstance(e, Calibrating)

    def test_a_real_score_carries_its_model_version(self):
        e = estimate_close(tenant_calls_with_outcome=5_000, model=Model(), features={})
        assert isinstance(e, Probability)
        self.assertEqual(e.model_version, "close-v3")

    def test_an_unversioned_score_is_refused(self):
        with self.assertRaises(ValueError):
            Probability(0.5, tenant_calls=CALIBRATION_CALLS, model_version="")

    def test_calibration_progress_is_shown_so_it_does_not_look_broken(self):
        c = Calibrating(500)
        self.assertAlmostEqual(c.progress, 0.25)


class Smoothing(unittest.TestCase):
    def test_the_first_observation_is_taken_whole(self):
        t = Track(Signal.SENTIMENT)
        self.assertEqual(t.update(0.4), 0.4)

    def test_a_call_turning_cold_shows_up_almost_immediately(self):
        """A customer turns cold in one sentence. A filter that takes four
        refreshes has delayed the supervisor by eight seconds on the one call
        they needed to hear."""
        t = Track(Signal.SENTIMENT)
        t.update(0.5)
        t.update(-0.6)
        self.assertLess(t.value, -0.3)

    def test_recovery_is_slow_and_has_to_be_earned(self):
        t = Track(Signal.SENTIMENT)
        t.update(-0.8)
        t.update(0.6)
        self.assertLess(t.value, 0.0, "one good sentence does not undo the call")

    def test_stress_is_inverted_because_up_is_worse(self):
        t = Track(Signal.STRESS)
        t.update(0.2)
        t.update(0.9)
        self.assertGreater(t.value, 0.7, "rising stress must move fast too")


class TheRanking(unittest.TestCase):
    def test_a_quiet_floor_says_so_instead_of_finding_three_worries(self):
        floor = FloorState([call("c1", sentiment=0.5), call("c2", sentiment=0.3)])
        self.assertEqual(floor.needs_attention(), [])
        self.assertTrue(floor.quiet())

    def test_a_critical_violation_outranks_everything(self):
        out = triage([
            call("angry", sentiment=-0.9),
            call("silent", silence_ms=20_000),
            call("illegal", crit=1),
        ])
        self.assertEqual(out[0].call.call_id, "illegal")

    def test_the_list_never_exceeds_what_a_supervisor_can_act_on(self):
        many = [call(f"c{i}", crit=1) for i in range(12)]
        self.assertEqual(len(triage(many)), ATTENTION_BUDGET)

    def test_duration_does_not_rank_a_call(self):
        """The longest call on the floor is usually the one going well."""
        out = triage([
            call("long-and-fine", duration_ms=900_000, sentiment=0.6),
            call("short-and-bad", duration_ms=20_000, sentiment=-0.7),
        ])
        self.assertEqual([r.call.call_id for r in out], ["short-and-bad"])

    def test_every_ranked_call_says_why(self):
        """A ranking a supervisor cannot interrogate is one they overrule
        from instinct within a week."""
        out = triage([call("c1", crit=1, sentiment=-0.5)])
        self.assertTrue(out[0].why)
        self.assertIn("crítica", out[0].why)

    def test_dead_air_is_a_stuck_agent_not_a_thinking_customer(self):
        self.assertEqual(triage([call("c1", silence_ms=3_000)]), [])
        self.assertEqual(len(triage([call("c1", silence_ms=12_000)])), 1)

    def test_an_acknowledged_problem_stops_competing_for_attention(self):
        # Otherwise the same call sits at the top for six minutes after the
        # supervisor dealt with it, and everything behind it is invisible.
        handled = call("handled", crit=1, acknowledged=True)
        fresh = call("fresh", sentiment=-0.6)
        out = triage([handled, fresh])
        self.assertEqual(out[0].call.call_id, "fresh")

    def test_ties_go_to_the_call_that_has_been_wrong_for_longer(self):
        out = triage([
            call("recent", crit=1, duration_ms=30_000),
            call("older", crit=1, duration_ms=400_000),
        ])
        self.assertEqual(out[0].call.call_id, "older")

    def test_mild_signals_do_not_manufacture_urgency(self):
        self.assertEqual(risk(call("c", sentiment=-0.1, stress=0.4))[0], 0.0)


if __name__ == "__main__":
    unittest.main()
