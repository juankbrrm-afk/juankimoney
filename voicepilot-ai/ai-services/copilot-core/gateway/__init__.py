"""One door for every model call: routing, failover, deadlines, versioning,
cost ceiling and an in-call cache. `docs/06` §7.

The rule it exists to keep: **the code is never coupled to a provider.**
"""

from .gateway import (
    BUDGET_MS,
    Budget,
    BudgetExceeded,
    Clock,
    CostCeilingReached,
    ModelGateway,
    Provider,
    ProviderError,
    Result,
    Task,
    Telemetry,
    TestClock,
    WallClock,
)

__all__ = [
    "BUDGET_MS", "Budget", "BudgetExceeded", "Clock", "CostCeilingReached",
    "ModelGateway", "Provider", "ProviderError", "Result", "Task",
    "Telemetry", "TestClock", "WallClock",
]
