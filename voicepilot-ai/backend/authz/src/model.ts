/**
 * Who is asking, what they are asking for, and what the roles allow.
 *
 * `docs/09` §3 and §4. Two decisions here are structural rather than
 * procedural, and both exist because the alternative depends on a developer
 * remembering something under deadline.
 *
 * **`tenantId` can only come from the signed token.** Not a header, not a
 * query parameter, not a field in the body. `Principal` is constructed from
 * verified token claims and there is no other constructor, so there is no
 * shape of this API in which a caller supplies the tenant they would like to
 * be. That closes the whole class of bug where an endpoint trusts
 * `?tenant_id=` because it seemed convenient at the time.
 *
 * **A cross-tenant miss is a 404, never a 403.** A 403 confirms the resource
 * exists. Given sequential or guessable ids, that turns an authorization
 * check into an enumeration oracle: probe ids, collect the 403s, and you now
 * know how many calls a competitor's tenant made last month without ever
 * being allowed to read one.
 */

export type Role = "agent" | "supervisor" | "qa" | "analyst" | "admin" | "owner";

export type ResourceKind =
  | "call"
  | "recording"
  | "lead"
  | "contact"
  | "report"
  | "export"
  | "tenant_settings"
  | "user"
  | "integration_credentials"
  | "retention_policy"
  | "live_monitor"
  | "script"
  | "billing";

export type Action =
  | "read"
  | "write"
  | "delete"
  | "listen"      // play or download a recording
  | "monitor"     // join a live call
  | "export"
  | "score"       // QA scoring
  | "configure";

export interface Principal {
  readonly userId: string;
  /** From the signed token. There is no path by which a request supplies it. */
  readonly tenantId: string;
  readonly roles: readonly Role[];
  /** Teams the principal's scope covers. Empty means tenant-wide. */
  readonly teamIds: readonly string[];
  /**
   * Explicit, audited grants beyond the base role. `docs/09` §3: an admin
   * being able to listen to every sales call by default is a problem, not a
   * feature — so listening is a grant somebody made on purpose, and the
   * making of it is itself an audited action.
   */
  readonly grants: readonly `${Action}:${ResourceKind}`[];
  /** Explicit denials. Step 4 of the algorithm, and they win. */
  readonly denials: readonly `${Action}:${ResourceKind}`[];
}

export interface Resource {
  readonly kind: ResourceKind;
  readonly id: string;
  readonly tenantId: string;
  /** Absent for tenant-wide resources like settings. */
  readonly teamId?: string;
  /** The agent a call or lead belongs to. Drives the agent role's scope. */
  readonly ownerUserId?: string;
}

type Permission = `${Action}:${ResourceKind}`;

/**
 * The base roles from `docs/09` §3.
 *
 * Two separations are deliberate and worth not undoing later:
 *
 * - **Analyst sees numbers, not people.** Whoever builds reports does not
 *   need to hear calls or see phone numbers. It is the cheapest possible
 *   reduction of leak surface.
 * - **Admin configures, does not listen.** `listen:recording` is absent from
 *   admin on purpose; it arrives only as an explicit grant.
 */
export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> =
  Object.freeze({
    agent: [
      "read:call", "read:lead", "read:contact", "write:lead", "write:contact",
      "read:script",
    ],
    supervisor: [
      "read:call", "listen:recording", "monitor:live_monitor", "read:lead",
      "read:contact", "write:lead", "read:report", "read:script", "score:call",
    ],
    qa: [
      "read:call", "listen:recording", "score:call", "read:report",
      "read:script",
    ],
    analyst: [
      "read:report", "export:export", "read:call",
    ],
    admin: [
      "read:tenant_settings", "configure:tenant_settings", "read:user",
      "write:user", "delete:user", "read:integration_credentials",
      "configure:integration_credentials", "configure:retention_policy",
      "read:retention_policy", "read:script", "write:script", "read:report",
    ],
    owner: [], // handled separately — see `isOwner`
  });

/**
 * Actions the analyst role must never reach, whatever else is granted.
 *
 * A separation that only holds while nobody adds a grant is not a
 * separation. These are refused before grants are consulted.
 */
export const ANALYST_HARD_DENIALS: readonly Permission[] = Object.freeze([
  "listen:recording",
  "monitor:live_monitor",
  "read:contact",
]);

/**
 * `docs/09` §3: these write to the audit log **without exception**, and the
 * tenant can query them from the UI.
 *
 * Being able to read your own audit log is what makes the log worth keeping.
 * A log only we can see protects us; a log the customer can see protects
 * them, which is the one they will ask about during procurement.
 */
export const AUDITED: readonly Permission[] = Object.freeze([
  "listen:recording",
  "monitor:live_monitor",
  "export:export",
  "write:user",
  "delete:user",
  "read:integration_credentials",
  "configure:integration_credentials",
  "configure:retention_policy",
]);

export function permission(action: Action, kind: ResourceKind): Permission {
  return `${action}:${kind}`;
}

export function isOwner(p: Principal): boolean {
  return p.roles.includes("owner");
}
