"""Live signals and supervisor triage. `docs/06` §5.

Two rules carry the module. A close probability with no history behind it
**cannot be constructed** — a generic close model is astrology, and an
invented 73% costs a customer. And the floor dashboard ranks by risk, not
duration: the three calls a supervisor can still change, with the reason
attached.
"""

from .live import (
    CALIBRATION_CALLS,
    FALL_ALPHA,
    REFRESH_MS,
    RISE_ALPHA,
    Calibrating,
    CloseEstimate,
    CloseModel,
    LiveSignals,
    Probability,
    Signal,
    Track,
    estimate_close,
)
from .triage import (
    ATTENTION_BUDGET,
    DEAD_AIR_MS,
    ActiveCall,
    Factor,
    FloorState,
    Ranked,
    risk,
    triage,
)

__all__ = [
    "ATTENTION_BUDGET", "ActiveCall", "CALIBRATION_CALLS", "Calibrating",
    "CloseEstimate", "CloseModel", "DEAD_AIR_MS", "FALL_ALPHA", "Factor",
    "FloorState", "LiveSignals", "Probability", "REFRESH_MS", "RISE_ALPHA",
    "Ranked", "Signal", "Track", "estimate_close", "risk", "triage",
]
