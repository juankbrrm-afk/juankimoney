/**
 * The pipeline, and the forecast that comes off it.
 *
 * `docs/07` §7 scopes the pipeline module: kanban, configurable stages, drag
 * and drop. That part is not hard. The forecast is, and it is where every CRM
 * ever built quietly lies about money.
 *
 * The lie has a standard shape:
 *
 *     forecast = Σ (deal.amount × stageProbability)
 *
 * It appears in Salesforce, HubSpot, Pipedrive and in every spreadsheet
 * anybody has ever rebuilt after not trusting those. It is wrong in three
 * ways that compound, and a sales director runs their quarter on the number
 * it produces.
 *
 * **1. A weighted number is not a possible outcome.** A single $28,000 deal
 * at 60% forecasts $16,800. That will never happen. The deal closes at
 * $28,000 or at nothing. Weighted sums are only meaningful over enough
 * independent deals for the arithmetic to average out, and "enough" is a
 * real number, not a vibe — with eight deals in a pipeline the weighted
 * total is a number with no relationship to any quarter that can actually
 * occur.
 *
 * **2. The stage probabilities are usually invented.** The defaults shipped
 * with every CRM — 10/25/50/75/90 — are not derived from anything. A tenant
 * whose qualified deals close at 12% is handed a forecast built on 50%, and
 * the gap is discovered at the end of the quarter.
 *
 * **3. Time in stage is ignored.** A deal that entered "negotiation" nine
 * months ago is not 75% likely to close. It is dead and nobody has said so.
 * Counting it at stage weight is how a pipeline becomes a graveyard that
 * still reports a number.
 *
 * So this module refuses rather than invents, on the same rule the rest of
 * the codebase runs on: **a claim with no evidence has no representation.**
 * `forecast()` returns a `Uncalibrated` when the tenant has no closed history
 * to derive probabilities from, and an `Unreliable` when the pipeline is too
 * small for weighting to mean anything. Neither of those is a failure state.
 * They are the honest answer, and the same answer `signals/live.py` gives for
 * a close probability with no history behind it: *showing "calibrating" beats
 * showing an invented 73%.*
 */

import type { Opportunity } from "./canonical.ts";

/**
 * Deals below this and a weighted total is arithmetic theatre.
 *
 * The reasoning is the law of large numbers, not a preference. Weighting
 * assumes the wins and losses cancel around the mean; with a handful of deals
 * the variance swamps the estimate, and a single large deal moves the
 * "forecast" by more than the whole rest of the pipeline. Thirty is the
 * conventional threshold for that arithmetic starting to behave, and it is
 * deliberately not configurable downward — the setting exists in other CRMs
 * only so somebody can make the number appear.
 */
export const MIN_DEALS_FOR_WEIGHTING = 30;

/**
 * Closed deals needed before a stage's conversion rate is worth using.
 *
 * Below this the rate is noise. Three of five deals closing is not a 60%
 * stage; it is five deals.
 */
export const MIN_HISTORY_PER_STAGE = 20;

/** Multiples of a stage's typical dwell time before a deal is stalled. */
export const STALL_MULTIPLE = 2.5;

export interface Stage {
  id: string;
  name: string;
  /** Position. Lower is earlier. Gaps allowed so stages can be inserted. */
  order: number;
  /**
   * Terminal stages end the deal. Kept as a property of the stage rather than
   * inferred from the name, because tenants rename everything and a "Closed
   * Won" detected by string match is a bug waiting for a Spanish tenant.
   */
  terminal?: "won" | "lost";
}

export interface Pipeline {
  id: string;
  tenantId: string;
  name: string;
  stages: Stage[];
}

/**
 * What actually happened, per stage, for this tenant.
 *
 * The only legitimate source of a stage probability. Not a default, not an
 * industry benchmark, not a number an admin typed into a settings page while
 * guessing.
 */
export interface StageHistory {
  stageId: string;
  /** Deals that have ever entered this stage and since reached a terminal. */
  entered: number;
  won: number;
  /** Median milliseconds a deal spends here. Used for stall detection. */
  typicalDwellMs: number;
}

export type StageRate =
  | { stageId: string; kind: "measured"; rate: number; sample: number }
  /**
   * Too little history. Deliberately carries no rate at all — an optional
   * number with a fallback is how a default sneaks back in three commits
   * later.
   */
  | { stageId: string; kind: "insufficient"; sample: number; needed: number };

export function stageRate(h: StageHistory): StageRate {
  if (h.entered < MIN_HISTORY_PER_STAGE) {
    return {
      stageId: h.stageId,
      kind: "insufficient",
      sample: h.entered,
      needed: MIN_HISTORY_PER_STAGE,
    };
  }
  return {
    stageId: h.stageId,
    kind: "measured",
    rate: h.won / h.entered,
    sample: h.entered,
  };
}

// ---------------------------------------------------------------------------
// Movement
// ---------------------------------------------------------------------------

export type Movement =
  | "advanced"
  /**
   * Backwards. Normal and worth recording: a deal that regresses from
   * negotiation to discovery is telling you the qualification was wrong, and
   * a pipeline that only moves forward is a pipeline where people are
   * lying to the CRM.
   */
  | "regressed"
  /**
   * Skipped one or more stages. Not blocked — sometimes a deal genuinely
   * arrives ready to sign — but it invalidates the skipped stages' history,
   * so it is named rather than silently treated as an advance.
   */
  | "skipped"
  | "closed"
  | "reopened"
  | "same";

export interface Transition {
  movement: Movement;
  from: Stage;
  to: Stage;
  skipped: Stage[];
}

export function transition(pipeline: Pipeline, fromId: string, toId: string): Transition | null {
  const from = pipeline.stages.find((s) => s.id === fromId);
  const to = pipeline.stages.find((s) => s.id === toId);
  if (!from || !to) return null;

  const between = pipeline.stages.filter(
    (s) => s.order > from.order && s.order < to.order && !s.terminal,
  );

  let movement: Movement;
  if (from.id === to.id) movement = "same";
  else if (to.terminal) movement = "closed";
  else if (from.terminal) movement = "reopened";
  else if (to.order < from.order) movement = "regressed";
  else if (between.length > 0) movement = "skipped";
  else movement = "advanced";

  return { movement, from, to, skipped: movement === "skipped" ? between : [] };
}

// ---------------------------------------------------------------------------
// Stalled deals
// ---------------------------------------------------------------------------

export interface Stalled {
  opportunity: Opportunity;
  stage: Stage;
  inStageMs: number;
  typicalMs: number;
  multiple: number;
}

/**
 * Deals that have been in one stage far longer than that stage usually takes.
 *
 * This is the third lie made visible. A deal sitting in negotiation for nine
 * months is not 75% likely to close — it is dead, and nobody has said so.
 * Counting it at stage weight is how a pipeline becomes a graveyard that
 * still reports a number.
 *
 * Compared against the tenant's own median dwell time rather than a fixed
 * number of days, because "long" in enterprise software and "long" in
 * residential solar are different by an order of magnitude.
 */
export function stalled(
  pipeline: Pipeline,
  deals: { opportunity: Opportunity; stageEnteredAt: number }[],
  history: StageHistory[],
  now: number,
): Stalled[] {
  const dwell = new Map(history.map((h) => [h.stageId, h.typicalDwellMs]));
  const out: Stalled[] = [];

  for (const { opportunity, stageEnteredAt } of deals) {
    const stage = pipeline.stages.find((s) => s.id === opportunity.stageId);
    if (!stage || stage.terminal) continue;

    const typicalMs = dwell.get(stage.id);
    // No dwell history means no opinion. Flagging a deal as stalled against a
    // number we do not have is the same invention this module exists to
    // refuse, one level down.
    if (!typicalMs || typicalMs <= 0) continue;

    const inStageMs = now - stageEnteredAt;
    const multiple = inStageMs / typicalMs;
    if (multiple >= STALL_MULTIPLE) {
      out.push({ opportunity, stage, inStageMs, typicalMs, multiple });
    }
  }

  return out.sort((a, b) => b.multiple - a.multiple);
}

// ---------------------------------------------------------------------------
// The forecast
// ---------------------------------------------------------------------------

export interface Commit {
  /** Deals a human has explicitly committed. Money somebody put their name on. */
  amountCents: number;
  count: number;
}

export type Forecast =
  /**
   * No closed history to derive stage probabilities from.
   *
   * The same answer `signals/live.py` gives for an uncalibrated close model,
   * for the same reason: a generic cross-tenant probability is astrology, and
   * "calibrating" beats an invented 73%.
   */
  | {
      kind: "uncalibrated";
      /** Which stages are short, so onboarding has something to work toward. */
      missing: StageRate[];
      commit: Commit;
    }
  /**
   * Calibrated, but the pipeline is too small for a weighted total to mean
   * anything. The commit number is still real, because a human stood behind
   * each deal in it.
   */
  | {
      kind: "unreliable";
      deals: number;
      needed: number;
      commit: Commit;
      /** The only honest aggregate at this size: what is actually in play. */
      openAmountCents: number;
    }
  | {
      kind: "weighted";
      deals: number;
      /** Σ amount × measured rate. Meaningful only at this sample size. */
      weightedCents: number;
      commit: Commit;
      openAmountCents: number;
      /**
       * Deals excluded for being stalled, and what they were worth. Reported
       * rather than silently dropped: a forecast that quietly removed
       * $400,000 of pipeline is a forecast somebody will rebuild by hand.
       */
      excludedStalled: number;
      excludedCents: number;
    };

export interface ForecastInput {
  pipeline: Pipeline;
  deals: { opportunity: Opportunity; stageEnteredAt: number; committed?: boolean }[];
  history: StageHistory[];
  now: number;
}

/**
 * Forecast the open pipeline, or say why you cannot.
 *
 * Reads as three refusals and one calculation, and the refusals are the
 * product. Anybody can multiply amounts by percentages.
 */
export function forecast(input: ForecastInput): Forecast {
  const { pipeline, deals, history, now } = input;

  const open = deals.filter((d) => {
    const stage = pipeline.stages.find((s) => s.id === d.opportunity.stageId);
    return stage && !stage.terminal;
  });

  const commit: Commit = {
    amountCents: open
      .filter((d) => d.committed)
      .reduce((n, d) => n + (d.opportunity.amountCents ?? 0), 0),
    count: open.filter((d) => d.committed).length,
  };

  const openAmountCents = open.reduce((n, d) => n + (d.opportunity.amountCents ?? 0), 0);

  // Refusal 1: the stage probabilities would have to be invented.
  const rates = new Map<string, StageRate>();
  for (const h of history) rates.set(h.stageId, stageRate(h));

  const nonTerminal = pipeline.stages.filter((s) => !s.terminal);
  const missing = nonTerminal
    .map(
      (s) =>
        rates.get(s.id) ?? {
          stageId: s.id,
          kind: "insufficient" as const,
          sample: 0,
          needed: MIN_HISTORY_PER_STAGE,
        },
    )
    .filter((r) => r.kind === "insufficient");

  if (missing.length > 0) {
    return { kind: "uncalibrated", missing, commit };
  }

  // Refusal 2: the arithmetic does not mean anything at this size.
  if (open.length < MIN_DEALS_FOR_WEIGHTING) {
    return {
      kind: "unreliable",
      deals: open.length,
      needed: MIN_DEALS_FOR_WEIGHTING,
      commit,
      openAmountCents,
    };
  }

  // Refusal 3: dead deals do not get counted at stage weight.
  const isStalled = new Set(
    stalled(pipeline, open, history, now).map((s) => s.opportunity.id),
  );

  let weightedCents = 0;
  let excludedCents = 0;
  for (const d of open) {
    const amount = d.opportunity.amountCents ?? 0;
    if (isStalled.has(d.opportunity.id)) {
      excludedCents += amount;
      continue;
    }
    const rate = rates.get(d.opportunity.stageId);
    if (rate?.kind !== "measured") continue;
    weightedCents += Math.round(amount * rate.rate);
  }

  return {
    kind: "weighted",
    deals: open.length,
    weightedCents,
    commit,
    openAmountCents,
    excludedStalled: isStalled.size,
    excludedCents,
  };
}

/**
 * What the screen says, in one sentence.
 *
 * Every branch names what is missing and what would fix it. "No forecast
 * available" with no explanation is how a customer concludes the feature is
 * broken rather than that their data is thin.
 */
export function explain(f: Forecast): string {
  switch (f.kind) {
    case "uncalibrated": {
      const worst = f.missing.reduce((a, b) => (b.sample < a.sample ? b : a));
      return (
        `Sin forecast: hace falta historial cerrado para derivar las tasas por ` +
        `etapa. La etapa "${worst.stageId}" tiene ${worst.sample} de ` +
        `${MIN_HISTORY_PER_STAGE} negocios cerrados. Un porcentaje por defecto ` +
        `sería inventado.`
      );
    }
    case "unreliable":
      return (
        `Sin forecast ponderado: ${f.deals} de ${f.needed} negocios abiertos. ` +
        `Una suma ponderada sobre tan pocos no es un resultado posible — un ` +
        `negocio grande la mueve más que todo el resto del pipeline.`
      );
    case "weighted":
      return (
        `Ponderado sobre ${f.deals} negocios abiertos` +
        (f.excludedStalled > 0
          ? `, excluyendo ${f.excludedStalled} estancado${f.excludedStalled === 1 ? "" : "s"}.`
          : ".")
      );
    default: {
      const never: never = f;
      throw new Error(`unknown forecast kind: ${String(never)}`);
    }
  }
}
