/**
 * The post-call report, in a real browser.
 *
 * The report is a page of claims a model made about somebody's work. What is
 * checked here is the machinery that makes those claims arguable, because
 * that is what decides whether the feature survives contact with a
 * supervisor:
 *
 *  - every extracted item carries its verbatim quote
 *  - every quote is one click from the second it was said
 *  - what the pipeline threw away is printed, including when it is zero
 *  - the disposition is a proposal that does nothing until a human clicks
 *
 * The last one is the important one. An auto-applied disposition is how a
 * pipeline fills with outcomes nobody chose, and how a forecast built on
 * those outcomes becomes fiction.
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
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });

const failures = [];
page.on("pageerror", (e) => failures.push(String(e)));
page.on("console", (m) => m.type() === "error" && failures.push(m.text()));

await page.goto(`${base}/report/index.html`);
await page.waitForSelector("body[data-ready=yes]");

ok("the page boots with no console errors", failures.length === 0, failures.join(" | "));

const fixture = await page.evaluate(() =>
  fetch("../console/call-events.json").then((r) => r.json()),
);

/* -- every claim carries its evidence ---------------------------------- */

/**
 * `Item.__post_init__` raises without a quote — "indistinguishable from an
 * invention". The screen cannot receive an item lacking one, so what is
 * checked here is that it actually renders them rather than dropping them
 * for space.
 */
const items = await page.$$eval(".item", (n) =>
  n.map((x) => ({
    kind: x.dataset.kind,
    text: x.querySelector(".item__text")?.textContent ?? "",
    quote: x.querySelector(".item__quote")?.textContent ?? "",
  })),
);
ok("every extracted item is rendered", items.length === fixture.analysis.items.length,
   `${items.length} of ${fixture.analysis.items.length}`);
ok(
  "every item shows a verbatim quote",
  items.every((i) => i.quote.includes("“") && i.quote.length > 12),
  JSON.stringify(items.find((i) => !i.quote.includes("“")) ?? "all good"),
);
ok(
  "the model's reading and the words it read are both on screen",
  items.every((i) => i.text.length > 0 && i.quote.length > 0),
);

/* -- the quote the model invented was thrown away ---------------------- */

/**
 * The fixture's summariser deliberately proposes one plausible, entirely
 * fabricated commitment — "I'll waive the installation fee for you" — the
 * kind a real model produces when it pattern-matches a sales call instead of
 * reading one. The pipeline must drop it.
 */
const INVENTED_QUOTE = "waive the installation fee";
const INVENTED_READING = "Exonerar el costo de instalación";

// Asserted directly against both halves of the fabricated extraction rather
// than with a disjunction that can short-circuit before checking the half
// that matters.
const bodyText = await page.textContent("body");
ok(
  "the invented quote never reaches the screen",
  !bodyText.toLowerCase().includes(INVENTED_QUOTE),
  bodyText.slice(0, 80),
);
ok(
  "nor the reading built on it",
  !items.some((i) => i.text.includes(INVENTED_READING)),
  items.map((i) => i.text).join(" | "),
);
// And the control: the summariser really did propose it, so the test above
// is measuring a refusal rather than an absence.
ok(
  "the fixture's summariser really did propose it",
  (await readFile(resolve(root, "console/generate_fixture.py"), "utf8"))
    .includes(INVENTED_QUOTE),
);
ok("the pipeline reported dropping it", fixture.analysis.rejected === 1,
   `rejected=${fixture.analysis.rejected}`);
const rejected = await page.textContent("#rejected-text");
ok(
  "and the screen prints what was dropped and why it is counted",
  /descartada/i.test(rejected) && /desviando/i.test(rejected),
  rejected.replace(/\s+/g, " ").slice(0, 120),
);
ok(
  "the drop count is flagged, not buried",
  (await page.getAttribute("#rejected", "data-any")) === "yes",
);

/* -- one click from the audio ------------------------------------------ */

const anchors = await page.$$eval(".anchor", (n) => n.length);
ok("the summary shows its anchoring quotes", anchors >= 2, `${anchors} anchors`);

await page.click(".item__quote");
await page.waitForURL(/player/);
ok(
  "clicking a quote opens the player at that second",
  /#t=\d/.test(page.url()),
  page.url().split("/").pop(),
);
await page.waitForSelector("body[data-ready=yes]");
const landed = await page.textContent("#clock");
ok(
  "and the player actually seeks there, not to zero",
  !landed.startsWith("0:00"),
  landed,
);

await page.goBack();
await page.waitForSelector("body[data-ready=yes]");

/* -- the disposition gate ---------------------------------------------- */

ok(
  "the disposition arrives unconfirmed",
  (await page.getAttribute("#disposition", "data-confirmed")) === "no",
);
ok(
  "and says so in words",
  /sin confirmar/i.test(await page.textContent("#disp-state")),
  await page.textContent("#disp-state"),
);

/**
 * The engine's half of the gate: `crm_writes()` emits no lead write while
 * the disposition is unconfirmed. If this ever fails, the UI is the least of
 * the problem.
 */
ok(
  "the engine emitted no pipeline write for an unconfirmed disposition",
  !fixture.crm_writes.some((w) => w.entity === "lead"),
  JSON.stringify(fixture.crm_writes.map((w) => w.entity)),
);

const gatedBefore = await page.$$eval('.write[data-gated="yes"]', (n) => n.length);
ok("the pending write is shown as pending", gatedBefore === 1, `${gatedBefore} gated`);
ok(
  "and it says what is holding it",
  /hasta que un humano confirme/i.test(await page.textContent('.write[data-gated="yes"]')),
);

await page.click("#disp-confirm");
ok(
  "confirming applies it",
  (await page.getAttribute("#disposition", "data-confirmed")) === "yes",
);
ok(
  "and the write stops being gated",
  (await page.$$eval('.write[data-gated="yes"]', (n) => n.length)) === 0,
);
ok(
  "the confirm button is gone once it has been used",
  !(await page.isVisible("#disp-actions")),
);

/* -- rejecting does not pick a different answer ------------------------ */

await page.reload();
await page.waitForSelector("body[data-ready=yes]");
await page.click("#disp-reject");
const afterReject = await page.textContent("#disp-value");
ok(
  "rejecting clears the proposal rather than guessing another",
  /sin disposición/i.test(afterReject),
  afterReject,
);
ok(
  "and no pipeline write survives it",
  (await page.$$eval('.write[data-entity="lead"]', (n) => n.length)) === 0,
);

/* -- metrics are arithmetic, and say so -------------------------------- */

const metrics = await page.textContent("#metrics");
const expected = Math.round(fixture.analysis.metrics.talk_ratio * 100);
ok(
  "the talk ratio matches what the engine computed",
  metrics.includes(`${expected}%`),
  `expected ${expected}%`,
);
ok(
  "a high talk ratio is flagged for coaching",
  expected <= 65 || (await page.$$eval('.metric[data-flag="high"]', (n) => n.length)) === 1,
  `${expected}%`,
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
