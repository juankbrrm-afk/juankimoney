/**
 * The forecast, tested from the direction of the lie.
 *
 * Almost every test here asserts that a number was *not* produced. That is
 * the product: any CRM can multiply amounts by percentages, and the reason
 * every sales director rebuilds the forecast in a spreadsheet is that the one
 * in the CRM is built on invented probabilities over too few deals including
 * ones that died months ago.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  MIN_DEALS_FOR_WEIGHTING,
  MIN_HISTORY_PER_STAGE,
  STALL_MULTIPLE,
  explain,
  forecast,
  stageRate,
  stalled,
  transition,
} from "../src/pipeline.ts";
import type { Pipeline, StageHistory } from "../src/pipeline.ts";
import type { Opportunity } from "../src/canonical.ts";

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;

const PIPELINE: Pipeline = {
  id: "p1",
  tenantId: "t1",
  name: "Solar Q3",
  stages: [
    { id: "new", name: "Nuevo", order: 10 },
    { id: "qualified", name: "Calificado", order: 20 },
    { id: "proposal", name: "Propuesta", order: 30 },
    { id: "negotiation", name: "Negociación", order: 40 },
    { id: "won", name: "Ganado", order: 50, terminal: "won" },
    { id: "lost", name: "Perdido", order: 60, terminal: "lost" },
  ],
};

function history(over: Partial<Record<string, Partial<StageHistory>>> = {}): StageHistory[] {
  const base = ["new", "qualified", "proposal", "negotiation"];
  return base.map((stageId) => ({
    stageId,
    entered: 100,
    won: 30,
    typicalDwellMs: 7 * DAY,
    ...(over[stageId] ?? {}),
  }));
}

function deal(id: string, stageId: string, amountCents: number, daysInStage = 1) {
  const opportunity: Opportunity = {
    id, tenantId: "t1",
    createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
    externalIds: {}, customFields: {},
    pipelineId: "p1", stageId, name: id,
    amountCents, currency: "USD",
  };
  return { opportunity, stageEnteredAt: NOW - daysInStage * DAY };
}

/** A pipeline big enough that weighting is allowed to happen. */
function manyDeals(n: number, stageId = "qualified", amount = 1_000_00) {
  return Array.from({ length: n }, (_, i) => deal(`d${i}`, stageId, amount));
}

describe("stage rates come from this tenant's own history", () => {
  test("a measured rate carries its sample size", () => {
    const r = stageRate({ stageId: "qualified", entered: 100, won: 30, typicalDwellMs: DAY });
    assert.equal(r.kind, "measured");
    if (r.kind === "measured") {
      assert.equal(r.rate, 0.3);
      assert.equal(r.sample, 100);
    }
  });

  /**
   * Three of five closing is not a 60% stage. It is five deals.
   */
  test("too little history yields no rate at all", () => {
    const r = stageRate({ stageId: "qualified", entered: 5, won: 3, typicalDwellMs: DAY });
    assert.equal(r.kind, "insufficient");
    // And there is deliberately no `rate` field to fall back to. An optional
    // number with a default is how the invented 50% sneaks back in.
    assert.equal("rate" in r, false);
  });
});

describe("the forecast refuses rather than inventing", () => {
  /**
   * The defaults every CRM ships — 10/25/50/75/90 — are not derived from
   * anything. A tenant whose qualified deals close at 12% gets handed a
   * forecast built on 50%, and finds out at the end of the quarter.
   */
  test("with no closed history there is no forecast", () => {
    const f = forecast({
      pipeline: PIPELINE,
      deals: manyDeals(50),
      history: history({ qualified: { entered: 2, won: 1 } }),
      now: NOW,
    });
    assert.equal(f.kind, "uncalibrated");
    if (f.kind === "uncalibrated") {
      assert.equal(f.missing.some((m) => m.stageId === "qualified"), true);
    }
  });

  test("a stage with no history at all is missing, not assumed", () => {
    const f = forecast({
      pipeline: PIPELINE,
      deals: manyDeals(50),
      // `negotiation` simply absent from the history.
      history: history().filter((h) => h.stageId !== "negotiation"),
      now: NOW,
    });
    assert.equal(f.kind, "uncalibrated");
    if (f.kind === "uncalibrated") {
      assert.equal(f.missing.some((m) => m.stageId === "negotiation"), true);
    }
  });

  /**
   * The core objection. A single $28,000 deal at 60% "forecasts" $16,800,
   * which will never happen — it closes at $28,000 or at nothing. Weighting
   * only means something once the wins and losses have room to average out.
   */
  test("a small pipeline gets no weighted number", () => {
    const f = forecast({
      pipeline: PIPELINE,
      deals: [deal("d1", "negotiation", 28_000_00)],
      history: history(),
      now: NOW,
    });
    assert.equal(f.kind, "unreliable");
    if (f.kind === "unreliable") {
      assert.equal(f.deals, 1);
      assert.equal(f.needed, MIN_DEALS_FOR_WEIGHTING);
      // The open total is still real — it is a sum of actual amounts, not an
      // estimate — so it is reported.
      assert.equal(f.openAmountCents, 28_000_00);
    }
  });

  test("one deal short of the threshold is still refused", () => {
    const f = forecast({
      pipeline: PIPELINE,
      deals: manyDeals(MIN_DEALS_FOR_WEIGHTING - 1),
      history: history(),
      now: NOW,
    });
    assert.equal(f.kind, "unreliable");
  });

  test("at the threshold it weights", () => {
    const f = forecast({
      pipeline: PIPELINE,
      deals: manyDeals(MIN_DEALS_FOR_WEIGHTING),
      history: history(),
      now: NOW,
    });
    assert.equal(f.kind, "weighted");
    if (f.kind === "weighted") {
      // 30 deals × $1,000 × 0.30
      assert.equal(f.weightedCents, 30 * 1_000_00 * 0.3);
    }
  });
});

describe("dead deals are not counted at stage weight", () => {
  /**
   * A deal that entered negotiation nine months ago is not 75% likely to
   * close. It is dead and nobody has said so.
   */
  test("a stalled deal is excluded and the exclusion is reported", () => {
    const deals = [
      ...manyDeals(MIN_DEALS_FOR_WEIGHTING),
      deal("zombie", "negotiation", 400_000_00, 300),
    ];
    const f = forecast({ pipeline: PIPELINE, deals, history: history(), now: NOW });
    assert.equal(f.kind, "weighted");
    if (f.kind === "weighted") {
      assert.equal(f.excludedStalled, 1);
      // Reported, never silently dropped: a forecast that quietly removed
      // $400,000 of pipeline is one somebody rebuilds by hand.
      assert.equal(f.excludedCents, 400_000_00);
      assert.equal(f.weightedCents, 30 * 1_000_00 * 0.3);
      // And the open total still includes it, because it is still open.
      assert.equal(f.openAmountCents, 30 * 1_000_00 + 400_000_00);
    }
  });

  test("stalling is measured against this tenant's own dwell time", () => {
    // Same 30-day-old deal, two tenants. Enterprise software and residential
    // solar differ by an order of magnitude in what "long" means.
    const deals = [deal("d1", "proposal", 10_000_00, 30)];

    const fast = stalled(PIPELINE, deals, history(), NOW);
    assert.equal(fast.length, 1, "30 days against a 7-day median is stalled");

    const slow = stalled(
      PIPELINE,
      deals,
      history({ proposal: { typicalDwellMs: 60 * DAY } }),
      NOW,
    );
    assert.equal(slow.length, 0, "30 days against a 60-day median is normal");
  });

  test("with no dwell history nothing is called stalled", () => {
    // Flagging a deal against a number we do not have is the same invention
    // this module refuses one level up.
    const s = stalled(
      PIPELINE,
      [deal("d1", "proposal", 10_000_00, 900)],
      history({ proposal: { typicalDwellMs: 0 } }),
      NOW,
    );
    assert.equal(s.length, 0);
  });

  test("stalled deals come back worst first", () => {
    const s = stalled(
      PIPELINE,
      [deal("mild", "proposal", 1, 20), deal("severe", "proposal", 1, 200)],
      history(),
      NOW,
    );
    assert.deepEqual(s.map((x) => x.opportunity.id), ["severe", "mild"]);
    assert.ok(s[0]!.multiple > STALL_MULTIPLE);
  });

  test("a closed deal is never stalled", () => {
    const s = stalled(PIPELINE, [deal("d1", "won", 1, 900)], history(), NOW);
    assert.equal(s.length, 0);
  });
});

describe("commit is the number a human stood behind", () => {
  /**
   * It survives every refusal above, because it is not an estimate. Somebody
   * put their name on each of these deals.
   */
  test("commit is reported even with no calibration", () => {
    const deals = [
      { ...deal("d1", "negotiation", 28_000_00), committed: true },
      deal("d2", "new", 9_000_00),
    ];
    const f = forecast({
      pipeline: PIPELINE, deals,
      history: history({ new: { entered: 1, won: 0 } }),
      now: NOW,
    });
    assert.equal(f.kind, "uncalibrated");
    assert.equal(f.commit.amountCents, 28_000_00);
    assert.equal(f.commit.count, 1);
  });

  test("a closed deal is not in the open pipeline", () => {
    const f = forecast({
      pipeline: PIPELINE,
      deals: [{ ...deal("d1", "won", 50_000_00), committed: true }],
      history: history(),
      now: NOW,
    });
    assert.equal(f.kind, "unreliable");
    if (f.kind === "unreliable") {
      assert.equal(f.deals, 0);
      assert.equal(f.openAmountCents, 0);
      assert.equal(f.commit.amountCents, 0);
    }
  });
});

describe("movement between stages", () => {
  test("forward one stage is an advance", () => {
    assert.equal(transition(PIPELINE, "new", "qualified")?.movement, "advanced");
  });

  /**
   * Normal, and worth recording. A deal regressing from negotiation to
   * discovery is telling you the qualification was wrong, and a pipeline that
   * only ever moves forward is one where people are lying to the CRM.
   */
  test("backwards is recorded, not blocked", () => {
    assert.equal(transition(PIPELINE, "negotiation", "qualified")?.movement, "regressed");
  });

  test("skipping names the stages it skipped", () => {
    const t = transition(PIPELINE, "new", "negotiation");
    assert.equal(t?.movement, "skipped");
    assert.deepEqual(t?.skipped.map((s) => s.id), ["qualified", "proposal"]);
  });

  test("reaching a terminal stage is a close, not an advance", () => {
    assert.equal(transition(PIPELINE, "negotiation", "won")?.movement, "closed");
    assert.equal(transition(PIPELINE, "new", "lost")?.movement, "closed");
  });

  test("leaving a terminal stage is a reopen", () => {
    assert.equal(transition(PIPELINE, "lost", "qualified")?.movement, "reopened");
  });

  test("an unknown stage yields nothing rather than a guess", () => {
    assert.equal(transition(PIPELINE, "new", "nope"), null);
  });

  /**
   * Terminal stages are a property, not a name match. Tenants rename
   * everything, and a "Closed Won" detected by string would break on the
   * first Spanish tenant — which is most of them here.
   */
  test("terminal is a property, not a name", () => {
    const renamed: Pipeline = {
      ...PIPELINE,
      stages: PIPELINE.stages.map((s) =>
        s.id === "won" ? { ...s, name: "Contrato firmado" } : s,
      ),
    };
    assert.equal(transition(renamed, "negotiation", "won")?.movement, "closed");
  });
});

describe("the explanation says what would fix it", () => {
  test("uncalibrated names the shortest stage and the target", () => {
    const f = forecast({
      pipeline: PIPELINE,
      deals: manyDeals(50),
      history: history({ proposal: { entered: 3, won: 1 } }),
      now: NOW,
    });
    const text = explain(f);
    assert.match(text, /proposal/);
    assert.match(text, new RegExp(String(MIN_HISTORY_PER_STAGE)));
    assert.match(text, /inventado/);
  });

  test("unreliable says how many deals are needed", () => {
    const f = forecast({
      pipeline: PIPELINE, deals: manyDeals(4), history: history(), now: NOW,
    });
    assert.match(explain(f), new RegExp(`4 de ${MIN_DEALS_FOR_WEIGHTING}`));
  });

  test("a weighted forecast mentions what it excluded", () => {
    const f = forecast({
      pipeline: PIPELINE,
      deals: [...manyDeals(MIN_DEALS_FOR_WEIGHTING), deal("z", "proposal", 1, 500)],
      history: history(),
      now: NOW,
    });
    assert.match(explain(f), /1 estancado/);
  });
});
