/**
 * Which record is the agent looking at?
 *
 * This is the question that makes "works with any CRM" true or false. L2 and
 * L3 read the answer from an API. L1 — the tier that covers everything else,
 * including the in-house PHP systems that are most of this market — has to
 * work it out from a page it does not own.
 *
 * `docs/07` §6 specifies the cascade, in order of reliability:
 *
 * ```
 * a) URL pattern            most stable
 * b) DOM data-* attributes
 * c) CSS selectors from the server
 * d) ask the agent          last resort, one click
 * ```
 *
 * The important design decision is not the cascade. It is what happens when
 * two rungs disagree.
 *
 * A wrong answer here is not a missing feature — it is a call note written
 * onto a different customer's record, a disposition set on the wrong lead,
 * and a pipeline the customer can no longer trust. Nobody notices for weeks,
 * and when they do, the damage is a data-integrity incident rather than a
 * bug. So conflicting evidence produces a refusal, never a majority vote:
 * ask the agent, who can see the screen.
 *
 * The same instinct as `providers/readymode.ts` returning `UNKNOWN` instead
 * of a plausible guess. A confidently wrong binding is worse than no binding.
 */
/**
 * Confidence per rung, and the reason for the ordering.
 *
 * A URL is part of the CRM's routing contract: it changes on a release, with
 * a redirect, and loudly. A `data-record-id` attribute is nearly as good. A
 * CSS selector reading visible text is a guess about layout that breaks
 * silently the next time somebody moves a column — it is good enough to
 * *offer* the agent a binding, never good enough to write without one.
 */
export const RUNG_CONFIDENCE = Object.freeze({
    url: 0.98,
    attribute: 0.9,
    selector: 0.6,
    agent: 1.0, // a human looking at the screen is the ground truth
});
/** Above this, a detection may drive an automatic write. */
export const AUTO_WRITE_CONFIDENCE = 0.85;
/**
 * Extract `:id` from a path pattern.
 *
 * Returns null rather than throwing on anything unexpected. This runs against
 * pages we do not control, on configs that may be stale; a thrown exception
 * here takes the agent's copilot panel down mid-call, which is a far worse
 * outcome than failing to detect a record.
 */
export function matchUrlPattern(url, pattern, hostSuffix) {
    let parsed;
    try {
        parsed = new URL(url);
    }
    catch {
        return null;
    }
    if (hostSuffix && !hostMatches(parsed.hostname, hostSuffix))
        return null;
    const want = pattern.split("/").filter((s) => s.length > 0);
    const got = parsed.pathname.split("/").filter((s) => s.length > 0);
    if (want.length !== got.length)
        return null;
    let id = null;
    for (let i = 0; i < want.length; i++) {
        if (want[i] === ":id") {
            id = decodeURIComponent(got[i]);
            continue;
        }
        if (want[i] !== got[i])
            return null;
    }
    return id && id.length > 0 ? id : null;
}
/**
 * Suffix match on hostname boundaries.
 *
 * `endsWith("salesforce.com")` also matches `notsalesforce.com`, which is a
 * way to get the extension to activate — and send a session token's worth of
 * behaviour — on a domain the tenant never configured.
 */
export function hostMatches(hostname, suffix) {
    const h = hostname.toLowerCase();
    const s = suffix.toLowerCase().replace(/^\./, "");
    return h === s || h.endsWith("." + s);
}
/** Ids are compared after this. CRMs pad, case-shift and pretty-print them. */
function normaliseId(raw) {
    return raw.trim().replace(/^#/, "");
}
export function detect(page, config) {
    const candidates = [];
    for (const rule of config.rules) {
        if (rule.hostSuffix && !hostOf(page.url, rule.hostSuffix))
            continue;
        if (rule.urlPattern) {
            const id = matchUrlPattern(page.url, rule.urlPattern, rule.hostSuffix);
            if (id)
                candidates.push({ rung: "url", entity: rule.entity, externalId: normaliseId(id) });
        }
        if (rule.attribute) {
            const v = safe(() => page.attribute(rule.attribute.selector, rule.attribute.name));
            if (v && v.trim()) {
                candidates.push({ rung: "attribute", entity: rule.entity, externalId: normaliseId(v) });
            }
        }
        if (rule.selector) {
            const v = safe(() => page.read(rule.selector.selector, rule.selector.from));
            if (v && v.trim()) {
                candidates.push({ rung: "selector", entity: rule.entity, externalId: normaliseId(v) });
            }
        }
    }
    if (candidates.length === 0) {
        return { kind: "none", reason: "no rule matched this page", configVersion: config.version };
    }
    // Disagreement is refused, never voted on. Two rungs pointing at different
    // records means one of them is reading a stale fragment of the page — a
    // list row left over from the previous lead, a cached header — and there is
    // no way to tell which from here. The agent can see the screen.
    const ids = new Set(candidates.map((c) => `${c.entity}:${c.externalId}`));
    if (ids.size > 1) {
        return {
            kind: "ambiguous",
            candidates,
            reason: "the page yielded more than one record; refusing to guess which one " +
                "the agent is working",
            configVersion: config.version,
        };
    }
    const best = candidates.reduce((a, b) => RUNG_CONFIDENCE[b.rung] > RUNG_CONFIDENCE[a.rung] ? b : a);
    const corroboratedBy = candidates.filter((c) => c.rung !== best.rung).map((c) => c.rung);
    return {
        kind: "bound",
        entity: best.entity,
        externalId: best.externalId,
        rung: best.rung,
        confidence: RUNG_CONFIDENCE[best.rung],
        configVersion: config.version,
        corroboratedBy,
    };
}
/**
 * Bind to what the agent picked.
 *
 * The bottom rung of the cascade, and the one that makes the other three
 * safe to be strict about: refusing an ambiguous page costs the agent one
 * click, so there is never a reason to guess.
 */
export function bindFromAgent(entity, externalId, configVersion) {
    const id = normaliseId(externalId);
    if (!id) {
        return { kind: "none", reason: "agent supplied an empty id", configVersion };
    }
    return {
        kind: "bound",
        entity,
        externalId: id,
        rung: "agent",
        confidence: RUNG_CONFIDENCE.agent,
        configVersion,
        corroboratedBy: [],
    };
}
/**
 * May this binding drive a write without the agent confirming the record?
 *
 * The asymmetry is deliberate. Showing the copilot against a possibly-wrong
 * record wastes a suggestion. Writing to a possibly-wrong record corrupts a
 * customer's CRM. The same detection is good enough for one and not the
 * other, and conflating them is how the second happens.
 */
export function mayAutoWrite(d) {
    return d.kind === "bound" && d.confidence >= AUTO_WRITE_CONFIDENCE;
}
function hostOf(url, suffix) {
    try {
        return hostMatches(new URL(url).hostname, suffix);
    }
    catch {
        return false;
    }
}
function safe(f) {
    try {
        return f();
    }
    catch {
        // A malformed selector from a stale server config must not take down the
        // panel. It degrades to "this rung found nothing", which the cascade
        // already knows how to handle.
        return null;
    }
}
