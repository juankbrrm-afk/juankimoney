/**
 * The pipeline board.
 *
 * `forecast()` produced every number in the panel, including the decision not
 * to produce one. This file renders whichever of the three shapes came back
 * and never computes a fallback — a UI that fills in a weighted total when
 * the engine declined would reintroduce exactly the invention the engine
 * exists to refuse, one layer up and out of reach of its tests.
 */

const $ = (id) => document.getElementById(id);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Whole dollars. Cents on a pipeline total are noise pretending to be rigour. */
const money = (cents) =>
  `$${Math.round(cents / 100).toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;

const pct = (r) => `${Math.round(r * 100)}%`;

/* ---------------------------------------------------------------------- */
/* Board                                                                   */
/* ---------------------------------------------------------------------- */

function renderBoard(data) {
  const rates = new Map(data.rates.map((r) => [r.stageId, r]));
  const columns = data.pipeline.stages
    .filter((s) => !s.terminal)
    .map((stage) => {
      const deals = data.deals.filter((d) => d.stageId === stage.id);
      const sum = deals.reduce((n, d) => n + d.amountCents, 0);

      const column = el("section", "column");
      column.dataset.stage = stage.id;

      const head = el("div", "column__head");
      head.append(el("span", "column__name", stage.name));
      head.append(el("span", "column__n num", String(deals.length)));

      const rate = rates.get(stage.id);
      if (rate?.kind === "measured") {
        const chip = el("span", "column__rate num", pct(rate.rate));
        // The sample size is the whole point of showing the rate, so it goes
        // where somebody checking the number will look for it.
        chip.title =
          `${pct(rate.rate)} de los negocios que pasaron por "${stage.name}" ` +
          `se cerraron, sobre ${rate.sample}. Medido en este tenant, no un ` +
          `porcentaje por defecto.`;
        head.append(chip);
      }
      head.append(el("span", "column__sum money", money(sum)));
      column.append(head);

      for (const d of deals) column.append(dealCard(d));
      return column;
    });

  $("board").replaceChildren(...columns);
}

function dealCard(d) {
  const node = el("article", "deal");
  node.dataset.dealId = d.id;
  node.dataset.stalled = d.stalled ? "yes" : "no";
  node.dataset.committed = d.committed ? "yes" : "no";

  node.append(el("span", "deal__name", d.name));
  node.append(el("span", "deal__amount money", money(d.amountCents)));

  const meta = el("div", "deal__meta");
  meta.append(el("span", "", d.owner));
  if (d.committed) meta.append(el("span", "deal__badge", "comprometido"));
  meta.append(el("span", "deal__days num", `${d.daysInStage}d`));
  node.append(meta);

  if (d.stalled) {
    node.title = `${d.daysInStage} días en esta etapa. No cuenta en el forecast.`;
  }
  return node;
}

/* ---------------------------------------------------------------------- */
/* Forecast panel                                                          */
/* ---------------------------------------------------------------------- */

function renderForecast(data) {
  const f = data.forecast;
  const headline = $("headline");
  const rows = $("rows");

  if (f.kind === "weighted") {
    headline.replaceChildren(
      el("span", "headline__n money", money(f.weightedCents)),
      el("span", "headline__sub", f.explanation),
    );
    $("refusal").hidden = true;
  } else {
    // No number. The panel says so where the number would be, rather than
    // showing a zero or a dash — both of which read as "broken".
    headline.replaceChildren(el("span", "headline__sub", "Sin forecast ponderado"));
    $("refusal").hidden = false;
    $("refusal").replaceChildren(
      el("strong", "", f.kind === "uncalibrated" ? "Falta historial" : "Pipeline pequeño"),
      el("span", "", f.explanation),
    );
  }

  const list = [];

  // Always real: a sum of amounts somebody entered, not an estimate.
  const open = "openAmountCents" in f ? f.openAmountCents : null;
  if (open !== null) {
    list.push(row("Pipeline abierto", money(open), null,
      "Suma de los montos. No es una estimación."));
  }

  list.push(row(
    "Comprometido", money(f.commit.amountCents), "commit",
    (f.commit.count === 1
      ? "1 negocio en el que una persona puso su nombre."
      : `${f.commit.count} negocios en los que una persona puso su nombre.`) +
    " Sobrevive a cualquier negativa de arriba porque no es una estimación.",
  ));

  if (f.kind === "weighted" && f.excludedStalled > 0) {
    list.push(row(
      "Excluido", money(f.excludedCents), "excluded",
      `${f.excludedStalled} negocios llevan demasiado tiempo parados. Se ` +
      "restan del ponderado y se nombran abajo — un forecast que quita " +
      "pipeline en silencio es uno que alguien rehace a mano.",
    ));
  }

  rows.replaceChildren(...list);
}

function row(k, v, tone, note) {
  const node = el("div", "row");
  if (tone) node.dataset.tone = tone;
  node.append(el("span", "row__k", k));
  node.append(el("span", "row__v money", v));
  if (note) node.append(el("span", "row__note", note));
  return node;
}

/**
 * The basis: each stage's measured rate and the sample behind it.
 *
 * "41% of your qualified deals closed, across 244 of them" is checkable.
 * "50%" is not, and the difference is why every sales director rebuilds the
 * forecast in a spreadsheet.
 */
function renderBasis(data) {
  const nodes = data.rates.map((r) => {
    const node = el("div", "basis__row");
    node.dataset.stage = r.stageId;
    node.append(
      el("span", "basis__rate num", r.kind === "measured" ? pct(r.rate) : "—"),
    );
    node.append(el("span", "", r.name));
    node.append(
      el(
        "span",
        "basis__n num",
        r.kind === "measured"
          ? `n=${r.sample}`
          : `${r.sample}/${r.needed}`,
      ),
    );
    return node;
  });
  $("basis").replaceChildren(...nodes);

  const short = data.rates.filter((r) => r.kind !== "measured").length;
  $("basis-note").textContent = short
    ? `${short} etapa${short === 1 ? "" : "s"} sin historial suficiente ` +
      `(${data.thresholds.minHistoryPerStage} cierres). Hasta que lo haya, no ` +
      "hay tasa: un porcentaje por defecto sería inventado."
    : "Tasas medidas sobre los cierres de este tenant. Ningún CRM deriva de " +
      "nada los 10/25/50/75/90 que trae de fábrica, y la diferencia se " +
      "descubre al final del trimestre.";
}

function renderExcluded(data) {
  if (data.stalled.length === 0) return;
  $("excluded-block").hidden = false;
  $("excluded").replaceChildren(
    ...data.stalled.map((s) => {
      const node = el("div", "excluded__row");
      node.dataset.dealId = s.id;
      node.append(el("span", "", s.name));
      node.append(el("span", "basis__n", `${s.days}d en ${s.stage}`));
      node.append(el("span", "excluded__mult num", `${s.multiple}×`));
      return node;
    }),
  );
}

async function boot() {
  const data = await (await fetch("board.json")).json();

  $("title").textContent = data.pipeline.name;
  const open = data.deals.length;
  $("meta").textContent =
    `${open} negocios abiertos · ${data.stalled.length} estancados · ` +
    `tasas medidas sobre ${data.rates.reduce((n, r) => n + r.sample, 0)} cierres`;

  renderBoard(data);
  renderForecast(data);
  renderBasis(data);
  renderExcluded(data);

  document.body.dataset.ready = "yes";
}

boot();
