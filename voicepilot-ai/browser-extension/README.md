# browser-extension

Chrome MV3. `docs/07` §6 calls it the product's Trojan horse: it works with
**any** web CRM, including the in-house PHP ones with no API — which in this
market is most of them.

```bash
node build.mjs                 # regenerate vendor/ from shared/crm
node test/extension.test.mjs   # 9 checks, in a real Chromium
```

The test needs `playwright-core`; everything else here has no dependencies.

---

## What this folder is, and mostly is not

The hard part of L1 — **which record is open** and **did the write land** —
lives in [`shared/crm`](../shared/crm/) with 26 tests behind it. This folder
is the wrapper that puts it in a browser. `build.mjs` generates `vendor/`
from that source rather than copying it, because `shared/README.md` is right
about hand-written clients: a second copy drifts, and the drift is invisible
because the original's tests still pass.

## Four constraints from the spec, and why each one holds

**Side Panel, never an injected overlay.** A floating panel in somebody
else's DOM breaks their layout, collides with their styles, and generates
complaints. The Side Panel lives outside the page: it cannot break anything.

**Selectors are served, versioned — never shipped.** Salesforce changes its
DOM without warning. A selector inside the extension means a Chrome Web
Store review — days — while the product is broken for every customer at
once. `GET /v1/extension/config` fixes it in minutes.

**No `<all_urls>`.** `host_permissions` is empty and the tenant's own CRM
domains are requested at runtime. `<all_urls>` is a likely rejection in
review and a red flag to any corporate security team, and it is not needed:
we know which domains a tenant uses because they told us.

**The extension stores no business data.** Session token and UI preferences
only. A compromised extension must not be able to leak the lead database —
so the lead database is not here to leak.

## The two failures this wrapper exists to handle

**MV3 kills an idle service worker after 30 seconds.** Fine for most
extensions, fatal here: the agent is mid-call and relying on the panel. The
worker keeps warm with an alarm **only while a call is live**, using the
mechanism Chrome documents rather than one it tolerates.

**React ignores a plain `.value =` assignment.** The field looks filled, the
framework's state stays empty, the agent presses save, and nothing is saved.
`content.js` writes through the native setter and dispatches `input` and
`change` — and `overlay.ts` still refuses to believe it until it reads the
value back. There is a test with a fake CRM that tracks its own state
exactly like React does, and it fails if the naive assignment is used.

## What the browser test adds over the unit tests

The 26 tests in `shared/crm` cover the cascade. What they cannot cover is
whether the thing **loads**: a manifest typo, a wrong module path, a
permission Chrome rejects. Those fail silently in review and loudly in front
of a customer. So the suite launches Chromium with the extension loaded and
asserts the service worker registers at all — that assertion is the manifest
being valid — then drives the generated modules against a fake CRM page.

Honest boundary: the content script itself is not exercised end-to-end,
because host permissions are granted per tenant domain and a test fixture is
not one. What is verified is the manifest, the worker registration, and that
the generated logic behaves in a real DOM.
