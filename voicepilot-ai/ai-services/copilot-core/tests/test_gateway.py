"""The gateway: what happens when a vendor has a bad afternoon."""

from __future__ import annotations

import unittest

from gateway import (
    BUDGET_MS,
    Budget,
    BudgetExceeded,
    CostCeilingReached,
    ModelGateway,
    Provider,
    ProviderError,
    Task,
    TestClock,
)

TASK = Task.COPILOT_SUGGESTION


def provider(name, *, version="v1", cost=1, answer="ok", clock=None, takes_ms=0, fails=False):
    def call(*a, **k):
        if clock is not None and takes_ms:
            clock.advance(takes_ms)
        if fails:
            raise RuntimeError(f"{name} is down")
        return answer
    return Provider(name, version, cost, call)


class Routing(unittest.TestCase):
    def test_a_task_with_no_provider_is_an_error_not_a_silent_none(self):
        with self.assertRaises(ProviderError):
            ModelGateway().call(TASK)

    def test_registering_no_provider_is_refused(self):
        with self.assertRaises(ValueError):
            ModelGateway().register(TASK)

    def test_a_single_provider_task_is_reported_as_a_single_point_of_failure(self):
        """An operator should see this on a dashboard, not discover it during
        an incident."""
        g = ModelGateway()
        g.register(TASK, provider("primary"))
        self.assertFalse(g.has_failover(TASK))
        g.register(TASK, provider("primary"), provider("backup"))
        self.assertTrue(g.has_failover(TASK))


class Versioning(unittest.TestCase):
    def test_a_provider_without_a_version_cannot_be_registered(self):
        """Six weeks later somebody asks why the summaries got worse."""
        with self.assertRaises(ValueError):
            Provider("acme", "", 1, lambda: "x")

    def test_every_result_carries_the_model_that_produced_it(self):
        g = ModelGateway(clock=TestClock())
        g.register(TASK, provider("acme", version="sonnet-4.6"))
        r = g.call(TASK)
        self.assertEqual(r.model_version, "sonnet-4.6")
        self.assertEqual(g.telemetry.by_version, {"acme@sonnet-4.6": 1})


class Failover(unittest.TestCase):
    def test_a_dead_primary_falls_over_to_the_backup(self):
        g = ModelGateway(clock=TestClock())
        g.register(TASK, provider("primary", fails=True), provider("backup", answer="from backup"))
        r = g.call(TASK)
        self.assertEqual(r.value, "from backup")
        self.assertTrue(r.failed_over)
        self.assertEqual(g.telemetry.failovers, 1)

    def test_a_healthy_primary_is_not_marked_as_a_failover(self):
        g = ModelGateway(clock=TestClock())
        g.register(TASK, provider("primary"), provider("backup"))
        self.assertFalse(g.call(TASK).failed_over)
        self.assertEqual(g.telemetry.failovers, 0)

    def test_every_provider_failing_raises_rather_than_returning_junk(self):
        g = ModelGateway(clock=TestClock())
        g.register(TASK, provider("a", fails=True), provider("b", fails=True))
        with self.assertRaises(BudgetExceeded) as cm:
            g.call(TASK)
        self.assertIn("b is down", str(cm.exception))


class TheDeadlineBelongsToTheTask(unittest.TestCase):
    """The decision the whole module is shaped around."""

    def test_a_slow_primary_does_not_get_to_spend_the_backups_time(self):
        clock = TestClock()
        g = ModelGateway(clock=clock)
        g.register(
            TASK,
            provider("slow", clock=clock, takes_ms=790, fails=True),
            provider("backup", clock=clock, takes_ms=790),
        )
        # A retry library would give the backup a fresh 800 ms and deliver a
        # suggestion at 1,580 ms — into a conversation that moved on two
        # sentences ago.
        with self.assertRaises(BudgetExceeded):
            g.call(TASK)
        self.assertLess(clock.now_ms(), BUDGET_MS[TASK] * 2)

    def test_a_backup_is_tried_when_time_actually_remains(self):
        clock = TestClock()
        g = ModelGateway(clock=clock)
        g.register(
            TASK,
            provider("fast-but-broken", clock=clock, takes_ms=50, fails=True),
            provider("backup", clock=clock, takes_ms=100, answer="saved"),
        )
        self.assertEqual(g.call(TASK).value, "saved")

    def test_a_late_answer_is_discarded_not_delivered(self):
        """A copilot suggestion after the agent moved on is worse than
        silence: they read it and lose their place."""
        clock = TestClock()
        g = ModelGateway(clock=clock)
        g.register(TASK, provider("slow", clock=clock, takes_ms=900))
        with self.assertRaises(BudgetExceeded):
            g.call(TASK)
        self.assertEqual(g.telemetry.budget_exceeded, 1)

    def test_each_task_carries_its_own_budget_from_the_spec(self):
        self.assertEqual(BUDGET_MS[Task.TRIGGER_DETECTION], 50)
        self.assertEqual(BUDGET_MS[Task.COPILOT_SUGGESTION], 800)
        self.assertEqual(BUDGET_MS[Task.POST_CALL], 30_000)

    def test_a_post_call_budget_is_generous_because_nobody_is_waiting(self):
        clock = TestClock()
        g = ModelGateway(clock=clock)
        g.register(Task.POST_CALL, provider("big", clock=clock, takes_ms=12_000))
        self.assertEqual(g.call(Task.POST_CALL).value, "ok")


class TheCostCeiling(unittest.TestCase):
    def test_spending_is_refused_not_merely_reported(self):
        """A runaway is otherwise discovered on an invoice."""
        g = ModelGateway(clock=TestClock(), budget=Budget(ceiling_millicents=10))
        g.register(TASK, provider("acme", cost=4))
        g.call(TASK)
        g.call(TASK)
        with self.assertRaises(BudgetExceeded):
            g.call(TASK)

    def test_an_unaffordable_primary_falls_through_to_a_cheaper_backup(self):
        g = ModelGateway(clock=TestClock(), budget=Budget(ceiling_millicents=5))
        g.register(TASK, provider("expensive", cost=100), provider("cheap", cost=1, answer="cheap"))
        self.assertEqual(g.call(TASK).value, "cheap")

    def test_the_budget_tracks_what_was_actually_spent(self):
        b = Budget(ceiling_millicents=100)
        g = ModelGateway(clock=TestClock(), budget=b)
        g.register(TASK, provider("acme", cost=7))
        g.call(TASK)
        g.call(TASK)
        self.assertEqual(b.spent_millicents, 14)

    def test_a_ceiling_raises_its_own_error_type(self):
        b = Budget(ceiling_millicents=1)
        with self.assertRaises(CostCeilingReached):
            b.charge(5)


class TheInCallCache(unittest.TestCase):
    def test_an_identical_question_in_the_same_call_is_not_paid_for_twice(self):
        calls = []

        def counting(*a, **k):
            calls.append(1)
            return "answer"

        g = ModelGateway(clock=TestClock())
        g.register(TASK, Provider("acme", "v1", 1, counting))
        g.call(TASK, cache_key="q1")
        r = g.call(TASK, cache_key="q1")
        self.assertEqual(len(calls), 1)
        self.assertTrue(r.cached)
        self.assertEqual(g.telemetry.cache_hits, 1)

    def test_the_cache_does_not_outlive_the_call(self):
        """The same question from a different customer is a different
        question. A suggestion cached across calls would be a data leak
        wearing a performance optimisation's clothes."""
        calls = []
        g = ModelGateway(clock=TestClock())
        g.register(TASK, Provider("acme", "v1", 1, lambda *a, **k: calls.append(1) or "x"))
        g.call(TASK, cache_key="q1")
        g.clear_call_cache()
        g.call(TASK, cache_key="q1")
        self.assertEqual(len(calls), 2)

    def test_an_uncached_call_is_never_served_from_cache(self):
        calls = []
        g = ModelGateway(clock=TestClock())
        g.register(TASK, Provider("acme", "v1", 1, lambda *a, **k: calls.append(1) or "x"))
        g.call(TASK)
        g.call(TASK)
        self.assertEqual(len(calls), 2)


class Telemetry(unittest.TestCase):
    def test_latency_is_recorded_per_task(self):
        clock = TestClock()
        g = ModelGateway(clock=clock)
        g.register(TASK, provider("acme", clock=clock, takes_ms=120))
        g.call(TASK)
        g.call(TASK)
        self.assertEqual(g.telemetry.calls, 2)
        self.assertGreater(g.telemetry.p95_ms(), 0)

    def test_a_degrading_vendor_shows_up_as_failovers_before_it_shows_up_anywhere_else(self):
        g = ModelGateway(clock=TestClock())
        g.register(TASK, provider("flaky", fails=True), provider("backup"))
        for _ in range(3):
            g.call(TASK)
        self.assertEqual(g.telemetry.failovers, 3)


if __name__ == "__main__":
    unittest.main()
