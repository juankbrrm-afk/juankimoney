"""One door for every model call. `docs/06` §7.

> **The code is never coupled to a provider.** Prices and the capability
> frontier move every quarter; the system must be able to change models with
> a configuration change, not a code change.

Every learned component in this repo is already injected behind a protocol —
`Generator`, `Embedder`, `SemanticClassifier`, `Summariser`. That makes them
*replaceable in a test*. This module is what makes them replaceable **in
production, at 3am, without a deploy**, which is a different problem: it needs
failover, deadlines, versioning and a cost ceiling.

The decision that shapes the rest of the file is the one about deadlines, and
it is the opposite of what a retry library does by default.

**Failover shares the deadline; it does not restart it.** `docs/06` §7 gives
the copilot 800 ms because past that the agent has already carried on
speaking and the suggestion arrives too late to use — it is worse than
silence, because the agent reads it and loses their place. A failover that
gives the second provider a fresh 800 ms turns that into 1,600 ms and
delivers a perfectly good suggestion into a conversation that moved on two
sentences ago. The budget belongs to the *task*, not to the attempt.

So a provider that is slow does not get to spend the backup's time, and when
the deadline is gone the gateway stops trying and says so. In this system,
returning nothing on time is a supported outcome everywhere: the copilot
stays silent, compliance keeps its deterministic verdict, the post-call
summary runs later.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Callable, Protocol, TypeVar


class Task(str, Enum):
    """The latency profiles from `docs/06` §7, as types rather than comments."""

    TRIGGER_DETECTION = "trigger_detection"
    SENTIMENT = "sentiment"
    COPILOT_SUGGESTION = "copilot_suggestion"
    HALLUCINATION_CHECK = "hallucination_check"
    COMPLIANCE_SEMANTIC = "compliance_semantic"
    POST_CALL = "post_call"
    EMBEDDING = "embedding"


#: Milliseconds. Straight from the spec's table, and enforced rather than
#: documented — a budget nothing checks is a comment.
BUDGET_MS: dict[Task, int] = {
    Task.TRIGGER_DETECTION: 50,
    Task.SENTIMENT: 200,
    Task.COPILOT_SUGGESTION: 800,
    Task.HALLUCINATION_CHECK: 200,
    Task.COMPLIANCE_SEMANTIC: 200,
    Task.POST_CALL: 30_000,
    Task.EMBEDDING: 30_000,
}


class Clock(Protocol):
    def now_ms(self) -> float: ...


class WallClock:
    def now_ms(self) -> float:
        return time.perf_counter() * 1000


@dataclass
class TestClock:
    """Injected for the same reason the Rust engine injects its clock: a
    deadline you cannot control is a deadline you cannot test."""

    t: float = 0.0

    def now_ms(self) -> float:
        return self.t

    def advance(self, ms: float) -> None:
        self.t += ms


T = TypeVar("T")


class ProviderError(Exception):
    """A provider failed. Recoverable — try the next one if time allows."""


class BudgetExceeded(Exception):
    """The task's deadline is gone. Not recoverable, and not an error:
    every caller in this system has a defined behaviour for "no answer"."""


class CostCeilingReached(Exception):
    """Spending stopped. Deliberately a refusal rather than a warning.

    A per-tenant runaway — a retry loop, a corrupted transcript, a bad
    prompt — is discovered on an invoice at the end of the month unless
    something refuses. It is better to lose a feature for one tenant for an
    hour than to lose the margin on that tenant for a quarter.
    """


@dataclass(frozen=True)
class Provider:
    """One vendor's implementation of one task.

    `version` is not optional and there is no default. `docs/06` §7:
    *without recording `model_version` on every output, a quality regression
    cannot be debugged.* Six weeks later somebody asks why the summaries got
    worse, and the answer is in which model produced them.
    """

    name: str
    version: str
    #: Cost in thousandths of a cent, so budgets are integers and never drift.
    cost_millicents: int
    call: Callable[..., object]

    def __post_init__(self) -> None:
        if not self.name or not self.version:
            raise ValueError("a provider without a version cannot be debugged later")


@dataclass(frozen=True)
class Result:
    value: object
    provider: str
    model_version: str
    latency_ms: float
    #: True when the primary failed and a backup answered. The number that
    #: tells an operator a vendor is degrading before the vendor does.
    failed_over: bool
    cached: bool = False


@dataclass
class Budget:
    """Per tenant, per period. Spending is refused, not merely reported."""

    ceiling_millicents: int
    spent_millicents: int = 0

    def charge(self, amount: int) -> None:
        if self.spent_millicents + amount > self.ceiling_millicents:
            raise CostCeilingReached(
                f"spent {self.spent_millicents} of {self.ceiling_millicents}"
            )
        self.spent_millicents += amount

    @property
    def remaining(self) -> int:
        return max(0, self.ceiling_millicents - self.spent_millicents)


@dataclass
class Telemetry:
    calls: int = 0
    failovers: int = 0
    budget_exceeded: int = 0
    cache_hits: int = 0
    latency_ms: list[float] = field(default_factory=list)
    by_version: dict[str, int] = field(default_factory=dict)

    def p95_ms(self) -> float:
        if not self.latency_ms:
            return 0.0
        s = sorted(self.latency_ms)
        return s[min(len(s) - 1, int(len(s) * 0.95))]


class ModelGateway:
    """Routing, failover, deadlines, versioning, cost and cache.

    Providers are registered per task in preference order. The first is the
    primary; the rest are what stands between a vendor incident and a dead
    product.
    """

    def __init__(
        self,
        *,
        clock: Clock | None = None,
        budget: Budget | None = None,
        budgets_ms: dict[Task, int] | None = None,
    ) -> None:
        self._providers: dict[Task, list[Provider]] = {}
        self._clock = clock or WallClock()
        self._budget = budget
        self._budgets_ms = {**BUDGET_MS, **(budgets_ms or {})}
        self._cache: dict[tuple[Task, str], Result] = {}
        self.telemetry = Telemetry()

    def register(self, task: Task, *providers: Provider) -> None:
        if not providers:
            raise ValueError("registering no provider for a task is a silent outage")
        self._providers[task] = list(providers)

    def providers_for(self, task: Task) -> list[Provider]:
        return list(self._providers.get(task, []))

    def has_failover(self, task: Task) -> bool:
        """Reported rather than assumed.

        A task with one provider is a single point of failure, and an
        operator should be able to see that on a dashboard instead of
        discovering it during an incident.
        """
        return len(self._providers.get(task, [])) > 1

    def call(
        self,
        task: Task,
        *args: object,
        cache_key: str | None = None,
        **kwargs: object,
    ) -> Result:
        """Run `task`, within its budget, failing over if time allows.

        `cache_key` scopes to one call — `docs/06` §7's "cache of identical
        responses within the same call". Deliberately not a global cache: the
        same question from a different customer is a different question, and
        a suggestion cached across tenants would be a data leak wearing a
        performance optimisation's clothes.
        """
        providers = self._providers.get(task)
        if not providers:
            raise ProviderError(f"no provider registered for {task.value}")

        if cache_key is not None:
            hit = self._cache.get((task, cache_key))
            if hit is not None:
                self.telemetry.cache_hits += 1
                return Result(hit.value, hit.provider, hit.model_version,
                              0.0, hit.failed_over, cached=True)

        deadline_ms = self._budgets_ms[task]
        started = self._clock.now_ms()
        last_error: Exception | None = None

        for index, provider in enumerate(providers):
            elapsed = self._clock.now_ms() - started
            if elapsed >= deadline_ms:
                # The budget belongs to the task. A backup does not get a
                # fresh one — see the module docstring.
                break

            if self._budget is not None and provider.cost_millicents > self._budget.remaining:
                last_error = CostCeilingReached(
                    f"{provider.name} costs {provider.cost_millicents}, "
                    f"{self._budget.remaining} left"
                )
                continue

            try:
                value = provider.call(*args, **kwargs)
            except Exception as e:  # noqa: BLE001 - any vendor failure is a failover
                last_error = e
                continue

            latency = self._clock.now_ms() - started
            if latency > deadline_ms:
                # It answered, late. Discarded on purpose: a copilot
                # suggestion delivered after the agent moved on is worse than
                # silence, because they read it and lose their place.
                self.telemetry.budget_exceeded += 1
                raise BudgetExceeded(
                    f"{task.value}: {provider.name} answered in "
                    f"{latency:.0f} ms, budget {deadline_ms} ms"
                )

            if self._budget is not None:
                self._budget.charge(provider.cost_millicents)

            self.telemetry.calls += 1
            self.telemetry.latency_ms.append(latency)
            key = f"{provider.name}@{provider.version}"
            self.telemetry.by_version[key] = self.telemetry.by_version.get(key, 0) + 1
            if index > 0:
                self.telemetry.failovers += 1

            result = Result(value, provider.name, provider.version, latency, index > 0)
            if cache_key is not None:
                self._cache[(task, cache_key)] = result
            return result

        self.telemetry.budget_exceeded += 1
        raise BudgetExceeded(
            f"{task.value}: no provider answered within {deadline_ms} ms"
            + (f" (last error: {last_error})" if last_error else "")
        )

    def clear_call_cache(self) -> None:
        """Called when a call ends. Not optional: the cache is scoped to one
        conversation, and a cache that outlives its scope is a leak."""
        self._cache.clear()
