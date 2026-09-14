/**
 * The call player.
 *
 * Reads the same `call-events.json` the console replays, from the same
 * engines. One call, one set of verdicts, two screens. If this screen and the
 * console ever disagreed about what happened, a supervisor would have to
 * decide which one was lying — and would stop trusting both.
 *
 * Everything with a verdict attached came from Python: the compliance
 * violations from `compliance/engine.py`, the citations from the copilot
 * pipeline, and "the agent used this suggestion" from
 * `postcall/adoption.py`. This file positions them on a timeline.
 */

const $ = (id) => document.getElementById(id);

const state = {
  data: null,
  t: 0,
  playing: false,
  duration: 0,
  track: "processed",
};

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

/* ---------------------------------------------------------------------- */
/* The sentiment ribbon                                                    */
/* ---------------------------------------------------------------------- */

/**
 * Draw the customer's sentiment across the call.
 *
 * A step-free polyline through the observed values, not a smoothed curve.
 * The values already carry the asymmetric smoothing from
 * `signals/live.py` — `RISE_ALPHA` 0.25 against `FALL_ALPHA` 0.85, so a call
 * turning cold shows in one turn — and smoothing them again in the renderer
 * would flatten exactly the drop the supervisor is scrubbing to find.
 */
function ribbon(points, duration) {
  if (points.length === 0) return;
  const W = 1000;
  const H = 76;
  const x = (t) => (t / duration) * W;
  const y = (v) => H / 2 - (v * (H / 2 - 6));

  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`);
  $("ribbon-line").setAttribute("d", d.join(" "));

  const area = [
    `M${x(points[0].t).toFixed(1)},${(H / 2).toFixed(1)}`,
    ...points.map((p) => `L${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`),
    `L${x(points[points.length - 1].t).toFixed(1)},${(H / 2).toFixed(1)}`,
    "Z",
  ];
  $("ribbon-area").setAttribute("d", area.join(" "));
}

/**
 * Event markers on the timeline.
 *
 * The supervisor scrubbing a six-minute call is looking for *where it went
 * wrong* before they are looking for what was said, so the interesting
 * moments have to be visible without reading the transcript.
 */
function marks(events, duration) {
  const container = $("marks");
  const nodes = [];
  for (const e of events) {
    const kind = markKind(e);
    if (!kind) continue;
    const mark = el("div", "mark");
    mark.dataset.kind = kind;
    mark.dataset.t = String(e.t);
    mark.style.left = `${(e.t / duration) * 100}%`;
    mark.title = `${clock(e.t)} — ${e.title ?? e.trigger ?? ""}`;
    mark.addEventListener("click", (ev) => {
      ev.stopPropagation();
      seek(e.t);
    });
    nodes.push(mark);
  }
  container.replaceChildren(...nodes);
}

function markKind(e) {
  if (e.type === "compliance") return `compliance_${e.severity}`;
  if (e.type === "suggestion") return "suggestion";
  return null;
}

/* ---------------------------------------------------------------------- */
/* Transcript                                                              */
/* ---------------------------------------------------------------------- */

function buildTranscript(data) {
  const byTime = new Map();
  for (const e of data.events) {
    if (e.type === "transcript") byTime.set(e.t, { turn: e, annots: [] });
  }

  // Attach each annotation to the turn it happened on or after. A compliance
  // violation detached from the sentence that caused it is a finding the
  // supervisor cannot act on.
  const times = [...byTime.keys()].sort((a, b) => a - b);
  const attach = (t, annot) => {
    let host = times[0];
    for (const x of times) if (x <= t) host = x;
    byTime.get(host)?.annots.push(annot);
  };

  const adopted = new Map();
  for (const u of data.adoption?.uses ?? []) adopted.set(u.suggestion_id, u);

  let suggestionIndex = 0;
  for (const e of data.events) {
    if (e.type === "compliance") {
      attach(e.t, { kind: `compliance_${e.severity}`, e });
    } else if (e.type === "suggestion") {
      // The ids in the adoption report are assigned in the order the
      // suggestions were offered, which is the order they appear here.
      const use = [...adopted.values()][suggestionIndex++];
      attach(e.t, { kind: "suggestion", e, use });
    }
  }

  const rows = [];
  for (const t of times) {
    const { turn, annots } = byTime.get(t);
    const line = el("div", "line");
    line.dataset.speaker = turn.speaker;
    line.dataset.t = String(t);
    line.append(el("span", "line__t", clock(t)));
    line.append(el("span", "line__who", turn.speaker === "agent" ? "Agente" : "Cliente"));
    line.append(el("span", "line__text", turn.text));

    for (const a of annots) line.append(annotation(a));
    line.addEventListener("click", () => seek(t));
    rows.push(line);
  }
  $("transcript").replaceChildren(...rows);
}

function annotation({ kind, e, use }) {
  const node = el("div", "annot");
  node.dataset.kind = kind;

  if (kind.startsWith("compliance")) {
    node.append(el("span", "", kind.endsWith("critical") ? "⛔" : "⚠"));
    node.append(el("strong", "", e.title));
    node.append(el("span", "annot__body", e.remedy));
    if (e.authority) node.append(el("span", "annot__body", `· ${e.authority}`));
    return node;
  }

  node.append(el("span", "", "💡"));
  node.append(el("span", "annot__body", e.text));

  const cite = e.citations?.[0];
  if (cite) {
    const c = el("span", "annot__body", `· ${cite.doc}`);
    c.title = cite.heading;
    node.append(c);
  }

  /**
   * Whether the agent used it — measured by `postcall/adoption.py`, not
   * assumed from the suggestion having been shown.
   *
   * The evidence goes in the title: the share and the distinctive words the
   * agent reproduced. The first supervisor to disagree with "adopted" needs
   * to see what the verdict rested on, which is the same rule the copilot's
   * citations follow.
   */
  if (use) {
    const label = {
      adopted: "el agente la usó",
      echoed: "parcialmente",
      ignored: "no usada",
      already_knew: "ya la sabía",
    }[use.outcome] ?? use.outcome;

    const badge = el("span", "used", label);
    badge.dataset.outcome = use.outcome;
    badge.title =
      `${Math.round(use.share * 100)}% de los términos distintivos` +
      (use.terms.length ? ` · ${use.terms.join(", ")}` : "");
    node.append(badge);
  }
  return node;
}

/* ---------------------------------------------------------------------- */
/* Transport                                                               */
/* ---------------------------------------------------------------------- */

function seek(t) {
  state.t = Math.max(0, Math.min(state.duration, t));
  paint();
}

function paint() {
  const pct = (state.t / state.duration) * 100;
  $("playhead").style.left = `${pct}%`;
  $("clock").textContent = `${clock(state.t)} / ${clock(state.duration)}`;

  let current = null;
  for (const line of $("transcript").children) {
    const t = Number(line.dataset.t);
    if (t <= state.t) current = line;
    line.dataset.current = "no";
  }
  if (current) current.dataset.current = "yes";
}

let raf = 0;
let last = 0;

function loop(now) {
  if (!state.playing) return;
  state.t += (now - last) / 1000;
  last = now;
  if (state.t >= state.duration) {
    state.t = state.duration;
    paint();
    return pause();
  }
  paint();
  raf = requestAnimationFrame(loop);
}

function play() {
  if (state.playing) return;
  state.playing = true;
  $("play").textContent = "⏸ Pausa";
  last = performance.now();
  raf = requestAnimationFrame(loop);
}

function pause() {
  state.playing = false;
  $("play").textContent = "▶ Reproducir";
  cancelAnimationFrame(raf);
}

/* ---------------------------------------------------------------------- */
/* Boot                                                                    */
/* ---------------------------------------------------------------------- */

function verdicts(data) {
  const out = [];
  const critical = data.compliance_live.filter((v) => v.severity === "critical").length;

  out.push([
    critical > 0
      ? `${critical} violación${critical === 1 ? "" : "es"} crítica${critical === 1 ? "" : "s"}`
      : "Sin violaciones críticas",
    critical > 0 ? "critical" : "positive",
  ]);

  out.push([`Guion ${Math.round(data.script.score * 100)}%`,
            data.script.score === 1 ? "positive" : "neutral"]);

  if (data.adoption?.summary) out.push([data.adoption.summary, "ai"]);

  const t = data.turns;
  out.push([`${t.withheld} sugerencia${t.withheld === 1 ? "" : "s"} retenida${t.withheld === 1 ? "" : "s"}`,
            "neutral"]);

  return out.map(([text, tone]) => {
    const chip = el("span", "chip", text);
    chip.dataset.tone = tone;
    return chip;
  });
}

/**
 * The track selector, wired honestly.
 *
 * Both tracks are real product features and neither has a file behind it in
 * this fixture, so the control switches and then says what is not there. The
 * alternative — a play button that produces silence, or a drawn waveform
 * over nothing — is the lie that gets discovered during the demo, by the
 * customer, when they press play.
 */
function wireTracks(data) {
  const labels = {
    processed: "la voz convertida que oyó el cliente",
    raw: "la voz original del agente, sin convertir",
  };

  const set = (which) => {
    state.track = which;
    $("track-processed").setAttribute("aria-pressed", String(which === "processed"));
    $("track-raw").setAttribute("aria-pressed", String(which === "raw"));

    const available = data.audio?.[which];
    $("notice").hidden = Boolean(available);
    if (!available) {
      $("notice-text").textContent =
        `Esta llamada no tiene grabación adjunta. La pista seleccionada es ` +
        `${labels[which]}; el reproductor recorre la transcripción y los ` +
        `eventos, sin audio.`;
    }
  };

  $("track-processed").addEventListener("click", () => set("processed"));
  $("track-raw").addEventListener("click", () => set("raw"));
  set("processed");
}

async function boot() {
  // Shared with the console rather than copied. Two fixtures for one call is
  // how the two screens start disagreeing.
  const data = await (await fetch("../console/call-events.json")).json();
  state.data = data;
  state.duration = data.call.hangup_ms / 1000;

  $("title").textContent = `${data.call.customer} · ${data.call.campaign}`;
  $("meta").textContent =
    `${data.call.phone} · agente ${data.call.agent} · modo ${data.call.mode} · ` +
    `${clock(state.duration)}`;
  $("verdicts").replaceChildren(...verdicts(data));

  const points = data.events
    .filter((e) => e.type === "signal" && e.signal === "sentiment")
    .map((e) => ({ t: e.t, v: e.value }));
  ribbon(points, state.duration);
  marks(data.events, state.duration);
  buildTranscript(data);
  wireTracks(data);

  $("play").addEventListener("click", () => (state.playing ? pause() : play()));
  $("timeline").addEventListener("click", (ev) => {
    const box = ev.currentTarget.getBoundingClientRect();
    seek(((ev.clientX - box.left) / box.width) * state.duration);
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === " " && ev.target === document.body) {
      state.playing ? pause() : play();
      ev.preventDefault();
    }
    if (ev.key === "ArrowLeft") seek(state.t - 5);
    if (ev.key === "ArrowRight") seek(state.t + 5);
  });

  paint();
  document.body.dataset.ready = "yes";
}

boot();
