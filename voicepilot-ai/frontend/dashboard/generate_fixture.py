"""Generate the floor dashboard's fixture from the real triage engine.

Same discipline as `frontend/console/generate_fixture.py`, and here it
matters more, because the dashboard's entire claim is about an *ordering*:

    `docs/06` §5: the floor dashboard sorts active calls by **risk**, not
    duration. The supervisor sees the three calls that need intervention
    *now* at the top. That is the real value of live analysis — not the
    pretty graph.

An ordering is exactly the kind of thing a hand-written fixture gets right
by construction and a real engine can get wrong. So the twelve calls below
are described by their signals, `triage()` ranks them, and whatever order it
returns is the order the screen shows — including if it turns out to be
wrong, which is the point of looking.

The floor is built to contain the cases that break a naive dashboard:

  - the longest call on the floor is going fine (sorting by duration puts it
    first; it belongs nowhere near the top)
  - a call already acknowledged by the supervisor, still bad, which must stop
    competing with an unhandled one
  - a call with a critical violation that started ten seconds ago, which must
    outrank a call that has been mildly negative for nine minutes
  - eight calls with no risk factors at all, which must be excluded rather
    than ranked last

    python3 generate_fixture.py > floor.json
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / "ai-services" / "copilot-core"
sys.path.insert(0, str(ROOT))

from signals import (  # noqa: E402
    ATTENTION_BUDGET, ActiveCall, LiveSignals, Signal, risk, triage,
)


def call(
    call_id: str,
    agent: str,
    customer: str,
    campaign: str,
    duration_s: int,
    *,
    sentiment: float | None = None,
    stress: float | None = None,
    silence_ms: int = 0,
    critical: int = 0,
    warnings: int = 0,
    acknowledged: bool = False,
    note: str = "",
) -> tuple[ActiveCall, dict]:
    """One tile on the floor, with its signals pushed through the real track.

    `observe()` rather than assignment on purpose: the tracks smooth
    asymmetrically — `RISE_ALPHA` 0.25 against `FALL_ALPHA` 0.85 — so a call
    turning cold shows up in one turn while a call warming up has to earn
    it. Setting the value directly would skip the behaviour the dashboard
    exists to surface.
    """
    signals = LiveSignals()
    if sentiment is not None:
        signals.observe(Signal.SENTIMENT, sentiment)
    if stress is not None:
        signals.observe(Signal.STRESS, stress)
    signals.silence_ms = silence_ms

    active = ActiveCall(
        call_id, agent, duration_s * 1000, signals,
        critical_violations=critical,
        warning_violations=warnings,
        acknowledged=acknowledged,
    )
    meta = {
        "call_id": call_id, "agent": agent, "customer": customer,
        "campaign": campaign, "duration_s": duration_s, "note": note,
    }
    return active, meta


FLOOR = [
    # --- the ones that should surface ---------------------------------
    call("c-1041", "Andrés M.", "Michael Reed", "Solar Q3", 93,
         sentiment=-0.52, critical=1,
         note="Prometió devolución total del dinero. Alerta crítica activa."),
    call("c-1052", "Paola R.", "Denise Fowler", "Solar Q3", 412,
         sentiment=-0.71, stress=0.74, warnings=2,
         note="Cliente enfadado desde el minuto 2. El agente se está bloqueando."),
    call("c-1048", "Luis T.", "Harold Nguyen", "Seguros Auto", 208,
         silence_ms=14_000, stress=0.68,
         note="14 s de silencio. El agente no encuentra la respuesta."),

    # --- bad, but already handled -------------------------------------
    #
    # Same raw signals as c-1052 would give, and it must rank below it. A
    # dashboard that leaves an acknowledged call pinned at the top makes the
    # supervisor's own intervention invisible to them for six minutes.
    call("c-1039", "Karina S.", "Bob Alvarez", "Solar Q3", 505,
         sentiment=-0.66, stress=0.71, acknowledged=True,
         note="Supervisora ya está escuchando."),

    # --- mildly negative, and long ------------------------------------
    call("c-1033", "Diego V.", "Mary-Ann Petit", "Seguros Auto", 631,
         sentiment=-0.28,
         note="Va lento pero no se está rompiendo."),

    # --- the trap: the longest call on the floor, going well ----------
    #
    # Every dashboard that sorts by duration puts this first. It is a
    # closing conversation with a happy customer and it is the last call a
    # supervisor should join.
    call("c-1027", "Marcela D.", "Trent Okafor", "Solar Q3", 884,
         sentiment=0.62,
         note="Cierre en marcha. No interrumpir."),

    # --- the quiet majority -------------------------------------------
    call("c-1055", "Jorge P.", "Lena Brooks", "Solar Q3", 47, sentiment=0.18),
    call("c-1056", "Nuria A.", "Sam Whitfield", "Seguros Auto", 122, sentiment=0.05),
    call("c-1057", "Tomás G.", "Erica Downs", "Solar Q3", 76, sentiment=0.31),
    call("c-1058", "Beatriz L.", "Ahmed Rahimi", "Seguros Auto", 190, sentiment=0.44),
    call("c-1059", "Ricardo N.", "Joyce Tan", "Solar Q3", 35),
    call("c-1060", "Sofía E.", "Marcus Hale", "Seguros Auto", 265, sentiment=0.12),
]


def main() -> None:
    calls = [c for c, _ in FLOOR]
    meta = {m["call_id"]: m for _, m in FLOOR}

    ranked = triage(calls)
    attention = [{
        **meta[r.call.call_id],
        "score": round(r.score, 3),
        "acknowledged": r.call.acknowledged,
        # Every factor, kept and shown. `triage.py`: a ranking a supervisor
        # cannot interrogate is one they overrule from instinct within a
        # week. "Sentiment falling, critical compliance alert" is a reason to
        # click; a risk score of 0.78 is not.
        "factors": [{"name": f.name, "weight": round(f.weight, 3),
                     "detail": f.detail} for f in r.factors],
    } for r in ranked]

    # The rest of the floor, with its score, so the screen can prove the
    # ranking rather than assert it. A supervisor who cannot see why the
    # 14-minute call is not at the top does not trust the three that are.
    rest = []
    for c in calls:
        if any(a["call_id"] == c.call_id for a in attention):
            continue
        score, factors = risk(c)
        rest.append({
            **meta[c.call_id],
            "score": round(score, 3),
            "acknowledged": c.acknowledged,
            "factors": [{"name": f.name, "weight": round(f.weight, 3),
                         "detail": f.detail} for f in factors],
        })
    rest.sort(key=lambda c: -c["duration_s"])

    json.dump({
        "attention": attention,
        "rest": rest,
        "budget": ATTENTION_BUDGET,
        "totals": {
            "active": len(calls),
            "at_risk": sum(1 for c in calls if risk(c)[0] > 0),
            "agents": len({m["agent"] for m in meta.values()}),
        },
        "generated_by": "frontend/dashboard/generate_fixture.py — real triage engine",
    }, sys.stdout, indent=1, ensure_ascii=False)


if __name__ == "__main__":
    main()
