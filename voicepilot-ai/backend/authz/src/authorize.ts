/**
 * The check, and the audit obligation that comes with it.
 *
 * `docs/09` §3 gives the algorithm, and the order is the design:
 *
 * ```
 * 1. Does R belong to U's tenant?   -> if not, 404 (never 403)
 * 2. Does any role of U grant A?
 * 3. Does the role's scope cover R's team/campaign?
 * 4. Is there an explicit denial?
 * ```
 *
 * The part that is not in the spec, and that this module adds, is what
 * happens *after* an allow.
 *
 * Eight actions in `AUDITED` must be logged without exception — playing a
 * recording, joining a live call, exporting, touching integration
 * credentials. In most systems that is two separate lines of code: check
 * permission, then write the audit entry. The second line is the one that
 * gets forgotten, refactored away, or skipped on the error path, and the
 * failure is silent: the action succeeds and no one ever knows it happened.
 *
 * So the two are welded together. `authorize()` returns a decision carrying
 * an audit obligation, and `perform()` is the only way to act on it: it
 * writes the entry **first**, and if the write fails the action does not
 * run. **If we cannot record it, we do not do it** — an unlogged recording
 * playback is indistinguishable, afterwards, from an unauthorised one, and
 * "we think it was fine" is not an answer to a regulator or to a customer
 * asking who listened to their call.
 */

import {
  ANALYST_HARD_DENIALS,
  AUDITED,
  ROLE_PERMISSIONS,
  isOwner,
  permission,
  type Action,
  type Principal,
  type Resource,
} from "./model.ts";

export type Decision =
  | { readonly kind: "allow"; readonly mustAudit: boolean }
  /** Cross-tenant. The caller must render this as 404, not 403. */
  | { readonly kind: "not_found" }
  | { readonly kind: "forbidden"; readonly reason: string };

export interface AuditEntry {
  readonly at: Date;
  readonly userId: string;
  readonly tenantId: string;
  readonly action: Action;
  readonly resourceKind: string;
  readonly resourceId: string;
}

export interface AuditSink {
  /** Throws if the entry cannot be durably recorded. */
  record(entry: AuditEntry): void;
}

export class AuditFailure extends Error {}
export class NotAuthorized extends Error {
  readonly decision: Decision;
  constructor(decision: Decision) {
    super(decision.kind === "not_found" ? "not found" : "forbidden");
    this.decision = decision;
  }
}

export function authorize(
  principal: Principal,
  action: Action,
  resource: Resource,
): Decision {
  // 1. Tenant. First, and it does not distinguish between "does not exist"
  //    and "exists elsewhere" — that distinction is the leak.
  if (resource.tenantId !== principal.tenantId) {
    return { kind: "not_found" };
  }

  const perm = permission(action, resource.kind);

  // The analyst separation, refused before anything can grant around it. A
  // boundary that survives only while nobody adds a grant is not a boundary.
  if (principal.roles.includes("analyst") && ANALYST_HARD_DENIALS.includes(perm)) {
    return {
      kind: "forbidden",
      reason: "analysts see numbers, not people (docs/09 §3)",
    };
  }

  // 4, hoisted. An explicit denial wins over every grant, including the
  // owner's — which is the only way "revoke this person's access now" is a
  // thing an admin can actually do during an incident.
  if (principal.denials.includes(perm)) {
    return { kind: "forbidden", reason: "explicitly denied" };
  }

  if (isOwner(principal)) {
    return { kind: "allow", mustAudit: AUDITED.includes(perm) };
  }

  // 2. Roles, plus explicit grants beyond them.
  const granted =
    principal.grants.includes(perm) ||
    principal.roles.some((r) => ROLE_PERMISSIONS[r].includes(perm));
  if (!granted) {
    return { kind: "forbidden", reason: `no role grants ${perm}` };
  }

  // 3. Scope. An empty `teamIds` is tenant-wide; a non-empty one confines
  //    the principal to those teams even where the role would allow more.
  if (!coversScope(principal, resource)) {
    return { kind: "forbidden", reason: "outside the principal's scope" };
  }

  // The agent role is narrower than its permissions suggest: it can read
  // *its own* calls and leads. Encoding that as scope rather than as a
  // permission keeps one algorithm instead of two.
  if (
    principal.roles.length === 1 &&
    principal.roles[0] === "agent" &&
    resource.ownerUserId !== undefined &&
    resource.ownerUserId !== principal.userId
  ) {
    return { kind: "forbidden", reason: "agents see only their own records" };
  }

  return { kind: "allow", mustAudit: AUDITED.includes(perm) };
}

function coversScope(principal: Principal, resource: Resource): boolean {
  if (principal.teamIds.length === 0) return true;
  if (resource.teamId === undefined) return true;
  return principal.teamIds.includes(resource.teamId);
}

/**
 * The only way to act on a decision.
 *
 * Audit first, then the action — never the other way round. If the sink
 * throws, nothing runs and the caller sees `AuditFailure`. Losing the
 * feature while the audit store is down is the correct trade: the
 * alternative is a recording played with no record of who played it, which
 * is the exact question a customer asks after a breach.
 */
export function perform<T>(
  decision: Decision,
  ctx: {
    principal: Principal;
    action: Action;
    resource: Resource;
    audit: AuditSink;
    now?: () => Date;
  },
  fn: () => T,
): T {
  if (decision.kind !== "allow") {
    throw new NotAuthorized(decision);
  }
  if (decision.mustAudit) {
    try {
      ctx.audit.record({
        at: (ctx.now ?? (() => new Date()))(),
        userId: ctx.principal.userId,
        tenantId: ctx.principal.tenantId,
        action: ctx.action,
        resourceKind: ctx.resource.kind,
        resourceId: ctx.resource.id,
      });
    } catch (e) {
      throw new AuditFailure(
        `refusing ${ctx.action}:${ctx.resource.kind} — the audit entry could ` +
          `not be recorded (${e instanceof Error ? e.message : String(e)})`,
      );
    }
  }
  return fn();
}

/** Convenience for the common path: check, audit, act. */
export function guard<T>(
  principal: Principal,
  action: Action,
  resource: Resource,
  audit: AuditSink,
  fn: () => T,
): T {
  return perform(authorize(principal, action, resource), {
    principal,
    action,
    resource,
    audit,
  }, fn);
}

/**
 * The HTTP status a decision becomes.
 *
 * Here rather than at each call site, because the day somebody writes
 * `res.status(403)` for a cross-tenant miss is the day the enumeration
 * oracle opens, and it will look like a reasonable line of code.
 */
export function httpStatus(decision: Decision): 200 | 403 | 404 {
  switch (decision.kind) {
    case "allow":
      return 200;
    case "not_found":
      return 404;
    case "forbidden":
      return 403;
  }
}
