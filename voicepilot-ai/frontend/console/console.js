/**
 * Replay a real call into the agent console.
 *
 * This file renders. It decides nothing.
 *
 * That is not a style preference, it is the constraint from
 * `frontend/README.md`: *if a rule exists only in the frontend, it is an
 * architecture bug waiting to be exploited by somebody with devtools open.*
 * So there is no threshold in here, no grounding check, no alert budget, no
 * stage inference. Those decisions were already made by the copilot
 * pipeline, the compliance engine and the script evaluator, and they arrive
 * as events. The most this module does with an event is choose which DOM
 * shape expresses it.
 *
 * Two places make that concrete and are worth finding before changing
 * anything:
 *
 *  - `applySuggestion` does not check for citations. It cannot: a
 *    `Suggestion` without them cannot be constructed in `copilot/types.py`,
 *    so a suggestion event carrying none is a backend bug and must surface
 *    as one rather than be silently tidied up here.
 *  - `silence` events are rendered, not skipped. The pipeline choosing to
 *    say nothing is the product working, and the console says so.
 */

const $ = (id) => document.getElementById(id);

/** docs/12 §6. Stated here so the UI can show `n / 3`, not enforce it. */
const LIVE_ALERT_BUDGET = 3;

/**
 * How fast the suggestion text streams in, per word.
 *
 * docs/12 §6: *the agent starts reading at ~300 ms even though generation
 * finishes at 800 ms. Perception over real latency.* This number exists to
 * reproduce that feel from a fixture where the text is already complete —
 * in production it is paced by the model's tokens, not by a timer.
 */
const WORD_MS = 28;

const state = {
  data: null,
  /** Playback position in seconds. */
  t: 0,
  playing: false,
  rate: 1,
  /** Index of the next event to apply. Rewinding resets it. */
  cursor: 0,
  /** Sequence number of the suggestion being streamed, so a superseded
   *  stream stops writing into a card that is no longer on screen. */
  stream: 0,
  acknowledged: false,
  liveAlerts: 0,
  /** Where the call is, per `current_stage()`. Not where it has been. */
  stage: null,
};

/* ---------------------------------------------------------------------- */
/* Formatting                                                              */
/* ---------------------------------------------------------------------- */

function clock(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Build DOM by hand rather than assembling HTML strings.
 *
 * The transcript carries customer speech and the citation carries document
 * titles, both of which come from outside the product. `innerHTML` on either
 * is script injection with extra steps, and this is a screen that will later
 * be embedded in a Chrome extension running inside a customer's CRM — the
 * one context where an XSS is not confined to our own origin.
 */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/* ---------------------------------------------------------------------- */
/* Rendering, one function per event kind                                  */
/* ---------------------------------------------------------------------- */

function renderTranscript(e) {
  const turn = el("div", "turn");
  turn.dataset.speaker = e.speaker;
  turn.dataset.t = String(e.t);
  turn.append(el("span", "turn__time", clock(e.t)));
  turn.append(el("span", "turn__text", e.text));
  $("transcript").append(turn);
  turn.scrollIntoView({ block: "end" });
}

/**
 * A compliance violation.
 *
 * Critical goes to the band at the top of the screen and stays until
 * acknowledged. Warning goes inline, against the line that caused it —
 * docs/12 §6 gives it amber text, no sound, and a 15 s fade.
 *
 * Info never arrives here at all; the generator drops it, because docs/12
 * says info appears only in the post-call report. Doing that filtering in
 * the backend rather than in this function is the point: an agent cannot
 * turn it back on with devtools.
 */
function renderCompliance(e) {
  state.liveAlerts += 1;
  $("alert-count").textContent = `${Math.min(state.liveAlerts, LIVE_ALERT_BUDGET)} / ${LIVE_ALERT_BUDGET}`;

  if (e.severity === "critical") {
    state.acknowledged = false;
    $("band-title").textContent = e.title;
    $("band-remedy").textContent = e.remedy;
    $("band-authority").textContent = e.authority || "";
    $("band").hidden = false;
  }

  // Inline against the turn that caused it. Attached to the last rendered
  // turn, which is the one the engine was looking at when it fired.
  const alert = el("div", "inline-alert");
  alert.dataset.severity = e.severity;
  alert.append(el("span", "", e.severity === "critical" ? "⛔" : "⚠"));
  const body = el("span");
  body.append(el("strong", "", e.title + " — "));
  body.append(el("span", "inline-alert__remedy", e.remedy));
  alert.append(body);

  const last = $("transcript").lastElementChild;
  if (last) last.append(alert);

  if (e.severity !== "critical") {
    // docs/12 §6: a warning fades at 15 s. Only outside a live call does it
    // animate; `[data-live=yes]` zeroes the transition either way.
    setTimeout(() => alert.remove(), 15_000 / state.rate);
  }
}

function applySuggestion(e) {
  const card = el("article", "suggestion");

  const head = el("div", "suggestion__head");
  head.append(el("span", "", "⚡ " + e.trigger.replace(/_/g, " ")));
  head.append(el("span", "suggestion__age", `anclaje ${e.grounding.toFixed(2)}`));
  card.append(head);

  const text = el("p", "suggestion__text");
  text.dataset.streaming = "yes";
  card.append(text);

  // The citation is part of the card's first render, not appended when the
  // stream finishes. If it arrived late there would be a window — small, but
  // real — in which the agent reads a suggestion with no source, which is
  // the exact failure docs/12 §6 calls out.
  for (const c of e.citations) {
    const cite = el("div", "cite");
    cite.append(el("span", "", "📄"));
    cite.append(el("span", "cite__doc", c.doc));
    cite.append(el("span", "cite__where", where(c)));
    // The full path stays reachable on hover. It is the thing somebody
    // needs when they are disputing what the agent said, which is a
    // different moment from the one this panel is designed for.
    cite.title = `${c.doc} — ${c.heading} · KB v${c.kb_version}`;
    card.append(cite);
  }

  const feedback = el("div", "feedback");
  for (const [label, value] of [["👍", "up"], ["👎", "down"]]) {
    const b = el("button", "", label);
    b.type = "button";
    b.setAttribute("aria-pressed", "false");
    b.dataset.vote = value;
    b.addEventListener("click", () => {
      for (const other of feedback.children) other.setAttribute("aria-pressed", "false");
      b.setAttribute("aria-pressed", "true");
    });
    feedback.append(b);
  }
  card.lastElementChild.append(feedback);

  $("copilot-slot").replaceChildren(card);
  streamInto(text, e.text);
}

/**
 * Where in the document, in the space a 360 px panel actually has.
 *
 * `heading_label` is the full path — `Objection Handling v4 › 5. OBJECTIONS
 * › 5.3 It is too expensive` — and the chunker puts the document title at
 * the front of it, so rendering the title and the path together prints the
 * document twice and then truncates the part that locates the answer.
 *
 * The deepest heading is what a person needs to find the paragraph. A page
 * number, when the source had one, is better still.
 */
function where(c) {
  if (c.page) return `pág. ${c.page}`;
  const parts = c.heading.split("›").map((s) => s.trim()).filter(Boolean);
  const last = parts[parts.length - 1];
  return last && last !== c.doc ? last : c.heading;
}

/**
 * Reveal the text word by word.
 *
 * Guarded by a sequence number because a second suggestion can replace the
 * first mid-stream. Without it, the old timer keeps writing into a detached
 * node — harmless — or, worse, into the new card if the reference were
 * looked up by selector instead of captured.
 */
function streamInto(node, full) {
  const mine = ++state.stream;
  const words = full.split(" ");
  let i = 0;
  const tick = () => {
    if (mine !== state.stream) return;
    node.textContent = words.slice(0, ++i).join(" ");
    if (i < words.length) {
      setTimeout(tick, WORD_MS / state.rate);
    } else {
      node.dataset.streaming = "no";
    }
  };
  tick();
}

/**
 * The pipeline declined.
 *
 * Rendered, deliberately. A console that shows nothing when the copilot
 * declines teaches the agent that the panel is unreliable; a console that
 * says *"nothing in the material answers this"* teaches them that the
 * material has a gap — which is true, actionable, and the reason
 * `ingest/publish.py` refuses thin knowledge bases.
 */
function applySilence(e) {
  const box = el("div", "quiet");
  const reasons = {
    no_trigger: "Sin pregunta que responder.",
    below_threshold: "El material no respalda una respuesta a esto.",
    model_declined: "El modelo se abstuvo.",
    citation_invalid: "La cita no verificó contra el documento.",
    unverified: "La respuesta no pasó la verificación de anclaje.",
    too_long: "La respuesta superó el límite de 45 palabras.",
    empty: "El modelo no devolvió nada.",
  };
  box.append(el("strong", "", "Sin sugerencia"));
  box.append(el("span", "quiet__reason", reasons[e.reason] ?? e.reason));
  if (e.detail) box.append(el("span", "", e.detail));
  const code = el("code", "", `refusal: ${e.reason}`);
  box.append(code);
  $("copilot-slot").replaceChildren(box);
  state.stream++; // cancel any stream still running into the old card
}

function applySignal(e) {
  if (e.signal !== "sentiment") return;
  const v = e.value; // −1 … 1
  const fill = $("sentiment-fill");
  const pct = Math.abs(v) * 50;
  fill.style.width = `${pct}%`;
  fill.style.left = v >= 0 ? "50%" : `${50 - pct}%`;
  fill.dataset.tone = v > 0.15 ? "positive" : v < -0.15 ? "negative" : "neutral";
  $("sentiment-value").textContent = v.toFixed(2);
  $("sentiment-word").textContent =
    v > 0.15 ? "Receptivo" : v < -0.15 ? "En caída" : "Neutro";
}

function applyStage(e) {
  state.stage = e.stage;
}

/**
 * Paint the script rail.
 *
 * Driven by each step's own timestamp, not by stage transitions, and the
 * difference is a bug this screen shipped with for about an hour: the agent
 * confirmed the address at 0:26 and the rail still showed that step as not
 * done at 0:44. `current_stage()` reports the *furthest* step reached, so a
 * step the agent doubled back to — verification after discovery — never
 * becomes the current stage and never got marked.
 *
 * Two different questions were being answered with one variable. "Has this
 * step happened?" is per step and comes from `evaluate()`. "Where is the
 * call?" is one value and comes from `current_stage()`. A rail showing a
 * completed compliance-adjacent step as outstanding is worse than no rail:
 * the agent re-verifies an address they already have, in front of the
 * customer.
 */
function paintSteps(t) {
  for (const li of $("steps").children) {
    const at = li.dataset.at === "" ? null : Number(li.dataset.at);
    const done = at !== null && t >= at;
    li.dataset.state = li.dataset.step === state.stage ? "current" : done ? "done" : "pending";
    li.querySelector(".step__mark").textContent = done ? "●" : "○";
    // The timestamp appears when the step happens. Showing every step's time
    // from the first second tells the agent how a call they are still having
    // turns out, which is both wrong and a tell that this is a recording.
    li.querySelector(".step__at").textContent = done ? clock(at) : "";
  }
}

/* ---------------------------------------------------------------------- */
/* Health                                                                  */
/* ---------------------------------------------------------------------- */

function applyHealth(t) {
  const points = state.data.health.filter((h) => h.t <= t);
  const h = points[points.length - 1];
  if (!h) return;
  const node = $("health");
  node.dataset.state = h.state;
  if (h.state === "bypass") {
    // Said plainly. The customer is hearing the agent's real voice and the
    // agent has to know — docs/12 §6 is explicit that hiding this to avoid
    // alarming them would be a betrayal of the user.
    $("health-label").textContent = "SIN PROCESAR · tu voz real está saliendo";
    $("health-ms").textContent = "";
  } else {
    $("health-label").textContent = `Modo ${state.data.call.mode}`;
    $("health-ms").textContent = `${h.ms} ms`;
  }
}

/* ---------------------------------------------------------------------- */
/* Transport                                                               */
/* ---------------------------------------------------------------------- */

const APPLY = {
  transcript: renderTranscript,
  compliance: renderCompliance,
  suggestion: applySuggestion,
  silence: applySilence,
  signal: applySignal,
  stage: applyStage,
};

function advanceTo(t) {
  if (t < state.t) return rewindTo(t);
  state.t = t;
  while (state.cursor < state.data.events.length) {
    const e = state.data.events[state.cursor];
    if (e.t > t) break;
    state.cursor++;
    APPLY[e.type]?.(e);
  }
  applyHealth(t);
  paintSteps(t);
  $("elapsed").textContent = clock(t);
  $("scrub-time").textContent = clock(t);
  $("scrub").value = String(t);
}

/**
 * Scrubbing backwards replays from zero rather than undoing events.
 *
 * Undo is possible and it is also how a replay quietly drifts out of sync
 * with what the engines produced: every event kind would need an inverse,
 * and one missing inverse is a console showing a state no call ever reached.
 * Replaying is O(n) over 40 events.
 */
function rewindTo(t) {
  $("transcript").replaceChildren();
  $("band").hidden = true;
  state.cursor = 0;
  state.t = 0;
  state.stream++;
  state.liveAlerts = 0;
  state.acknowledged = false;
  state.stage = null;
  $("alert-count").textContent = `0 / ${LIVE_ALERT_BUDGET}`;
  advanceTo(t);
}

let raf = 0;
let last = 0;

function loop(now) {
  if (!state.playing) return;
  const dt = (now - last) / 1000;
  last = now;
  const next = state.t + dt * state.rate;
  if (next >= state.data.call.hangup_ms / 1000) {
    advanceTo(state.data.call.hangup_ms / 1000);
    return pause();
  }
  advanceTo(next);
  raf = requestAnimationFrame(loop);
}

function play() {
  if (state.playing) return;
  state.playing = true;
  // The motion rule from docs/12 §5 is bound to this attribute: during a
  // live call every animation duration is zero. Setting it here rather than
  // per-component means a new component cannot forget.
  document.documentElement.dataset.live = "yes";
  $("play").textContent = "⏸ Pausa";
  last = performance.now();
  raf = requestAnimationFrame(loop);
}

function pause() {
  state.playing = false;
  document.documentElement.dataset.live = "no";
  $("play").textContent = "▶ Reproducir";
  cancelAnimationFrame(raf);
}

/* ---------------------------------------------------------------------- */
/* Boot                                                                    */
/* ---------------------------------------------------------------------- */

function mountStatic(data) {
  const c = data.call;
  $("customer").textContent = c.customer;
  $("phone").textContent = c.phone;
  $("campaign").textContent = c.campaign;
  $("agent").textContent = c.agent;
  $("script-name").textContent = data.script.name;
  $("scrub").max = String(c.hangup_ms / 1000);

  // The script rail, in script order, from `evaluate()`'s results. The UI
  // does not decide what "met" means.
  const list = $("steps");
  for (const s of data.script.steps) {
    const li = el("li", "step");
    li.dataset.step = s.id;
    li.dataset.state = "pending";
    // A step the call never reached carries no time, and `paintSteps` reads
    // this rather than the fixture so the rail has one source.
    li.dataset.at = s.at === null ? "" : String(s.at);
    li.append(el("span", "step__mark", "○"));
    li.append(el("span", "", s.name));
    li.append(el("span", "step__at", ""));
    li.title = s.coaching;
    list.append(li);
  }

  const t = data.turns;
  $("silence-note").textContent =
    `${t.customer} turnos del cliente · ${t.answered} con sugerencia · ` +
    `${t.withheld} retenida(s) por falta de respaldo · ` +
    `${t.no_trigger} sin pregunta. Ninguna frase en pantalla salió sin cita.`;
}

function bindControls() {
  $("play").addEventListener("click", () => (state.playing ? pause() : play()));

  $("scrub").addEventListener("input", (ev) => {
    pause();
    advanceTo(Number(ev.target.value));
  });

  $("speed").addEventListener("click", () => {
    state.rate = state.rate === 1 ? 2 : state.rate === 2 ? 4 : 1;
    $("speed").textContent = `${state.rate}×`;
  });

  const ack = () => {
    state.acknowledged = true;
    $("band").hidden = true;
  };
  $("band-ack").addEventListener("click", ack);

  // docs/12 §7: everything an agent needs during a call has a shortcut, and
  // Esc dismisses the alert. A mouse during a live call is a distracted
  // agent.
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && !$("band").hidden) {
      ack();
      ev.preventDefault();
    }
    if (ev.key === " " && ev.target === document.body) {
      state.playing ? pause() : play();
      ev.preventDefault();
    }
  });
}

async function boot() {
  const res = await fetch("call-events.json");
  state.data = await res.json();
  mountStatic(state.data);
  bindControls();
  advanceTo(0);
  document.body.dataset.ready = "yes";
}

boot();
