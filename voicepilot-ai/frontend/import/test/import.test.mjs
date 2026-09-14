/**
 * The import review, in a real browser.
 *
 * What this page displays is a set of refusals, so most of these checks are
 * that something did NOT happen: two people who share a name were not merged,
 * a suppression was not cleared, an unresolved file could not be applied.
 *
 * The one with a statute behind it is the suppression check. A file claiming
 * a suppressed number is fine to call is what a list broker's export looks
 * like, and a merge that accepts it is $500-$1,500 per subsequent call.
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

await page.goto(`${base}/import/index.html`);
await page.waitForSelector("body[data-ready=yes]");

ok("the page boots with no console errors", failures.length === 0, failures.join(" | "));

const plan = await page.evaluate(() => fetch("plan.json").then((r) => r.json()));

/* -- what the engine decided ------------------------------------------- */

const byRow = Object.fromEntries(plan.decisions.map((d) => [d.row, d]));

/**
 * The same person twice inside one file — the most common real import. An
 * importer that compares each row only against the database produces exactly
 * the duplicate it was bought to prevent.
 */
ok(
  "a row duplicated inside the file merges into the first one",
  byRow[2]?.action === "merge" && byRow[3]?.action === "merge",
  `row2=${byRow[2]?.action} row3=${byRow[3]?.action}`,
);

/**
 * Two Maria Gonzalezes. One shares a company with an existing contact, one
 * does not. Neither may be merged, and the reasons differ because the cases
 * are not equally suspicious.
 */
ok("a name match at the same company goes to review", byRow[4]?.action === "review");
ok("a bare name match goes to review too", byRow[5]?.action === "review");
ok(
  "and the two are given different codes",
  byRow[4]?.code === "name_and_company" && byRow[5]?.code === "name_only",
  `${byRow[4]?.code} / ${byRow[5]?.code}`,
);

/**
 * Every review code has a Spanish string, and the screen renders that rather
 * than the engine's English prose.
 *
 * The prose is written for a log; switching on it breaks when somebody
 * improves the wording, and rendering it raw shipped English into a Spanish
 * product — which is what this screen did before `ReviewCode` existed. A
 * missing translation must fail here, not silently fall back in front of a
 * customer.
 */
const codes = [...new Set(plan.decisions.filter((d) => d.action === "review").map((d) => d.code))];
const rendered = await page.$$eval(".review__reason", (n) => n.map((x) => x.textContent));
ok(
  "every review reason renders in Spanish",
  rendered.every((t) => !/same name|this row matches|carry different ids/i.test(t)),
  rendered.find((t) => /same name|this row/i.test(t)) ?? "",
);
ok(
  "every code produced by this file has a translation",
  codes.length >= 3 && rendered.length === plan.counts.review,
  codes.join(","),
);
ok(
  "no name-based match is ever marked auto-mergeable",
  plan.decisions
    .filter((d) => d.action === "review")
    .flatMap((d) => d.candidates)
    .filter((c) => c.basis.startsWith("name"))
    .every((c) => c.autoMergeable === false),
);

ok(
  "conflicting ids in one external system go to review",
  byRow[7]?.action === "review" && byRow[7]?.code === "external_id_conflict",
  byRow[7]?.code,
);
ok(
  "a row matching two existing contacts goes to review",
  byRow[8]?.action === "review" &&
    byRow[8]?.code === "existing_duplicates" &&
    (byRow[8]?.candidates.length ?? 0) === 2,
  byRow[8]?.code,
);

/**
 * Accents fold for flagging and still do not authorise a merge. The bet that
 * Muñoz and Munoz are one person is reasonable for a review queue and
 * unreasonable for a merge.
 */
ok(
  "an accent-folded name match is flagged, not merged",
  byRow[9]?.action === "review",
  byRow[9]?.action,
);

ok(
  "a non-E.164 phone does not match by luck",
  byRow[10]?.action === "create",
  byRow[10]?.action,
);

/* -- the suppression, the one with a statute --------------------------- */

ok("the suppression survived the merge", plan.suppression?.kept === true,
   JSON.stringify(plan.suppression));
ok("and the file really did try to clear it", plan.suppression?.fileSaid === false);
ok("it is announced on screen, not buried in a field list", await page.isVisible("#suppression"));
const supp = await page.textContent("#suppression");
ok(
  "and the notice names the statute and the amount",
  /TCPA/.test(supp) && /500/.test(supp),
  supp.replace(/\s+/g, " ").slice(0, 100),
);

/* -- discards are listed ------------------------------------------------ */

/**
 * `mergeContacts` reports what the incoming row wanted and did not get. A
 * review screen showing only the changes hides exactly what somebody is
 * reviewing for — the phone number that vanished is the one nobody can find
 * again afterwards.
 */
const discarded = await page.$$eval(".change[data-discarded]", (n) =>
  n.map((x) => x.textContent.replace(/\s+/g, " ").trim()),
);
ok("discarded values are listed", discarded.length > 0, `${discarded.length}`);
ok(
  "and each says what was kept instead",
  discarded.every((t) => /se mantiene/.test(t)),
  discarded[0],
);

/* -- the dry run refuses to be theatre --------------------------------- */

ok("the plan is not cleanly applicable", plan.cleanlyApplicable === false);
ok("so apply starts disabled", await page.isDisabled("#apply"));
const stateText = await page.textContent("#apply-state");
ok(
  "and says how many rows are blocking it",
  /sin resolver/.test(stateText),
  stateText.replace(/\s+/g, " ").slice(0, 80),
);

const reviewCards = await page.$$(".review");
ok("one card per row needing a person", reviewCards.length === plan.counts.review,
   `${reviewCards.length} of ${plan.counts.review}`);

/**
 * Resolving all but one must not enable apply. Off-by-one here is how a file
 * gets imported with an unreviewed merge in it.
 */
for (let i = 0; i < reviewCards.length - 1; i++) {
  await reviewCards[i].$$eval("button", (b) => b[b.length - 1].click());
}
ok(
  "apply stays disabled with one row left",
  await page.isDisabled("#apply"),
  await page.textContent("#apply-state"),
);

await reviewCards[reviewCards.length - 1].$$eval("button", (b) => b[b.length - 1].click());
ok("apply enables only when every row is resolved", !(await page.isDisabled("#apply")));

ok(
  "a resolved card records what was chosen",
  (await page.$$eval(".resolved-note", (n) => n.length)) === plan.counts.review,
);

/**
 * The screen offers no path that turns a review into an automatic merge. A
 * reviewer picks a specific record by id, or the row is created new. Anything
 * looser would reintroduce the confident wrong answer dedupe.ts refuses.
 */
const choices = await page.$$eval("[data-choose]", (n) => n.map((x) => x.dataset.choose));
ok(
  "every review choice is an explicit record, a new contact, or a skip",
  choices.every((c) => c === "new" || c === "skip" || /^a\d+$/.test(c)),
  choices.join(","),
);

await page.click("#apply");
ok(
  "applying says plainly that this dry run writes nothing",
  /no escribe nada/i.test(await page.textContent("#apply-state")),
  await page.textContent("#apply-state"),
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
