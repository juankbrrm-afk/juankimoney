/**
 * The post-call report.
 *
 * Third screen onto the same fixture. Nothing here computes: the summary,
 * the items, the metrics, the disposition proposal and the reject count all
 * came out of `postcall/`, and this file arranges them.
 *
 * The one piece of behaviour it *does* own is the disposition gate, and it
 * owns only the interaction — `crm_writes()` already decides that an
 * unconfirmed disposition earns no write. This file shows the consequence.
 */

const $ = (id) => document.getElementById(id);

const state = { data: null, confirmed: false };

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function clock(s) {
  const n = Math.max(0, Math.floor(s));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
}

/**
 * Jump to the moment in the player.
 *
 * Every quote on this page is clickable for one reason: a supervisor who
 * disagrees with a line item needs to hear it, not read our transcription of
 * it. Being one click from the audio is what makes the report arguable, and
 * a report you cannot argue with is one you stop reading.
 */
function jump(at) {
  window.location.href = `../player/index.html#t=${at}`;
}

function anchor(quote, at) {
  const button = el("button", "anchor");
  button.type = "button";
  button.append(el("span", "anchor__t", clock(at)));
  button.append(el("span", "anchor__quote", `“${quote}”`));
  button.addEventListener("click", () => jump(at));
  return button;
}

/**
 * Find when a summary quote was said.
 *
 * The transcript is in the fixture, so this is a lookup rather than a
 * decision — `postcall/extract.py` already proved every one of these quotes
 * is locatable, and refused to emit the summary otherwise. Matching here is
 * loose on punctuation for the same reason `_locate` is: a quote that
 * differs by an apostrophe is still the same quote, and failing it would
 * train somebody to loosen the real check upstream.
 */
function momentOf(quote, events) {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  const needle = norm(quote);
  for (const e of events) {
    if (e.type === "transcript" && norm(e.text).includes(needle)) return e.t;
  }
  return null;
}

const KIND_LABEL = {
  key_point: "Punto clave",
  objection: "Objeción",
  next_step: "Siguiente paso",
  product: "Producto",
  competitor: "Competencia",
  commitment: "Compromiso",
};

function renderItems(data) {
  const nodes = data.analysis.items.map((i) => {
    const node = el("article", "item");
    node.dataset.kind = i.kind;
    node.append(el("span", "item__kind", KIND_LABEL[i.kind] ?? i.kind));

    const body = el("div");
    body.append(el("p", "item__text", i.text));

    // The verbatim quote sits under the model's reading, always. Keeping
    // both is what lets a supervisor disagree: they see what the AI
    // concluded next to the words it concluded it from.
    const quote = el("button", "item__quote");
    quote.type = "button";
    quote.append(el("span", "item__t", clock(i.at)));
    quote.append(el("span", "", `“${i.quote}”`));
    quote.addEventListener("click", () => jump(i.at));
    body.append(quote);

    node.append(body);
    return node;
  });
  $("items").replaceChildren(...nodes);

  const n = data.analysis.rejected;
  $("rejected").dataset.any = n > 0 ? "yes" : "no";
  $("rejected-text").textContent =
    n === 0
      ? "El modelo no propuso nada que no se dijera en la llamada."
      : `${n} extracción${n === 1 ? "" : "es"} descartada${n === 1 ? "" : "s"}: ` +
        `la cita no estaba en la transcripción. Se cuenta a propósito — que ` +
        `este número suba es la señal más temprana de que el modelo se está ` +
        `desviando.`;
}

/**
 * Talk metrics. Arithmetic over timestamps, no model.
 *
 * `postcall/analysis.py` is explicit about why: *a talk ratio that is
 * occasionally invented is worse than no talk ratio, because coaching
 * decisions get made from it.*
 */
function renderMetrics(data) {
  const m = data.analysis.metrics;
  const nodes = [];

  const ratio = el("div", "metric");
  ratio.dataset.flag = m.talk_ratio > 0.65 ? "high" : "ok";
  ratio.append(el("span", "metric__n num", `${Math.round(m.talk_ratio * 100)}%`));
  ratio.append(el("div", "metric__label", "habló el agente"));
  const split = el("div", "split");
  const a = el("div", "split__agent");
  a.style.width = `${m.talk_ratio * 100}%`;
  const c = el("div", "split__customer");
  c.style.width = `${(1 - m.talk_ratio) * 100}%`;
  split.append(a, c);
  ratio.append(split);
  if (m.talk_ratio > 0.65) {
    ratio.append(el("div", "metric__note", "Por encima de 65%. Es lo más coacheable del reporte."));
  }
  nodes.push(ratio);

  const mono = el("div", "metric");
  mono.append(el("span", "metric__n num", `${Math.round(m.longest_agent_monologue_ms / 1000)}s`));
  mono.append(el("div", "metric__label", "monólogo más largo"));
  nodes.push(mono);

  const inter = el("div", "metric");
  inter.append(el("span", "metric__n num", String(m.interruptions)));
  inter.append(el("div", "metric__label", "interrupciones"));
  nodes.push(inter);

  const silence = el("div", "metric");
  silence.append(el("span", "metric__n num", `${Math.round(m.silence_ms / 1000)}s`));
  silence.append(el("div", "metric__label", "silencio"));
  nodes.push(silence);

  $("metrics").replaceChildren(...nodes);
}

/**
 * The CRM writes, recomputed for display when the disposition is confirmed.
 *
 * The gated row is rendered either way — dashed and greyed while it does not
 * exist yet. Showing the write that a confirmation *would* produce is how
 * the gate becomes legible: a supervisor can see there is a pipeline update
 * waiting on them, rather than discovering later that confirming had a
 * consequence nobody mentioned.
 */
function renderWrites(data) {
  const nodes = data.crm_writes.map((w) => writeRow(w, false));

  const disp = data.analysis.disposition;
  if (disp && !data.crm_writes.some((w) => w.entity === "lead")) {
    nodes.push(
      writeRow(
        {
          entity: "lead",
          operation: "update",
          payload: { disposition: disp.value, evidence: disp.quote },
        },
        !state.confirmed,
      ),
    );
  }

  $("writes").replaceChildren(...nodes);
  const live = nodes.filter((n) => n.dataset.gated !== "yes").length;
  $("writes-count").textContent = `· ${live} de ${nodes.length}`;
}

function writeRow(w, gated) {
  const node = el("div", "write");
  node.dataset.gated = gated ? "yes" : "no";
  node.dataset.entity = w.entity;
  node.append(el("span", "write__entity", `${w.entity} ${w.operation}`));

  const body = el("span", "write__body");
  if (w.entity === "note") {
    body.textContent = String(w.payload.body).slice(0, 180) + "…";
    const anchors = w.payload.anchors ?? [];
    body.append(el("div", "metric__note",
      `${anchors.length} marca${anchors.length === 1 ? "" : "s"} de tiempo viajan con la nota, ` +
      "para poder saltar a la grabación desde el CRM."));
  } else if (w.entity === "task") {
    body.textContent = String(w.payload.title);
    body.append(el("div", "metric__note", `Evidencia: “${w.payload.evidence}”`));
  } else {
    body.textContent = `disposición → ${w.payload.disposition}`;
    if (gated) {
      body.append(el("div", "metric__note",
        "No se escribe hasta que un humano confirme la disposición."));
    }
  }
  node.append(body);
  return node;
}

function renderDisposition(data) {
  const disp = data.analysis.disposition;
  if (!disp) {
    $("disposition").hidden = true;
    return;
  }

  const LABEL = {
    interested: "Interesado",
    not_interested: "No interesado",
    callback: "Volver a llamar",
    sale: "Venta",
    do_not_call: "No llamar",
  };

  $("disp-value").textContent = LABEL[disp.value] ?? disp.value;
  $("disp-t").textContent = clock(disp.at);
  $("disp-quote").textContent = `“${disp.quote}”`;
  $("disp-anchor").addEventListener("click", () => jump(disp.at));

  const setConfirmed = (yes) => {
    state.confirmed = yes;
    $("disposition").dataset.confirmed = yes ? "yes" : "no";
    $("disp-state").textContent = yes ? "Confirmada por un humano" : "Sin confirmar";
    $("disp-actions").hidden = yes;
    renderWrites(data);
  };

  $("disp-confirm").addEventListener("click", () => setConfirmed(true));
  $("disp-reject").addEventListener("click", () => {
    // Rejecting does not silently pick another value. It clears the proposal
    // and leaves the disposition to the human — the same refusal as
    // `binding.ts` declining to guess which record is open.
    $("disp-value").textContent = "Sin disposición";
    $("disp-quote").textContent = "El agente la elegirá en el CRM.";
    $("disp-t").textContent = "";
    $("disp-actions").hidden = true;
    state.data = { ...data, analysis: { ...data.analysis, disposition: null } };
    renderWrites(state.data);
  });

  setConfirmed(false);
}

async function boot() {
  const data = await (await fetch("../console/call-events.json")).json();
  state.data = data;

  $("title").textContent = `${data.call.customer} · ${data.call.campaign}`;
  $("meta").textContent =
    `${data.call.phone} · agente ${data.call.agent} · ` +
    `${clock(data.call.hangup_ms / 1000)} · modo ${data.call.mode}`;

  $("summary").textContent = data.analysis.summary;
  $("anchors").replaceChildren(
    ...data.analysis.summary_quotes.map((q) => {
      const at = momentOf(q, data.events);
      return anchor(q, at ?? 0);
    }),
  );

  renderItems(data);
  renderMetrics(data);
  renderDisposition(data);
  renderWrites(data);

  document.body.dataset.ready = "yes";
}

boot();
