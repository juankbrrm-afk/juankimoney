/**
 * Generate the extension's copy of the L1 logic from `shared/crm`.
 *
 * `shared/README.md`: *types and clients are generated, never written by
 * hand — a hand-written client drifts and fails in production.* The record
 * detection cascade and the write verifier are the sharpest example: if the
 * extension carried its own copy, the tests in `shared/crm` would be
 * testing something the browser does not run, which is worse than having no
 * tests at all because it looks like coverage.
 *
 *   node build.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";

rmSync("vendor", { recursive: true, force: true });
mkdirSync("vendor", { recursive: true });

execFileSync("npx", [
  "tsc",
  "--ignoreConfig",
  "../shared/crm/src/binding.ts",
  "../shared/crm/src/overlay.ts",
  "--outDir", "vendor",
  "--target", "ES2022",
  "--module", "ESNext",
  "--moduleResolution", "bundler",
  "--allowImportingTsExtensions",
  "--rewriteRelativeImportExtensions",
  "--strict",
  // The browser build takes `URL` from lib.dom. `src/globals.d.ts` exists
  // for the Node-side typecheck, where DOM is deliberately not in `lib` so
  // that nobody can reach for `document` in a module that must also run on
  // the server — including it here would be a duplicate declaration.
], { stdio: "inherit" });

console.log("vendor/ regenerated from shared/crm");
