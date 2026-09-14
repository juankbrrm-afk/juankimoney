/**
 * Render the floor. The ranking is not computed here.
 *
 * `triage()` in `ai-services/copilot-core/signals/triage.py` decided the
 * order, the scores and the reasons; this file puts them on screen in the
 * order they arrived. There is deliberately no `.sort()` anywhere in the
 * attention list — re-sorting in the browser is how a dashboard ends up
 * disagreeing with the report that quotes the same numbers, and the
 * supervisor is the one who has to reconcile them.
 */

const $ = (id) => document.getElementById(id);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Durations read as minutes on this screen; a call is rarely under one. */
function duration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * One of the three.
 *
 * The card leads with the agent's name, not the customer's. The supervisor
 * is deciding who to help.
 */
function card(c) {
  const node = el("article", "card");
  node.dataset.callId = c.call_id;
  node.dataset.acknowledged = c.acknowledged ? "yes" : "no";
  node.dataset.critical = c.factors.some((f) => f.name === "compliance") ? "yes" : "no";

  const top = el("div", "card__top");
  top.append(el("span", "card__agent", c.agent));
  top.append(el("span", "card__dur num", duration(c.duration_s)));
  node.append(top);
  node.append(el("p", "card__meta", `${c.customer} · ${c.campaign} · ${c.call_id}`));

  const factors = el("ul", "factors");
  for (const f of c.factors) {
    const li = el("li", "factor");
    li.dataset.name = f.name;
    li.append(el("span", "factor__dot"));
    li.append(el("span", "", f.detail));
    factors.append(li);
  }
  node.append(factors);

  if (c.note) node.append(el("p", "card__note", c.note));

  const actions = el("div", "card__actions");
  const listen = el("button", "", "Escuchar");
  listen.type = "button";
  listen.dataset.primary = "";
  const whisper = el("button", "", "Susurrar al agente");
  whisper.type = "button";
  actions.append(listen, whisper);
  node.append(actions);

  // An acknowledged call says so, rather than just being faded. The fade
  // alone reads as "stale data" to somebody who did not make the click.
  if (c.acknowledged) {
    node.append(el("p", "card__meta", "Ya reconocida — pesa 0.4× en el ranking"));
  }
  return node;
}

function render(data) {
  $("t-active").textContent = data.totals.active;
  $("t-risk").textContent = data.totals.at_risk;
  $("t-agents").textContent = data.totals.agents;

  const quiet = data.attention.length === 0;
  $("allclear").hidden = !quiet;
  $("attention").hidden = quiet;
  $("attention-label").hidden = quiet;
  $("attention").replaceChildren(...data.attention.map(card));

  // The longest call on the floor is the row a supervisor will ask about,
  // because every dashboard they have used before put it first. Marking it
  // is cheaper than having the conversation each time.
  const longest = data.rest.reduce(
    (a, b) => (b.duration_s > (a?.duration_s ?? -1) ? b : a),
    null,
  );

  const rows = data.rest.map((c) => {
    const tr = el("tr");
    tr.dataset.callId = c.call_id;
    if (c === longest) tr.dataset.longest = "";
    tr.append(el("td", "agent", c.agent));
    tr.append(el("td", "", c.customer));
    tr.append(el("td", "", c.campaign));
    tr.append(el("td", "dur num", duration(c.duration_s)));

    const score = el("td", "score num", c.score.toFixed(2));
    score.dataset.zero = c.score === 0 ? "yes" : "no";
    tr.append(score);

    // Why this row is not in the top three — but only where that question
    // gets asked. Repeating "no risk signals" under nine calm calls turns
    // the boring half of the screen into something the supervisor has to
    // read, which is exactly what this section exists not to be.
    const reason = explain(c, c === longest);
    if (!reason) return [tr];

    const why = el("tr");
    if (c === longest) why.dataset.longest = "";
    const cell = el("td", "why");
    cell.colSpan = 5;
    cell.textContent = reason;
    why.append(cell);
    return [tr, why];
  });

  $("rest").replaceChildren(...rows.flat());
}

/** The reason, or nothing at all when the row speaks for itself. */
function explain(c, isLongest) {
  if (c.acknowledged) {
    return `${c.factors.map((f) => f.detail).join(" · ")} — reconocida, pondera 0.4× y por eso no está arriba`;
  }
  if (c.factors.length > 0) {
    return `${c.factors.map((f) => f.detail).join(" · ")} — por debajo de las tres primeras`;
  }
  if (isLongest) {
    return "La llamada más larga del piso, sin señales de riesgo. " +
      "Ordenar por duración la pondría primera; por riesgo no aparece.";
  }
  return "";
}

async function boot() {
  const res = await fetch("floor.json");
  render(await res.json());
  document.body.dataset.ready = "yes";
}

boot();
