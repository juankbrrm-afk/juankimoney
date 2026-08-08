/**
 * Writing back through a CRM we have no API for.
 *
 * This is the other half of "works with any CRM". `docs/07` §6:
 *
 * > **Without an API (L1):** the content script fills the host CRM's own form
 * > fields and the agent presses save. **It is verified that the value was
 * > actually written before the operation is marked successful.**
 *
 * That last clause is the whole module. Filling a field is one line; knowing
 * whether it took is the hard part, because the page belongs to somebody
 * else and it will do things to the value on the way in:
 *
 * - React and Angular ignore a programmatic `.value =` unless an input event
 *   is dispatched, so the field looks filled and the framework's state is
 *   empty. The agent presses save and nothing is saved.
 * - The CRM reformats. `3055550142` comes back as `(305) 555-0142`. Same
 *   number, different string; a naive comparison calls a successful write a
 *   failure and the sync queue retries forever.
 * - The CRM truncates. A 900-character call summary is silently cut to 500,
 *   and the part that got cut is usually the end — where the follow-up
 *   commitment lives.
 * - The field is read-only, or disabled, or was not there at all because the
 *   layout changed.
 *
 * Reporting all four as "written" is how a customer discovers, a month in,
 * that a third of their call notes are missing. So the result of a write is
 * a verdict per field, and only `written` is success.
 */
function loose(s) {
    return s.trim().replace(/\s+/g, " ").toLowerCase();
}
function digits(s) {
    return s.replace(/\D+/g, "");
}
function matches(wrote, kept, tolerance) {
    switch (tolerance) {
        case "exact":
            return wrote === kept;
        case "loose":
            return loose(wrote) === loose(kept);
        case "digits":
            return digits(wrote) === digits(kept) && digits(wrote).length > 0;
        case "prefix":
            return loose(wrote).startsWith(loose(kept)) && loose(kept).length > 0;
        default: {
            // An unrecognised tolerance is refused rather than defaulted to
            // something permissive. A new value added upstream and forgotten here
            // must fail loudly, not quietly accept every write.
            const never = tolerance;
            throw new Error(`unknown tolerance: ${String(never)}`);
        }
    }
}
/**
 * Fill the host CRM's fields and verify each one.
 *
 * One bad field never fails the rest — the same rule as the sync queue's
 * "a failing field does not fail the whole write". Losing an entire call
 * note because one custom field was misconfigured is the failure mode that
 * rule exists to prevent, and it applies identically here.
 */
export function writeThroughForm(writer, fields) {
    const outcomes = [];
    for (const field of fields) {
        const tolerance = field.tolerate ?? "exact";
        let editable;
        try {
            editable = writer.isEditable(field.selector);
        }
        catch {
            outcomes.push({ status: "missing", selector: field.selector });
            continue;
        }
        if (!editable) {
            // Distinguished from `missing` on purpose. A read-only field is a
            // permissions or workflow problem the customer's admin can fix; a
            // missing one means our selector config is stale. They go to
            // different people.
            outcomes.push({ status: "read_only", selector: field.selector });
            continue;
        }
        try {
            writer.fill(field.selector, field.value);
        }
        catch (e) {
            outcomes.push({
                status: "rejected",
                selector: field.selector,
                reason: e instanceof Error ? e.message : String(e),
            });
            continue;
        }
        const kept = safeRead(writer, field.selector);
        if (kept === null) {
            outcomes.push({ status: "missing", selector: field.selector });
            continue;
        }
        if (matches(field.value, kept, tolerance)) {
            outcomes.push({ status: "written", selector: field.selector, value: field.value });
            continue;
        }
        // A truncation is called out separately because of what gets lost. The
        // end of a call summary is where the commitment lives — "will call back
        // Friday", "promised the discount expires the 31st" — so a note cut to
        // fit a 500-character column loses precisely the part that mattered.
        const truncated = kept.length < field.value.length && loose(field.value).startsWith(loose(kept));
        outcomes.push({
            status: "altered",
            selector: field.selector,
            wrote: field.value,
            kept,
            truncated,
        });
    }
    const bad = outcomes.filter((o) => o.status !== "written");
    return {
        outcomes,
        ok: bad.length === 0,
        summary: bad.length === 0
            ? `${outcomes.length} field${outcomes.length === 1 ? "" : "s"} written and verified`
            : `${outcomes.length - bad.length}/${outcomes.length} written; ` +
                bad.map((o) => `${o.selector} ${o.status}`).join(", "),
    };
}
function safeRead(writer, selector) {
    try {
        return writer.read(selector);
    }
    catch {
        return null;
    }
}
