/**
 * Find Playwright and Chromium without adding a dependency to this package.
 *
 * The repository has no `node_modules` and the rest of it needs none — the
 * TypeScript packages compile with `tsc --ignoreConfig` and test with
 * `node:test`. Browser tests are the one place that genuinely cannot be done
 * with the standard library, and the answer is to borrow a Playwright that
 * is already on the machine rather than to make every package that renders
 * HTML carry an install step.
 *
 * Both lookups are resolved at runtime and both fail with an instruction
 * rather than a stack trace, because the person who hits this is whoever
 * cloned the repo on a machine set up differently from this one.
 */
import { createRequire } from "node:module";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const CANDIDATE_ROOTS = [
  // A local install, if somebody has made one.
  process.cwd(),
  // The image's global install. `playwright` bundles `playwright-core`.
  "/opt/node22/lib/node_modules/playwright",
  "/usr/lib/node_modules/playwright",
  "/usr/local/lib/node_modules/playwright",
];

export async function loadChromium() {
  const require = createRequire(import.meta.url);
  for (const root of CANDIDATE_ROOTS) {
    try {
      const entry = require.resolve("playwright-core", { paths: [root] });
      const mod = await import(`file://${entry}`);
      return (mod.default ?? mod).chromium;
    } catch {
      // Try the next root. A missing module here is expected, not an error.
    }
  }
  throw new Error(
    "playwright-core not found. Install it (`npm i -g playwright`) or set " +
      "NODE_PATH to a directory that has it.",
  );
}

/**
 * The browser binary.
 *
 * `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` is set in this environment and
 * the directory is versioned (`chromium-1194`), so the version is discovered
 * rather than hard-coded — pinning it means the test breaks silently the day
 * the image updates, and "silently" is the part that costs an afternoon.
 */
export function chromiumPath() {
  if (process.env.CHROMIUM) return process.env.CHROMIUM;

  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  if (!existsSync(base)) return undefined; // let Playwright look for itself

  const dirs = readdirSync(base)
    .filter((d) => d.startsWith("chromium-"))
    .sort()
    .reverse();
  for (const d of dirs) {
    const bin = resolve(base, d, "chrome-linux", "chrome");
    if (existsSync(bin)) return bin;
  }
  return undefined;
}
