/**
 * The extension, loaded into a real Chromium, against a fake CRM.
 *
 * Unit tests cover the cascade in `shared/crm`. What they cannot cover is
 * whether the thing loads at all: a manifest typo, a module path, a
 * permission Chrome rejects. Those fail silently in review and loudly in
 * front of a customer.
 */
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const ext = resolve(here, "..");
// Chromium refuses ES module imports over file:// — a module fetch has an
// opaque origin there. A four-line static server is less fragile than
// bundling the vendor modules just to test them.
const results = [];
const ok = (name, cond, extra = "") =>
  results.push(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);

const server = createServer(async (req, res) => {
  try {
    const path = resolve(ext, "." + new URL(req.url, "http://x").pathname);
    const body = await readFile(path);
    res.writeHead(200, {
      "content-type": path.endsWith(".js") ? "text/javascript" : "text/html",
    });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, r));
const origin = `http://127.0.0.1:${server.address().port}`;

const ctx = await chromium.launchPersistentContext("", {
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  channel: "chromium",
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});

// The service worker registering at all is the manifest being valid.
let worker = ctx.serviceWorkers()[0];
if (!worker) worker = await ctx.waitForEvent("serviceworker", { timeout: 15_000 });
ok("the service worker registers (the manifest is valid)", !!worker);

const id = new URL(worker.url()).host;
ok("the extension has an id", id.length > 10);

const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));
await page.goto(`${origin}/test/fake-crm.html`);

// The cascade, running in the page through the generated vendor module.
const bound = await page.evaluate(async () => {
  const { detect, mayAutoWrite } = await import("../vendor/binding.js");
  const view = {
    url: "https://crm.acme-leads.internal/lightning/r/Lead/00Q5g00000AbCdE/view",
    attribute: (s, n) => document.querySelector(s)?.getAttribute(n) ?? null,
    read: (s) => document.querySelector(s)?.textContent?.trim() ?? null,
  };
  const config = {
    provider: "acme", version: 7,
    rules: [{
      entity: "lead",
      hostSuffix: "acme-leads.internal",
      urlPattern: "/lightning/r/Lead/:id/view",
      attribute: { selector: "[data-record-id]", name: "data-record-id" },
    }],
  };
  const d = detect(view, config);
  return { d, canWrite: mayAutoWrite(d) };
}).catch((e) => ({ error: String(e) }));

ok("the cascade binds the record inside a real page",
   bound.d?.kind === "bound" && bound.d.externalId === "00Q5g00000AbCdE",
   JSON.stringify(bound).slice(0, 160));
ok("a URL binding is trusted enough to write", bound.canWrite === true);

// The framework case: a naive write leaves the framework's state empty.
const write = await page.evaluate(async () => {
  const { writeThroughForm } = await import("../vendor/overlay.js");
  const writer = {
    isEditable(sel) {
      const el = document.querySelector(sel);
      if (!el) throw new Error("no such element");
      return !el.disabled && !el.readOnly;
    },
    fill(sel, value) {
      const el = document.querySelector(sel);
      const proto = el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    },
    read: (sel) => document.querySelector(sel)?.value ?? null,
  };
  const r = writeThroughForm(writer, [
    { selector: "#note", value: "Interesado, propuesta enviada." },
    { selector: "#disp", value: "Interested" },
    { selector: "#stage", value: "Proposal" },
  ]);
  return { report: r, shadow: window.__shadowNote() };
});

ok("the native setter reaches the framework's own state",
   write.shadow === "Interesado, propuesta enviada.", write.shadow);
ok("a verified write is reported as written",
   write.report.outcomes[0].status === "written");
ok("a read-only field is reported as read_only, not as written",
   write.report.outcomes[2].status === "read_only");
ok("one bad field does not lose the rest",
   write.report.outcomes.filter((o) => o.status === "written").length === 2);
ok("no page errors", errs.length === 0, errs.join(" | "));

await ctx.close();
server.close();

console.log(results.join("\n"));
const failed = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`\n${failed} failing / ${results.length} total`);
process.exit(failed ? 1 : 0);
