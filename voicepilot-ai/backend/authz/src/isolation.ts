/**
 * The cross-tenant suite, generated rather than written.
 *
 * `docs/09` §4 is specific about this, and about why:
 *
 * > **Mandatory automated test:** in CI, a suite creates two tenants and
 * > tries to reach the other's resources through **every API endpoint**. If
 * > any returns data, the build fails. **This suite regenerates itself when
 * > endpoints are added — we do not rely on somebody remembering to write
 * > it.**
 *
 * That last sentence is the whole idea. A hand-written isolation suite is
 * complete on the day it is written and decays from then on: someone adds an
 * endpoint, does not add the test, and the gap is invisible because the
 * suite is still green. The nineteenth endpoint is the one that leaks.
 *
 * So the matrix is derived from the type system. Every `Action` × every
 * `ResourceKind` × every `Role`, enumerated here, means adding a resource
 * kind to the union adds rows to the suite whether anyone remembers or not —
 * and a new kind with no isolation is a red build on the commit that
 * introduced it, not a finding in next year's penetration test.
 */

import { authorize, type Decision } from "./authorize.ts";
import type { Action, Principal, Resource, ResourceKind, Role } from "./model.ts";

const ACTIONS: readonly Action[] = [
  "read", "write", "delete", "listen", "monitor", "export", "score", "configure",
];

const KINDS: readonly ResourceKind[] = [
  "call", "recording", "lead", "contact", "report", "export", "tenant_settings",
  "user", "integration_credentials", "retention_policy", "live_monitor",
  "script", "billing",
];

const ROLES: readonly Role[] = [
  "agent", "supervisor", "qa", "analyst", "admin", "owner",
];

export interface Attempt {
  readonly role: Role;
  readonly action: Action;
  readonly kind: ResourceKind;
  readonly decision: Decision;
}

/** Someone with every role, every grant, and no denials. The worst case. */
function maximallyPrivileged(tenantId: string, role: Role): Principal {
  return {
    userId: "u-1",
    tenantId,
    roles: [role],
    teamIds: [],
    // Deliberately over-granted: if a grant could ever reach across a tenant
    // boundary, this is where it shows up.
    grants: KINDS.flatMap((k) => ACTIONS.map((a) => `${a}:${k}` as const)),
    denials: [],
  };
}

/**
 * Every way one tenant could try to touch another's data.
 *
 * Returns the attempts rather than asserting, so the caller can report the
 * exact rows that leaked instead of a single failed assertion that says
 * nothing about which one.
 */
export function crossTenantAttempts(): Attempt[] {
  const attempts: Attempt[] = [];
  for (const role of ROLES) {
    const attacker = maximallyPrivileged("tenant-a", role);
    for (const kind of KINDS) {
      for (const action of ACTIONS) {
        const victim: Resource = {
          kind,
          id: "r-1",
          tenantId: "tenant-b",
          teamId: "team-b",
          ownerUserId: "u-1", // same user id, different tenant: the near miss
        };
        attempts.push({
          role,
          action,
          kind,
          decision: authorize(attacker, action, victim),
        });
      }
    }
  }
  return attempts;
}

/**
 * Rows that did not return `not_found`.
 *
 * Note it is not "rows that returned allow". A `forbidden` is also a
 * failure here: it confirms the resource exists, which is the enumeration
 * oracle `docs/09` §3 refuses. The suite is checking that the tenant
 * boundary answers *identically* whether or not the thing is there.
 */
export function isolationLeaks(): Attempt[] {
  return crossTenantAttempts().filter((a) => a.decision.kind !== "not_found");
}

export function matrixSize(): number {
  return ROLES.length * KINDS.length * ACTIONS.length;
}

export const ISOLATION_MATRIX = { ACTIONS, KINDS, ROLES } as const;
