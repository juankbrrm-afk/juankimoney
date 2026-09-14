"""Generate the console's fixture by running a call through the real engines.

`frontend/README.md`: *render, nothing else. If a rule exists only in the
frontend, it is an architecture bug waiting to be exploited by somebody with
devtools open.*

A console demo built on hand-written mock text quietly violates that. The
screen looks right, and every claim it makes about the product — grounded
suggestions, the three-alert budget, silence when the corpus does not cover
the question — is a claim about a JSON file somebody typed. The first time a
real backend is wired in, half of them stop being true.

So this script runs an actual call through the actual modules — the copilot
pipeline, the compliance engine, the signal tracks, the script evaluator —
and writes what they produced. Everything the console renders was decided by
the same code that will decide it in production, including the refusals.

    python3 generate_fixture.py > call-events.json
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / "ai-services" / "copilot-core"
sys.path.insert(0, str(ROOT))

from compliance import (  # noqa: E402
    CallMonitor, Kind as RuleKind, Rule, RuleSet, Segment, Severity, Speaker,
)
from copilot import CallContext, Declined, Index, Mode, Scope  # noqa: E402
from copilot.pipeline import Copilot  # noqa: E402
from copilot.text import sentences  # noqa: E402
# Two different `Draft`s live in this codebase and both are needed here:
# the copilot's (a suggestion plus its chunk ids) and the post-call one
# (a summary plus its extractions). Aliased rather than imported bare,
# because the collision is silent — the later import simply wins, and the
# failure surfaces as a constructor complaining about a field the caller
# has never heard of.
from copilot.types import Draft as SuggestionDraft  # noqa: E402
from eval.corpus import CORPUS  # noqa: E402
from eval.embedder import ConceptEmbedder  # noqa: E402
from postcall import Kind, analyse, crm_writes  # noqa: E402
from postcall.adoption import report as postcall_report  # noqa: E402
from postcall.extract import Draft as SummaryDraft, Extraction  # noqa: E402
from script import Script, Step, current_stage, evaluate  # noqa: E402
from signals import ActiveCall, LiveSignals, Signal, triage  # noqa: E402

A, C = Speaker.AGENT, Speaker.CUSTOMER


# ---------------------------------------------------------------------------
# The call
# ---------------------------------------------------------------------------

TRANSCRIPT = [
    (1.0,  A, "Hi Michael, this is Andrew with Solaris Energy — how's your afternoon going?"),
    (6.5,  C, "It's fine. What's this about?"),
    (9.0,  A, "I'll be quick. This call is being recorded, by the way."),
    (14.0, A, "We're finishing installs on your street this month and I wanted to check "
              "what you're paying the utility right now."),
    (21.0, C, "Somewhere around two-forty a month, I think."),
    (26.0, A, "That tracks. Can you confirm the service address ends in Palmetto Drive?"),
    (32.0, C, "That's right."),
    (36.0, A, "Perfect. So the system for a home your size runs about 28,000 installed."),
    (43.0, C, "Whoa. That's a lot more than I wanted to spend."),
    (48.0, A, "I hear you — nobody pays that up front. We split it over 24 months at "
              "zero interest."),
    (56.0, A, "That puts you around a hundred ninety-eight a month, below what you're "
              "handing the utility today."),
    (63.0, C, "Okay… that's actually not what I expected. What's the catch?"),
    (68.0, A, "No catch. I guarantee you'll get every penny back if you're not happy."),
    (75.0, A, "Sorry — to be precise: the panels carry a 25 year production warranty."),
    (82.0, C, "Send me something in writing and I'll look at it this week."),
    (87.0, A, "Done. I'll send you the written proposal within the hour."),
]

HANGUP_MS = 93_000

RULES = RuleSet("solaris", [
    Rule("rec", "solaris", RuleKind.MUST_SAY, Severity.CRITICAL,
         "La grabación debe anunciarse",
         remedy="Di: «esta llamada está siendo grabada».",
         phrases=("this call is being recorded",),
         authority="Two-party consent · FL §934.03"),
    Rule("verify", "solaris", RuleKind.MUST_SAY_BEFORE, Severity.WARNING,
         "Verificar dirección antes del minuto 1",
         remedy="Confirma la dirección de servicio antes de hablar de precios.",
         phrases=("confirm the service address",), deadline_s=60),
    Rule("noguar", "solaris", RuleKind.MUST_NOT_SAY, Severity.CRITICAL,
         "No prometer garantías inexistentes",
         remedy="Retráctate ahora: «para ser preciso, la garantía cubre…».",
         phrases=("i guarantee", "every penny back", "money back"),
         authority="FTC Act §5 · publicidad engañosa"),
    Rule("terms", "solaris", RuleKind.CONDITIONAL, Severity.WARNING,
         "Si mencionas precio, menciona el financiamiento",
         remedy="Añade: «se divide en 24 meses sin interés».",
         when_mentioned=("28,000",), phrases=("24 months", "zero interest"),
         window_s=30),
])

SCRIPT = Script("solar-q3", "solaris", "Solar Q3", [
    Step("greet", "Saludo e identificación", ("this is",), deadline_s=15,
         coaching="Preséntate en los primeros 15 s."),
    Step("verify", "Verificar dirección", ("confirm the service address",),
         before=("price",), deadline_s=60,
         coaching="Confirma la dirección ANTES del precio."),
    Step("discover", "Descubrimiento", ("what you're paying",), before=("price",),
         coaching="Pregunta la factura actual antes de dar un número."),
    Step("price", "Presentar precio", ("28,000",),
         coaching="Da el precio completo, no por partes."),
    Step("terms", "Financiamiento", ("24 months",),
         coaching="Menciona los 24 meses justo después del precio."),
    Step("close", "Cierre", ("send you", "written proposal"),
         coaching="Cierra con un compromiso concreto y una fecha."),
])


class QuotingGenerator:
    """Answers by quoting the retrieved material, trimmed to the word budget.

    A stand-in for the LLM, and a deliberately dull one: the point of this
    fixture is to show what the *pipeline* lets through, not to show off a
    model's prose. Every word on screen traces to a chunk.
    """

    #: Playbook scaffolding that is written for the agent to read, not to
    #: say. Quoting it verbatim puts "Primary response:" in the agent's mouth.
    _LABELS = ("primary response:", "if they insist:", "response:", "say:")

    def generate(self, *, question, chunks, language, context) -> SuggestionDraft:
        text = chunks[0].text.strip()

        lowered = text.lower()
        for label in self._LABELS:
            if lowered.startswith(label):
                text = text[len(label):].lstrip()
                text = text[:1].upper() + text[1:]
                break

        # Whole sentences only, up to the word budget.
        #
        # Cutting at the 40th word and adding a full stop invents a sentence
        # boundary, and the invented one can say something the document does
        # not. This chunk truncated to "…below what most customers are
        # already paying." — the source says "already paying *the utility*".
        # Same words, different claim, and the agent reads it aloud.
        kept: list[str] = []
        for sentence in sentences(text):
            if len(" ".join(kept + [sentence]).split()) > 40 and kept:
                break
            kept.append(sentence)
        return SuggestionDraft(" ".join(kept), (chunks[0].id,))


class QuotingSummariser:
    """The post-call model, stood in for by something that cannot invent.

    Every `text` here is a reading and every `quote` is verbatim from
    `TRANSCRIPT` — except one, deliberately.

    `postcall/extract.py` drops any extraction whose quote cannot be located
    in the transcript, and counts the drops, because *a rising count is the
    earliest signal that the summarising model has drifted*. A fixture where
    nothing is ever rejected shows a screen that has never exercised its own
    guarantee, and the number that matters most on it would be a hard-coded
    zero.

    So `_INVENTED` is a plausible, useful, entirely fabricated commitment —
    the kind a real model produces when it pattern-matches a sales call
    instead of reading one. It gets thrown away, and the report says so.
    """

    _INVENTED = "I'll waive the installation fee for you"

    def summarise(self, *, segments, compliance_rule_ids) -> SummaryDraft:
        return SummaryDraft(
            summary=(
                "Michael Reed paga unos $240/mes a la eléctrica. Se le "
                "presentó el sistema a 28.000 instalado y reaccionó al "
                "precio; se reencuadró a 24 meses sin interés, ~$198/mes. "
                "El agente prometió una devolución total que la empresa no "
                "ofrece y se retractó en la siguiente frase. Pidió la "
                "propuesta por escrito esta semana."
            ),
            summary_quotes=(
                "That's a lot more than I wanted to spend",
                "Send me something in writing and I'll look at it this week",
            ),
            extractions=(
                Extraction(Kind.KEY_POINT,
                           "Factura actual ~$240/mes",
                           "Somewhere around two-forty a month, I think"),
                Extraction(Kind.OBJECTION,
                           "Precio: 28.000 está por encima de lo que esperaba",
                           "That's a lot more than I wanted to spend"),
                Extraction(Kind.KEY_POINT,
                           "Dirección de servicio confirmada (Palmetto Drive)",
                           "Can you confirm the service address ends in Palmetto Drive"),
                Extraction(Kind.COMMITMENT,
                           "Enviar la propuesta por escrito dentro de la hora",
                           "I'll send you the written proposal within the hour"),
                Extraction(Kind.NEXT_STEP,
                           "El cliente la revisa esta semana",
                           "Send me something in writing and I'll look at it this week"),
                # Never said. Dropped by the pipeline, counted on the report.
                Extraction(Kind.COMMITMENT,
                           "Exonerar el costo de instalación",
                           self._INVENTED),
            ),
            disposition="interested",
            disposition_quote="Send me something in writing and I'll look at it this week",
        )


def main() -> None:
    index = Index(embedder=ConceptEmbedder())
    for chunks in CORPUS.values():
        index.add(chunks)

    copilot = Copilot(index=index, generator=QuotingGenerator())
    monitor = CallMonitor(RULES)
    signals = LiveSignals()
    ctx = CallContext("solaris", "kb-main", 3, Mode.A)

    events: list[dict] = []
    segments: list[Segment] = []
    stage_id: str | None = None

    def emit(t: float, **kw) -> None:
        events.append({"t": round(t, 2), **kw})

    for at_s, speaker, text in TRANSCRIPT:
        at_ms = int(at_s * 1000)
        seg = Segment(speaker, text, at_ms)
        segments.append(seg)

        emit(at_s, type="transcript", speaker=speaker.value, text=text)

        # --- compliance, from the real engine ---------------------------
        for v in monitor.on_segment(seg):
            if v.severity is Severity.INFO:
                continue  # docs/12: info never appears live
            emit(at_s, type="compliance", severity=v.severity.value,
                 title=v.title, remedy=v.remedy, authority=v.authority,
                 evidence=v.evidence, layer=v.layer)

        # --- copilot, from the real pipeline ----------------------------
        if speaker is C:
            out = copilot.on_customer_turn(text, ctx)
            if isinstance(out, Declined):
                # Shown as nothing. Recorded so the truth panel can state how
                # often the pipeline chose silence — see docs/12 §6: "no
                # suggestion beats a doubtful one".
                emit(at_s, type="silence", reason=out.reason.value,
                     detail=out.detail)
            else:
                s = out.suggestion
                emit(at_s, type="suggestion", text=s.text,
                     trigger=s.trigger.value, grounding=round(s.grounding_score, 2),
                     citations=[{
                         "doc": c.doc_title, "heading": c.heading_label,
                         "page": c.page, "kb_version": c.kb_version,
                     } for c in s.citations])

        # --- signals, from the real tracks ------------------------------
        sentiment = _sentiment(text, speaker)
        if sentiment is not None:
            emit(at_s, type="signal", signal="sentiment",
                 value=round(signals.observe(Signal.SENTIMENT, sentiment), 3))

        # --- script stage -----------------------------------------------
        # Only transitions. The previous version compared against the last
        # event, which is almost always a transcript line with no `stage` key,
        # so every turn re-emitted the same stage.
        stage = current_stage(SCRIPT, segments)
        if stage is not None and stage.id != stage_id:
            stage_id = stage.id
            emit(at_s, type="stage", stage=stage.id, name=stage.name,
                 coaching=stage.coaching)

    # Deadlines fire during silence, so the clock has to be advanced.
    for v in monitor.on_hangup(HANGUP_MS):
        if v.severity is not Severity.INFO:
            emit(v.at_ms / 1000, type="compliance", severity=v.severity.value,
                 title=v.title, remedy=v.remedy, authority=v.authority,
                 evidence=v.evidence, layer=v.layer)

    live = [{"title": v.title, "severity": v.severity.value}
            for v in monitor.live_alerts()]
    deferred = sum(1 for v in monitor.report() if v.deferred_to_report)

    # Health timeline — from `media/voice-engine`'s measured numbers.
    health = [
        {"t": 0.0, "state": "ok", "ms": 292},
        {"t": 64.0, "state": "degraded", "ms": 418},
        {"t": 67.0, "state": "bypass", "ms": 0},
        {"t": 74.0, "state": "ok", "ms": 296},
    ]

    floor = triage([
        ActiveCall("c-1", "Andrés M.", 93_000, signals,
                   critical_violations=monitor.critical_count()),
    ])

    # Did the agent actually use what the panel offered? `docs/07` §7 asks
    # the call player to mark this, and it is measured rather than assumed:
    # `postcall/adoption.py` counts the distinctive words the suggestion
    # contributed and that the agent had not already used.
    offered = [(f"s{i}", e["text"], int(e["t"] * 1000))
               for i, e in enumerate(events) if e["type"] == "suggestion"]
    adoption = postcall_report(offered, segments)
    uses = [{
        "suggestion_id": u.suggestion_id, "outcome": u.outcome.value,
        "at": None if u.at_ms is None else round(u.at_ms / 1000, 1),
        "share": round(u.share, 3), "terms": list(u.terms),
    } for u in adoption.uses]

    # The post-call record, from the real pipeline. Nothing here is
    # recomputed: the compliance rule ids come from the live engine, because
    # a report that quietly disagrees with what the agent was told during the
    # call destroys trust in both faster than either being wrong alone.
    analysis = analyse(
        call_id="c-1", tenant_id="solaris", segments=segments,
        summariser=QuotingSummariser(),
        compliance_rule_ids=[v.rule_id for v in monitor.report()],
        hangup_ms=HANGUP_MS,
    )
    m = analysis.metrics

    # The script rail, with the verdict the report will carry. The console
    # renders the steps in script order and marks them as the call moves; the
    # outcomes are what `evaluate()` decided, not what the UI inferred from
    # having seen a stage go by.
    adherence = evaluate(SCRIPT, segments, hangup_ms=HANGUP_MS)
    steps = [{
        "id": r.step.id, "name": r.step.name, "outcome": r.outcome.value,
        "at": None if r.at_ms is None else round(r.at_ms / 1000, 1),
        "required": r.step.required, "coaching": r.step.coaching,
    } for r in adherence.results]

    json.dump({
        "call": {
            "id": "c-1", "customer": "Michael Reed",
            "phone": "+1 305 555 0142", "campaign": "Solar Q3",
            "agent": "Andrés M.", "mode": "A", "hangup_ms": HANGUP_MS,
        },
        "events": sorted(events, key=lambda e: e["t"]),
        "health": health,
        "compliance_live": live,
        "compliance_deferred": deferred,
        "script": {
            "id": SCRIPT.id, "name": SCRIPT.name, "steps": steps,
            "score": round(adherence.score, 3),
            "coaching": adherence.coaching_notes(),
        },
        "adoption": {
            "uses": uses,
            "rate": adoption.rate,
            "summary": adoption.summary(),
        },
        "analysis": {
            "summary": analysis.summary,
            "summary_quotes": list(analysis.summary_quotes),
            "items": [{
                "kind": i.kind.value, "text": i.text, "quote": i.quote,
                "at": round(i.at_ms / 1000, 1), "speaker": i.speaker,
            } for i in analysis.items],
            "metrics": {
                "agent_ms": m.agent_ms, "customer_ms": m.customer_ms,
                "longest_agent_monologue_ms": m.longest_agent_monologue_ms,
                "silence_ms": m.silence_ms, "interruptions": m.interruptions,
                "talk_ratio": round(m.talk_ratio, 3),
            },
            "disposition": None if analysis.disposition is None else {
                "value": analysis.disposition.value,
                "quote": analysis.disposition.quote,
                "at": round(analysis.disposition.at_ms / 1000, 1),
                "confirmed": analysis.disposition.confirmed_by_agent,
            },
            "compliance_rule_ids": list(analysis.compliance_rule_ids),
            # Extractions the pipeline threw away because their quote was not
            # in the transcript. Shown, never hidden: a rising count is the
            # earliest signal the summarising model has drifted.
            "rejected": analysis.rejected,
        },
        "crm_writes": [{
            "entity": w.entity, "operation": w.operation, "payload": w.payload,
        } for w in crm_writes(analysis)],
        "floor": [{"call_id": r.call.call_id, "score": round(r.score, 2),
                   "why": r.why} for r in floor],
        # What the copilot chose *not* to say — the headline number of the
        # whole product, so the console states it rather than the deck.
        #
        # Counted in three buckets rather than two. Lumping "that's right"
        # together with "what's the catch?" as questions the copilot failed
        # to answer makes the pipeline look far worse than it is, and the
        # opposite framing — counting no-trigger turns as successes — makes
        # it look better. Neither is the number. A turn that never triggered
        # retrieval is not a miss, and a turn that triggered it and came back
        # empty is the case worth showing.
        "turns": {
            "customer": sum(1 for e in events
                            if e["type"] in ("suggestion", "silence")),
            "no_trigger": sum(1 for e in events
                              if e["type"] == "silence"
                              and e["reason"] == "no_trigger"),
            "answered": sum(1 for e in events if e["type"] == "suggestion"),
            "withheld": sum(1 for e in events
                            if e["type"] == "silence"
                            and e["reason"] != "no_trigger"),
        },
        "generated_by": "frontend/console/generate_fixture.py — real engines",
    }, sys.stdout, indent=1, ensure_ascii=False)


def _sentiment(text: str, speaker) -> float | None:
    """A crude, deterministic read, so the fixture is reproducible.

    Deliberately not a model: `signals/live.py` takes the classifier through
    a protocol, and what this script is demonstrating is the *track* — the
    asymmetric smoothing that makes a call turning cold visible in one turn.
    """
    if speaker is not C:
        return None
    lowered = text.lower()
    if "a lot more than" in lowered:
        return -0.62
    if "what's the catch" in lowered:
        return 0.05
    if "send me something in writing" in lowered:
        return 0.58
    if "what's this about" in lowered:
        return -0.05
    return 0.15


if __name__ == "__main__":
    main()
