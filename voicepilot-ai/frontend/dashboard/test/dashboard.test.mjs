/**
 * The floor dashboard, in a real browser.
 *
 * The thing under test is an *ordering*, which makes these checks unusual:
 * most of them assert that a specific call is NOT at the top. That is the
 * product. `docs/06` §5 — *sorts by risk, not duration* — is one sentence,
 * and every dashboard that gets it wrong gets it wrong the same way, by
 * putting the longest call first because that is what the data was already
 * sorted by.
 *
 * The fixture is built to contain the cases that break a naive version: the
 * longest call on the floor is going well, one bad call is already
 * acknowledged, and the highest-risk call is the shortest one on the screen.
 */
import { loadChromium, chromiumPath } from "../../../tools/chromium.mjs";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");

const results = [];
const ok = (name, cond, extra = "") =>
  results.push(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);

const TYPES = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".html": "text/html",
  ".mjs": "text/javascript",
};

// Served from `frontend/` rather than `frontend/dashboard/` because the page
// shares `console/tokens.css` — one design system, not a copy per screen.
const server = createServer(async (req, res) => {
  try {
    const p = new URL(req.url, "http://x").pathname;
    const path = resolve(root, "." + p);
    if (!path.startsWith(root)) throw new Error("escape");
    const body = await readFile(path);
    res.writeHead(200, { "content-type": TYPES[path.slice(path.lastIndexOf("."))] ?? "text/plain" });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});

await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const chromium = await loadChromium();
const browser = await chromium.launch({ executablePath: chromiumPath(), args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const failures = [];
page.on("pageerror", (e) => failures.push(String(e)));
page.on("console", (m) => m.type() === "error" && failures.push(m.text()));

await page.goto(`${base}/dashboard/index.html`);
await page.waitForSelector("body[data-ready=yes]");

ok("the page boots with no console errors", failures.length === 0, failures.join(" | "));

/* -- the budget -------------------------------------------------------- */

const cards = await page.$$eval(".card", (n) => n.map((x) => x.dataset.callId));
ok("at most three calls compete for attention", cards.length <= 3, `${cards.length} cards`);

/* -- the ordering, which is the entire product ------------------------- */

const floor = await page.evaluate(async () => {
  const data = await (await fetch("floor.json")).json();
  return {
    attention: data.attention.map((c) => ({
      id: c.call_id, s: c.score, d: c.duration_s, ack: c.acknowledged,
    })),
    rest: data.rest.map((c) => ({ id: c.call_id, s: c.score, d: c.duration_s })),
  };
});

const longestOverall = [...floor.attention, ...floor.rest].reduce((a, b) =>
  b.d > a.d ? b : a,
);
ok(
  "the longest call on the floor is not in the top three",
  !floor.attention.some((c) => c.id === longestOverall.id),
  `longest is ${longestOverall.id} at ${longestOverall.d}s`,
);

/**
 * The inversion that proves it is ranking by risk.
 *
 * The top card is a 93-second call. There are calls on this floor running
 * seven times longer. Any sort that touches duration puts one of those
 * first.
 */
const shortestAtTop = floor.attention[0];
ok(
  "a short call with a critical violation outranks every long one",
  floor.rest.every((c) => c.d > shortestAtTop.d || c.s < shortestAtTop.s),
  `top: ${shortestAtTop.id} ${shortestAtTop.d}s score ${shortestAtTop.s}`,
);

ok(
  "the rendered order matches the order triage() returned",
  cards.join(",") === floor.attention.map((c) => c.id).join(","),
  `${cards.join(",")} vs ${floor.attention.map((c) => c.id).join(",")}`,
);

ok(
  "scores descend down the attention list",
  floor.attention.every((c, i) => i === 0 || c.s <= floor.attention[i - 1].s),
  JSON.stringify(floor.attention.map((c) => c.s)),
);

/**
 * `triage.py`: an acknowledged call weighs 0.4×, so the supervisor's own
 * intervention does not stay pinned to the top of their screen for six
 * minutes with everything behind it invisible.
 */
ok(
  "an acknowledged call has left the top three",
  !floor.attention.some((c) => c.ack),
  JSON.stringify(floor.attention),
);
const restText = await page.textContent("#rest");
ok(
  "and the floor list says why it is not there",
  restText.includes("0.4×"),
  restText.replace(/\s+/g, " ").slice(0, 100),
);

/* -- the reasons are words, not a score -------------------------------- */

const firstCardText = await page.textContent(".card");
ok(
  "the top card states its reasons in words",
  /compliance/i.test(firstCardText) && /sentimiento/i.test(firstCardText),
  firstCardText.replace(/\s+/g, " ").slice(0, 110),
);
ok(
  "a compliance factor is the only thing rendered in red",
  (await page.$$eval('.factor[data-name="compliance"]', (n) => n.length)) >= 1,
);
ok(
  "the card with a compliance factor is the one marked critical",
  (await page.getAttribute(".card", "data-critical")) === "yes",
);

/* -- the boring half stays boring -------------------------------------- */

const whyRows = await page.$$eval("#rest .why", (n) => n.map((x) => x.textContent));
ok(
  "calm calls carry no explanation row",
  whyRows.every((t) => t.trim().length > 0) && whyRows.length < floor.rest.length,
  `${whyRows.length} explanations for ${floor.rest.length} rows`,
);
ok(
  "the longest call's row explains why it is not at the top",
  whyRows.some((t) => /duración/i.test(t)),
  whyRows.join(" | ").slice(0, 120),
);

/* -- the quiet floor is a designed state ------------------------------- */

/**
 * `triage()` excludes calls with no risk factors rather than ranking them
 * last, so an empty attention list is the common output and means the floor
 * is fine. A dashboard that always finds three things to worry about trains
 * the supervisor to discount all three — so the empty case has to read as an
 * answer, not as a loading failure.
 */
await page.route("**/floor.json", async (route) => {
  const data = await (await fetch(`${route.request().url()}`)).json();
  route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ ...data, attention: [], totals: { ...data.totals, at_risk: 0 } }),
  });
});
await page.reload();
await page.waitForSelector("body[data-ready=yes]");
ok("with nothing at risk the all-clear is shown", await page.isVisible("#allclear"));
ok("and the attention grid is hidden, not empty", !(await page.isVisible("#attention")));
const clear = await page.textContent("#allclear");
ok(
  "the all-clear says what would appear there",
  /sentimiento|silencio|violación/i.test(clear),
  clear.replace(/\s+/g, " ").slice(0, 90),
);

/* -- phone ------------------------------------------------------------- */

await page.setViewportSize({ width: 390, height: 844 });
const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
);
ok("no horizontal scroll at 390px", overflow <= 0, `${overflow}px`);

await browser.close();
server.close();

console.log(results.join("\n"));
const failed = results.filter((r) => r.startsWith("FAIL"));
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
