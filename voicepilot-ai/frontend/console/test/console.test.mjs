/**
 * The console, in a real browser, replaying a real call.
 *
 * What these tests check is narrow on purpose. They do not check that the
 * copilot answered well or that the compliance rule was correct — those are
 * decided in `ai-services/copilot-core` and tested there against adversarial
 * inputs. What can only be checked here is whether the promises `docs/12`
 * makes about the *screen* survive a browser:
 *
 *  - the citation is on screen at the same moment the suggestion is
 *  - a critical alert does not leave without acknowledgement
 *  - the bypass state says the customer is hearing the real voice
 *  - silence renders as a designed state, not as an empty div
 *  - nothing animates during a live call
 *
 * Each of those is a rule somebody could break with an innocent CSS change
 * and never notice, because the screen would still look plausible.
 */
import { loadChromium, chromiumPath } from "./chromium.mjs";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const results = [];
const ok = (name, cond, extra = "") =>
  results.push(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);

const TYPES = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".html": "text/html",
};

const server = createServer(async (req, res) => {
  try {
    const p = new URL(req.url, "http://x").pathname;
    const path = resolve(root, "." + (p === "/" ? "/index.html" : p));
    if (!path.startsWith(root)) throw new Error("escape");
    const body = await readFile(path);
    const ext = path.slice(path.lastIndexOf("."));
    res.writeHead(200, { "content-type": TYPES[ext] ?? "text/plain" });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});

await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const chromium = await loadChromium();
const browser = await chromium.launch({
  executablePath: chromiumPath(),
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const failures = [];
page.on("pageerror", (e) => failures.push(String(e)));
page.on("console", (m) => m.type() === "error" && failures.push(m.text()));

await page.goto(base + "/index.html");
await page.waitForSelector("body[data-ready=yes]");

/* -- it loads at all --------------------------------------------------- */

ok("the page boots with no console errors", failures.length === 0, failures.join(" | "));
ok(
  "the call header is populated from the fixture",
  (await page.textContent("#customer")) === "Michael Reed",
);

/* -- the script rail comes from evaluate(), not from the UI ------------ */

const steps = await page.$$eval("#steps .step", (n) => n.map((x) => x.dataset.step));
ok(
  "the script rail renders every step in script order",
  steps.join(",") === "greet,verify,discover,price,terms,close",
  steps.join(","),
);

ok(
  "no step shows a timestamp before it has happened",
  (await page.$$eval("#steps .step__at", (n) => n.every((x) => x.textContent === ""))),
);

/* -- seek to the objection: the one turn the copilot answered ---------- */

await page.fill("#scrub", "44");
await page.dispatchEvent("#scrub", "input");
await page.waitForSelector(".suggestion");

/**
 * The rail marks a step done because the step happened, not because the
 * call's stage passed through it.
 *
 * The agent confirmed the address at 0:26, after discovery at 0:14.
 * `current_stage()` reports the furthest step reached, so `verify` is never
 * the current stage on this call — and an earlier version of the rail, which
 * marked steps on stage transitions, still showed verification outstanding
 * at 0:44. An agent reading that re-verifies an address they already have,
 * in front of the customer.
 */
const rail = await page.$$eval("#steps .step", (n) =>
  Object.fromEntries(n.map((x) => [x.dataset.step, x.dataset.state])),
);
ok("a step met out of stage order is still marked done", rail.verify === "done", JSON.stringify(rail));
ok("the current stage is the furthest reached", rail.price === "current", JSON.stringify(rail));
ok("a step not yet reached stays pending", rail.close === "pending", JSON.stringify(rail));

/**
 * The rule `docs/12` §6 calls non-negotiable, and the visible end of the
 * guarantee enforced in `copilot/types.py`: the citation is present in the
 * same frame as the suggestion, not appended when streaming finishes.
 *
 * Checked while the text is still streaming, which is the window where a
 * late-appended citation would slip through unnoticed by a human reviewer.
 */
const citeDuringStream = await page.evaluate(() => {
  const card = document.querySelector(".suggestion");
  const text = card.querySelector(".suggestion__text");
  return {
    streaming: text.dataset.streaming,
    cites: card.querySelectorAll(".cite").length,
    citeText: card.querySelector(".cite")?.textContent ?? "",
  };
});
ok(
  "the citation is on screen while the suggestion is still streaming",
  citeDuringStream.cites >= 1,
  JSON.stringify(citeDuringStream),
);
ok(
  "the citation names the document",
  citeDuringStream.citeText.includes("Objection Handling"),
  citeDuringStream.citeText,
);

await page.waitForFunction(
  () => document.querySelector(".suggestion__text")?.dataset.streaming === "no",
);
const words = (await page.textContent(".suggestion__text")).trim().split(/\s+/).length;
ok("the suggestion respects the 45-word product limit", words <= 45, `${words} words`);

ok(
  "only one suggestion is on screen, never a list",
  (await page.$$(".suggestion")).length === 1,
);

/* -- silence is a designed state, not an absence ----------------------- */

await page.fill("#scrub", "64");
await page.dispatchEvent("#scrub", "input");
await page.waitForSelector(".quiet");
const quiet = await page.textContent(".quiet");
ok(
  "a declined suggestion renders as an explained silence",
  quiet.includes("Sin sugerencia") && quiet.includes("below_threshold"),
  quiet.replace(/\s+/g, " ").slice(0, 90),
);
ok("the declined state replaces the card rather than stacking", (await page.$$(".suggestion")).length === 0);

/* -- the critical band ------------------------------------------------- */

await page.fill("#scrub", "69");
await page.dispatchEvent("#scrub", "input");
await page.waitForSelector("#band:not([hidden])");
const band = await page.textContent("#band");
ok("a critical violation raises the band", band.includes("garantías"));
ok("the band cites the authority", band.includes("FTC"), band.replace(/\s+/g, " "));

/**
 * `docs/12` §6: a critical alert *requires acknowledgement*. It does not
 * time out. An alert that clears itself while the agent is mid-sentence
 * leaves no evidence they ever saw it, and this is the one alert that says
 * they have seconds to retract a promise the company cannot keep.
 */
await page.waitForTimeout(1200);
ok(
  "the critical band does not clear on its own",
  await page.isVisible("#band"),
);
await page.keyboard.press("Escape");
ok("Escape acknowledges it, with no mouse", !(await page.isVisible("#band")));

/* -- the alert budget is shown, not enforced, by the UI ---------------- */

ok(
  "the live-alert budget is visible to the agent",
  (await page.textContent("#alert-count")).includes("/ 3"),
);

/* -- voice health: the most important state in the interface ----------- */

await page.fill("#scrub", "68");
await page.dispatchEvent("#scrub", "input");
const health = await page.evaluate(() => ({
  state: document.querySelector("#health").dataset.state,
  label: document.querySelector("#health-label").textContent,
}));
ok("the bypass state is reached from the health timeline", health.state === "bypass", health.state);
ok(
  "bypass says plainly that the customer hears the real voice",
  /real/i.test(health.label),
  health.label,
);

/* -- motion during a live call ----------------------------------------- */

/**
 * `docs/12` §5, the hard rule: during an active call every animation
 * duration is 0 ms. A suggestion that fades in over 200 ms arrives 200 ms
 * late and steals the agent's eye on the way in.
 *
 * Checked by reading computed style in the browser rather than by grepping
 * the stylesheet, because the failure mode is a component author adding a
 * transition somewhere this file never mentions.
 */
await page.fill("#scrub", "40");
await page.dispatchEvent("#scrub", "input");
await page.click("#play");
await page.waitForTimeout(150);
const motion = await page.evaluate(() => {
  const bad = [];
  for (const node of document.querySelectorAll("*")) {
    const s = getComputedStyle(node);
    const dur = [...s.transitionDuration.split(","), ...s.animationDuration.split(",")];
    if (dur.some((d) => parseFloat(d) > 0)) bad.push(node.className || node.tagName);
  }
  return { live: document.documentElement.dataset.live, bad: bad.slice(0, 5) };
});
ok("the page is marked live while playing", motion.live === "yes");
ok(
  "no element animates during a live call",
  motion.bad.length === 0,
  motion.bad.join(", "),
);

/* -- it survives a phone ----------------------------------------------- */

await page.click("#play"); // pause
await page.setViewportSize({ width: 390, height: 844 });
const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
);
ok("no horizontal scroll at 390px", overflow <= 0, `${overflow}px`);

/* -- report ------------------------------------------------------------ */

await browser.close();
server.close();

console.log(results.join("\n"));
const failed = results.filter((r) => r.startsWith("FAIL"));
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
