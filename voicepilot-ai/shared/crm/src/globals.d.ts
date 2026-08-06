/**
 * The one global this package uses, declared rather than imported.
 *
 * `binding.ts` runs in two places: the Chrome extension's content script and
 * the backend that validates a tenant's selector config. Adding `"DOM"` to
 * `lib` would type-check both, and would also put `document`, `window` and
 * `fetch` in scope — which is precisely the coupling `PageView` exists to
 * prevent. Six months from now somebody adds a feature, reaches for
 * `document.querySelector`, and the module is no longer testable outside a
 * browser.
 *
 * `URL` is WHATWG and present in every runtime this package targets. Parsing
 * URLs by hand instead would be worse: hostname parsing done casually is
 * exactly how a lookalike domain slips past a host check.
 */
declare class URL {
  constructor(url: string, base?: string);
  readonly hostname: string;
  readonly pathname: string;
  readonly href: string;
}
