/**
 * The call player, in a real browser.
 *
 * `docs/07` §7 calls this the screen where a supervisor understands in thirty
 * seconds what they are buying, and lists four things it must do. Those four
 * are what is checked here, plus the one thing this screen is most tempted to
 * lie about: there is no recording behind it, and it has to say so rather
 * than draw a waveform over silence.
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
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });

const failures = [];
page.on("pageerror", (e) => failures.push(String(e)));
page.on("console", (m) => m.type() === "error" && failures.push(m.text()));

await page.goto(`${base}/player/index.html`);
await page.waitForSelector("body[data-ready=yes]");

ok("the page boots with no console errors", failures.length === 0, failures.join(" | "));

/* -- one fixture, two screens ------------------------------------------ */

/**
 * The player reads the console's fixture rather than one of its own. Two
 * fixtures for one call is how the two screens start disagreeing, and a
 * supervisor who has to decide which screen is lying stops trusting both.
 */
const requested = await page.evaluate(() =>
  performance.getEntriesByType("resource").map((r) => new URL(r.name).pathname),
);
ok(
  "the player reads the console's fixture, not a copy",
  requested.some((p) => p.endsWith("/console/call-events.json")),
  requested.join(" "),
);

/* -- docs/07 §7, item 1: synchronised transcript, click to jump -------- */

const lines = await page.$$eval(".line", (n) => n.length);
ok("every turn is rendered", lines === 16, `${lines} lines`);

await page.click('.line[data-t="43"]');
ok(
  "clicking a turn moves the playhead to it",
  (await page.textContent("#clock")).startsWith("0:43"),
  await page.textContent("#clock"),
);
ok(
  "and that turn is marked current",
  (await page.getAttribute('.line[data-t="43"]', "data-current")) === "yes",
);
ok(
  "only one turn is current at a time",
  (await page.$$eval('.line[data-current="yes"]', (n) => n.length)) === 1,
);

/* -- item 3: event markers on the timeline ----------------------------- */

const markKinds = await page.$$eval(".mark", (n) => n.map((x) => x.dataset.kind));
ok(
  "the critical violation is marked on the timeline",
  markKinds.includes("compliance_critical"),
  markKinds.join(","),
);
ok(
  "the suggestion is marked on the timeline",
  markKinds.includes("suggestion"),
  markKinds.join(","),
);

const markT = Number(await page.getAttribute('.mark[data-kind="compliance_critical"]', "data-t"));
await page.click('.mark[data-kind="compliance_critical"]');
const want = `${Math.floor(markT / 60)}:${String(Math.floor(markT % 60)).padStart(2, "0")}`;
ok(
  "clicking a marker jumps to the moment",
  (await page.textContent("#clock")).startsWith(want),
  `${markT}s should read ${want}, clock shows ${await page.textContent("#clock")}`,
);

/* -- item 4: which suggestions the agent used -------------------------- */

/**
 * Measured by `postcall/adoption.py`, not assumed from the suggestion having
 * been displayed. On this call the agent restated it at 0:48 and the measure
 * says so.
 */
const used = await page.$eval(".used", (n) => ({
  outcome: n.dataset.outcome,
  text: n.textContent,
  evidence: n.title,
}));
ok("an adopted suggestion is marked as used", used.outcome === "adopted", JSON.stringify(used));
ok(
  "the verdict carries its evidence",
  /%/.test(used.evidence) && /interest|split/.test(used.evidence),
  used.evidence,
);

/* -- item 2: the track selector ---------------------------------------- */

ok(
  "the processed track is selected by default",
  (await page.getAttribute("#track-processed", "aria-pressed")) === "true",
);
await page.click("#track-raw");
ok(
  "the raw track can be selected",
  (await page.getAttribute("#track-raw", "aria-pressed")) === "true" &&
    (await page.getAttribute("#track-processed", "aria-pressed")) === "false",
);

/* -- the lie this screen is most tempted to tell ----------------------- */

/**
 * There is no recording behind this fixture. Drawing a plausible waveform, or
 * offering a play button that produces silence, is the failure that gets
 * discovered during the demo, by the customer, when they press play.
 *
 * docs/12 §8: when something is degraded, say what does not work. Never fake
 * normality.
 */
ok("the missing recording is stated, not hidden", await page.isVisible("#notice"));
const notice = await page.textContent("#notice");
ok(
  "and the notice says what is missing and what still works",
  /grabación/i.test(notice) && /sin audio/i.test(notice),
  notice.replace(/\s+/g, " ").trim().slice(0, 110),
);
ok(
  "no waveform is drawn over silence",
  (await page.$$eval("canvas", (n) => n.length)) === 0,
);

/* -- the sentiment ribbon ---------------------------------------------- */

const ribbon = await page.getAttribute("#ribbon-line", "d");
ok("the sentiment ribbon is drawn from the signal track", (ribbon?.length ?? 0) > 20);
ok("it has a point per observed value", (ribbon.match(/L/g)?.length ?? 0) >= 4, ribbon?.slice(0, 60));

/* -- playback ---------------------------------------------------------- */

await page.click('.line[data-t="1"]');
const before = await page.textContent("#clock");
await page.click("#play");
// Long enough for the displayed second to tick over — the clock renders whole
// seconds, so a 350 ms wait from 0:01 still reads 0:01 and proves nothing.
await page.waitForTimeout(1400);
const moved = await page.textContent("#clock");
await page.click("#play");
ok("playing advances the clock", moved !== before, `${before} -> ${moved}`);

await page.keyboard.press("ArrowRight");
ok("arrow keys scrub", (await page.textContent("#clock")) !== moved);

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
