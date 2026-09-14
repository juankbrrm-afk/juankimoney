/**
 * Generate the pipeline board's fixture from the real forecast engine.
 *
 * The board shows one tenant's live pipeline. What makes it worth building is
 * the panel next to it: `forecast()` from `shared/crm/src/pipeline.ts`, which
 * refuses to produce a weighted number unless the tenant's own closed history
 * supports the stage rates and the pipeline is large enough for weighting to
 * mean anything.
 *
 * Three states are emitted, not one:
 *
 *   `main`          a calibrated tenant with 34 open deals — the weighted
 *                   case, including four dead deals it excludes and names
 *   `newTenant`     no closed history yet. No forecast, and it says which
 *                   stage is short and by how much
 *   `smallPipeline` calibrated but only nine deals open. Still no weighted
 *                   number, because a weighted sum over nine deals is not a
 *                   quarter that can occur
 *
 * The board renders `main`; the other two exist so the screen's refusal
 * states are rendered from real engine output rather than mocked, and so the
 * test can check them.
 *
 *     node --experimental-strip-types generate_fixture.mjs > board.json
 */

import {
  MIN_DEALS_FOR_WEIGHTING,
  MIN_HISTORY_PER_STAGE,
  explain,
  forecast,
  stageRate,
  stalled,
} from "../../shared/crm/src/pipeline.ts";

const DAY = 86_400_000;
const NOW = Date.parse("2026-09-14T15:00:00Z");

const PIPELINE = {
  id: "p1", tenantId: "solaris", name: "Solar Q3",
  stages: [
    { id: "new", name: "Nuevo", order: 10 },
    { id: "qualified", name: "Calificado", order: 20 },
    { id: "proposal", name: "Propuesta", order: 30 },
    { id: "negotiation", name: "Negociación", order: 40 },
    { id: "won", name: "Ganado", order: 50, terminal: "won" },
    { id: "lost", name: "Perdido", order: 60, terminal: "lost" },
  ],
};

/**
 * What actually closed, per stage, for this tenant.
 *
 * Note the rates: 41% of qualified deals close, not the 50% every CRM ships
 * as a default, and negotiation is 68% rather than 90%. The gap between these
 * and the defaults is the entire argument for measuring.
 */
const HISTORY = [
  { stageId: "new", entered: 412, won: 71, typicalDwellMs: 4 * DAY },
  { stageId: "qualified", entered: 244, won: 100, typicalDwellMs: 9 * DAY },
  { stageId: "proposal", entered: 151, won: 82, typicalDwellMs: 12 * DAY },
  { stageId: "negotiation", entered: 97, won: 66, typicalDwellMs: 8 * DAY },
];

const NAMES = [
  "Michael Reed", "Denise Fowler", "Harold Nguyen", "Trent Okafor",
  "Lena Brooks", "Sam Whitfield", "Erica Downs", "Ahmed Rahimi",
  "Joyce Tan", "Marcus Hale", "Priya Raman", "Dale Whitmore",
  "Carmen Ortiz", "Bill Teague", "Nadia Farouk", "Greg Lindqvist",
  "Rosa Beltrán", "Tim Oyelaran", "Hannah Voss", "Ken Abara",
  "Ilse Márquez", "Doug Fenwick", "Amara Osei", "Petra Lindholm",
  "Victor Salas", "Jon Whitaker", "Ruth Kimani", "Élodie Reyes",
  "Stan Mikkelsen", "Bea Lindgren", "Omar Haddad", "Fay Corrigan",
  "Leo Vanterpool", "Marta Quispe",
];

const OWNERS = ["Andrés M.", "Paola R.", "Luis T.", "Karina S.", "Marcela D."];

/** Deterministic pseudo-random, so the fixture does not churn on every run. */
function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function buildDeals(count, { stalledCount = 0 } = {}) {
  const rand = rng(7);
  const open = ["new", "qualified", "proposal", "negotiation"];
  const deals = [];

  for (let i = 0; i < count; i++) {
    const stageId = open[i % open.length];
    const dwellDays = HISTORY.find((h) => h.stageId === stageId).typicalDwellMs / DAY;

    // The last `stalledCount` deals have been sitting far too long. These are
    // the ones every other CRM still counts at full stage weight.
    const isStalled = i >= count - stalledCount;
    const daysInStage = isStalled
      ? Math.round(dwellDays * (4 + rand() * 6))
      : Math.round(rand() * dwellDays * 1.5);

    deals.push({
      opportunity: {
        id: `o-${1000 + i}`, tenantId: "solaris",
        createdAt: "2026-06-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z",
        externalIds: {}, customFields: {},
        pipelineId: "p1", stageId,
        name: NAMES[i % NAMES.length],
        amountCents: Math.round((14_000 + rand() * 30_000)) * 100,
        currency: "USD",
        ownerId: OWNERS[i % OWNERS.length],
      },
      stageEnteredAt: NOW - daysInStage * DAY,
      // A handful of deals somebody has personally committed.
      committed: i % 11 === 0 && stageId === "negotiation",
    });
  }
  return deals;
}

const MAIN_DEALS = buildDeals(34, { stalledCount: 4 });

function serialiseForecast(f) {
  return { ...f, explanation: explain(f) };
}

function serialiseDeals(deals, stalledIds) {
  return deals.map(({ opportunity: o, stageEnteredAt, committed }) => ({
    id: o.id, name: o.name, stageId: o.stageId,
    amountCents: o.amountCents, owner: o.ownerId,
    daysInStage: Math.round((NOW - stageEnteredAt) / DAY),
    committed: Boolean(committed),
    stalled: stalledIds.has(o.id),
  }));
}

const stalledDeals = stalled(PIPELINE, MAIN_DEALS, HISTORY, NOW);
const stalledIds = new Set(stalledDeals.map((s) => s.opportunity.id));

/** A tenant with almost nothing closed yet. */
const NEW_TENANT_HISTORY = HISTORY.map((h) => ({
  ...h,
  entered: h.stageId === "negotiation" ? 4 : h.entered,
  won: h.stageId === "negotiation" ? 2 : h.won,
}));

process.stdout.write(JSON.stringify({
  pipeline: PIPELINE,
  now: NOW,
  rates: PIPELINE.stages
    .filter((s) => !s.terminal)
    .map((s) => {
      const h = HISTORY.find((x) => x.stageId === s.id);
      return { ...stageRate(h), name: s.name, typicalDwellDays: h.typicalDwellMs / DAY };
    }),
  deals: serialiseDeals(MAIN_DEALS, stalledIds),
  stalled: stalledDeals.map((s) => ({
    id: s.opportunity.id, name: s.opportunity.name, stage: s.stage.name,
    days: Math.round(s.inStageMs / DAY),
    typicalDays: Math.round(s.typicalMs / DAY),
    multiple: Number(s.multiple.toFixed(1)),
    amountCents: s.opportunity.amountCents ?? 0,
  })),
  forecast: serialiseForecast(
    forecast({ pipeline: PIPELINE, deals: MAIN_DEALS, history: HISTORY, now: NOW }),
  ),
  // The two refusals, from the same engine, so the screen's empty states are
  // rendered from real output rather than written by hand.
  refusals: {
    newTenant: serialiseForecast(
      forecast({
        pipeline: PIPELINE, deals: MAIN_DEALS,
        history: NEW_TENANT_HISTORY, now: NOW,
      }),
    ),
    smallPipeline: serialiseForecast(
      forecast({
        pipeline: PIPELINE, deals: buildDeals(9),
        history: HISTORY, now: NOW,
      }),
    ),
  },
  thresholds: {
    minDealsForWeighting: MIN_DEALS_FOR_WEIGHTING,
    minHistoryPerStage: MIN_HISTORY_PER_STAGE,
  },
  generated_by: "frontend/pipeline/generate_fixture.mjs — real forecast engine",
}, null, 1));
