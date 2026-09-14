/**
 * The pipeline board, in a real browser.
 *
 * The board itself is a kanban and there is not much to get wrong. What is
 * checked here is the forecast panel, and specifically that the screen never
 * manufactures a number the engine declined to give — a UI fallback would
 * reintroduce the invention `pipeline.ts` exists to refuse, one layer up and
 * out of reach of its tests.
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
};

const server = createServer(async (req, res) => {
  try {
    const path = resolve(root, "." + new URL(req.url, "http://x").pathname);
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
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

const failures = [];
page.on("pageerror", (e) => failures.push(String(e)));
page.on("console", (m) => m.type() === "error" && failures.push(m.text()));

await page.goto(`${base}/pipeline/index.html`);
await page.waitForSelector("body[data-ready=yes]");

ok("the page boots with no console errors", failures.length === 0, failures.join(" | "));

const board = await page.evaluate(() => fetch("board.json").then((r) => r.json()));

/* -- the board ---------------------------------------------------------- */

const columns = await page.$$eval(".column", (n) => n.map((x) => x.dataset.stage));
ok(
  "one column per non-terminal stage, in order",
  columns.join(",") === "new,qualified,proposal,negotiation",
  columns.join(","),
);
ok(
  "every open deal is on the board",
  (await page.$$eval(".deal", (n) => n.length)) === board.deals.length,
  `${board.deals.length}`,
);

/* -- the rates are measured, not the defaults --------------------------- */

/**
 * The 10/25/50/75/90 every CRM ships is not derived from anything. This
 * tenant's own closed deals give 17/41/54/68, and the gap is the entire
 * argument for measuring.
 */
const shown = await page.$$eval(".column__rate", (n) =>
  n.map((x) => ({ pct: x.textContent, title: x.title })),
);
ok("each stage shows its measured rate", shown.length === 4, `${shown.length}`);
ok(
  "and none of them is a shipped default",
  shown.every((s) => !["10%", "25%", "50%", "75%", "90%"].includes(s.pct)),
  shown.map((s) => s.pct).join(","),
);
ok(
  "the sample size behind each rate is reachable",
  shown.every((s) => /\d{2,}/.test(s.title)),
  shown[0]?.title.slice(0, 70),
);

const basis = await page.$$eval(".basis__row", (n) =>
  n.map((x) => x.textContent.replace(/\s+/g, " ").trim()),
);
ok(
  "the basis panel names the sample for every stage",
  basis.length === 4 && basis.every((t) => /n=\d+/.test(t)),
  basis.join(" | "),
);

/* -- dead deals -------------------------------------------------------- */

/**
 * A deal that entered negotiation months ago is not 68% likely to close. It
 * is dead and nobody has said so. Counting it at stage weight is how a
 * pipeline becomes a graveyard that still reports a number.
 */
ok("the engine found stalled deals", board.stalled.length > 0, `${board.stalled.length}`);
ok(
  "they are marked on the board, not only counted",
  (await page.$$eval('.deal[data-stalled="yes"]', (n) => n.length)) === board.stalled.length,
);
ok(
  "they are excluded from the weighted total",
  board.forecast.excludedStalled === board.stalled.length,
  `${board.forecast.excludedStalled}`,
);

/**
 * "4 excluded" invites "which four?". A forecast that removes pipeline
 * without saying whose is one somebody rebuilds by hand.
 */
const excluded = await page.$$eval(".excluded__row", (n) => n.map((x) => x.dataset.dealId));
ok(
  "and each excluded deal is named",
  excluded.length === board.stalled.length &&
    board.stalled.every((s) => excluded.includes(s.id)),
  excluded.join(","),
);

/* -- the number, and what it is not ------------------------------------ */

ok("this tenant gets a weighted forecast", board.forecast.kind === "weighted");

/**
 * The weighted total must be well below the open pipeline. A panel where the
 * headline equals the open total means the weighting silently did nothing.
 */
ok(
  "the weighted total is not the open total",
  board.forecast.weightedCents < board.forecast.openAmountCents * 0.8,
  `${board.forecast.weightedCents} vs ${board.forecast.openAmountCents}`,
);
ok(
  "the open total is shown alongside it",
  (await page.textContent("#rows")).includes("Pipeline abierto"),
);

/**
 * Commit survives every refusal because it is not an estimate — somebody put
 * their name on each deal in it.
 */
ok(
  "commit is shown and is smaller than the weighted total",
  board.forecast.commit.amountCents < board.forecast.weightedCents &&
    (await page.$$eval('.row[data-tone="commit"]', (n) => n.length)) === 1,
);

/* -- the refusals, rendered from real engine output -------------------- */

/**
 * The two states where `forecast()` declines. Both come from the same engine
 * over the same pipeline with different history, so what the screen renders
 * in its empty states is real output rather than hand-written copy.
 */
ok(
  "a tenant with no closed history gets no forecast",
  board.refusals.newTenant.kind === "uncalibrated",
  board.refusals.newTenant.kind,
);
ok(
  "and is told which stage is short and by how much",
  /negotiation/.test(board.refusals.newTenant.explanation) &&
    /4 de 20/.test(board.refusals.newTenant.explanation),
  board.refusals.newTenant.explanation,
);
ok(
  "a calibrated tenant with a small pipeline still gets no weighted number",
  board.refusals.smallPipeline.kind === "unreliable",
  board.refusals.smallPipeline.kind,
);
ok(
  "and is told why weighting would be meaningless",
  /9 de 30/.test(board.refusals.smallPipeline.explanation),
  board.refusals.smallPipeline.explanation,
);

/**
 * The screen renders the refusal where the number would be, and does not
 * invent a replacement.
 */
await page.route("**/board.json", async (route) => {
  const data = await (await fetch(route.request().url())).json();
  route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ ...data, forecast: data.refusals.smallPipeline, stalled: [] }),
  });
});
await page.reload();
await page.waitForSelector("body[data-ready=yes]");

ok("the refusal is shown", await page.isVisible("#refusal"));
const headline = await page.textContent("#headline");
ok(
  "no number appears where the forecast would be",
  !/\$\s?[\d,.]{3,}/.test(headline),
  headline.replace(/\s+/g, " "),
);
ok(
  "and the headline says plainly there is none",
  /sin forecast/i.test(headline),
  headline.replace(/\s+/g, " "),
);
ok(
  "commit still appears, because it is not an estimate",
  (await page.$$eval('.row[data-tone="commit"]', (n) => n.length)) === 1,
);

/* -- phone -------------------------------------------------------------- */

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
