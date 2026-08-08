/**
 * The canonical CRM model.
 *
 * `docs/07-flujo-crm.md` states the rule this file exists to enforce:
 *
 * > One model. The native CRM is its reference implementation; connectors are
 * > translators between it and the outside world.
 *
 * The failure mode it prevents is the one that sinks products that "also come
 * with a CRM": two data models, two sets of business rules, two places to fix
 * every bug, and features that exist in one mode and not the other.
 *
 * So business logic — assignment, scoring, post-call writeback, reporting —
 * operates on these types and never learns whether the tenant is on the native
 * CRM or on Salesforce, HubSpot, or ReadyMode.
 */
export class ValidationError extends Error {
    issues;
    constructor(issues) {
        // The message carries the first issue's detail, not just the field name.
        // "validation failed: phone" in a production log tells whoever is on call
        // nothing they can act on; the reason is the whole point of the error.
        const first = issues[0];
        const detail = first ? `${first.field}: ${first.message}` : "unknown";
        const more = issues.length > 1 ? ` (+${issues.length - 1} more)` : "";
        super(`validation failed — ${detail}${more}`);
        this.name = "ValidationError";
        this.issues = issues;
    }
}
/**
 * E.164, strictly.
 *
 * Loose phone handling is how a call centre ends up dialling the wrong country
 * code at scale, and how DNC checks silently miss. `+1 305 555 0142`,
 * `(305) 555-0142` and `13055550142` are the same number to a human and three
 * different keys to a database — so normalisation happens once, here, and
 * anything that cannot be normalised is rejected rather than guessed.
 */
export function normaliseE164(input, defaultCountryCode = "1") {
    const trimmed = input.trim();
    if (trimmed === "") {
        throw new ValidationError([
            { field: "phone", code: "empty", message: "phone number is empty" },
        ]);
    }
    const hadPlus = trimmed.startsWith("+");
    const digits = trimmed.replace(/\D/g, "");
    if (digits.length === 0) {
        throw new ValidationError([
            { field: "phone", code: "no_digits", message: `no digits in "${input}"` },
        ]);
    }
    // Checked before the country-code logic so the common case of an extension
    // pasted into a phone field ("ext. 401", "x2231") gets an error that says
    // what is actually wrong instead of one about country codes.
    if (!hadPlus && digits.length < 7) {
        throw new ValidationError([
            {
                field: "phone",
                code: "too_short",
                message: `"${input}" has only ${digits.length} digits — too short for a phone number, is it an extension?`,
            },
        ]);
    }
    let full;
    if (hadPlus) {
        full = digits;
    }
    else if (digits.length === 10) {
        // A bare 10-digit number in a US-facing call centre is a US number.
        full = defaultCountryCode + digits;
    }
    else if (digits.length === 11 && digits.startsWith("1")) {
        full = digits;
    }
    else {
        // Ambiguous: could be international without the plus, could be an
        // extension, could be junk. Guessing here is how wrong-country dialling
        // happens.
        throw new ValidationError([
            {
                field: "phone",
                code: "ambiguous",
                message: `cannot determine country code for "${input}" — needs a leading +`,
            },
        ]);
    }
    if (full.length < 8 || full.length > 15) {
        throw new ValidationError([
            {
                field: "phone",
                code: "length",
                message: `E.164 allows 8-15 digits, got ${full.length} from "${input}"`,
            },
        ]);
    }
    return "+" + full;
}
export function isValidE164(value) {
    return /^\+[1-9]\d{7,14}$/.test(value);
}
const LEAD_STATUSES = [
    "new",
    "contacted",
    "qualified",
    "unqualified",
    "converted",
    "lost",
];
export function validateLead(lead) {
    const issues = [];
    if (!lead.tenantId) {
        issues.push({
            field: "tenantId",
            code: "required",
            // Not a formality: tenant isolation is enforced in four independent
            // layers (`docs/09`) and this is the first of them.
            message: "tenantId is required on every record, without exception",
        });
    }
    if (lead.status && !LEAD_STATUSES.includes(lead.status)) {
        issues.push({
            field: "status",
            code: "enum",
            message: `unknown lead status "${lead.status}"`,
        });
    }
    if (lead.aiScore !== undefined && (lead.aiScore < 0 || lead.aiScore > 1)) {
        issues.push({
            field: "aiScore",
            code: "range",
            message: "aiScore is a probability and must be within 0..1",
        });
    }
    return issues;
}
export function validateContact(contact) {
    const issues = [];
    if (!contact.tenantId) {
        issues.push({
            field: "tenantId",
            code: "required",
            message: "tenantId is required on every record, without exception",
        });
    }
    if (contact.phoneE164 && !isValidE164(contact.phoneE164)) {
        issues.push({
            field: "phoneE164",
            code: "format",
            message: `"${contact.phoneE164}" is not E.164; normalise before storing`,
        });
    }
    if (contact.doNotCall && !contact.dncReason) {
        issues.push({
            field: "dncReason",
            code: "required",
            // A DNC flag with no provenance cannot be defended to a regulator, and
            // cannot be safely cleared by anyone later.
            message: "a do-not-call flag must record why it was set",
        });
    }
    return issues;
}
