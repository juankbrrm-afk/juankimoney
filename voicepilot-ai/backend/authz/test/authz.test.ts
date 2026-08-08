import { test } from "node:test";
import assert from "node:assert/strict";

import {
  AuditFailure,
  NotAuthorized,
  authorize,
  guard,
  httpStatus,
  perform,
  type AuditEntry,
  type AuditSink,
} from "../src/authorize.ts";
import { AUDITED, type Principal, type Resource, type Role } from "../src/model.ts";
import { ISOLATION_MATRIX, isolationLeaks, matrixSize } from "../src/isolation.ts";

function who(role: Role, over: Partial<Principal> = {}): Principal {
  return {
    userId: "u-agent",
    tenantId: "acme",
    roles: [role],
    teamIds: [],
    grants: [],
    denials: [],
    ...over,
  };
}

function thing(over: Partial<Resource> = {}): Resource {
  return { kind: "call", id: "c-1", tenantId: "acme", ...over };
}

class Recorder implements AuditSink {
  entries: AuditEntry[] = [];
  record(e: AuditEntry) {
    this.entries.push(e);
  }
}

class BrokenSink implements AuditSink {
  record(): void {
    throw new Error("audit store unreachable");
  }
}

// ---------------------------------------------------------------------------
// The tenant boundary
// ---------------------------------------------------------------------------

test("the isolation matrix is generated, and every row is a 404", () => {
  // docs/09 §4: the suite regenerates itself when resource kinds are added,
  // so a new kind with no isolation is a red build on the commit that
  // introduced it — not a finding in next year's penetration test.
  const leaks = isolationLeaks();
  assert.deepEqual(
    leaks.map((l) => `${l.role} ${l.action}:${l.kind} -> ${l.decision.kind}`),
    [],
  );
  assert.equal(matrixSize(), 6 * 13 * 8);
});

test("a cross-tenant miss is indistinguishable from a nonexistent resource", () => {
  // A 403 confirms the resource exists. Given guessable ids, that turns an
  // authorization check into an enumeration oracle.
  const owner = who("owner");
  const theirs = authorize(owner, "read", thing({ tenantId: "other" }));
  const missing = authorize(owner, "read", thing({ tenantId: "other", id: "nope" }));
  assert.equal(theirs.kind, "not_found");
  assert.deepEqual(theirs, missing);
  assert.equal(httpStatus(theirs), 404);
});

test("the tenant check runs before anything can override it", () => {
  const godlike = who("owner", {
    grants: ["read:recording", "listen:recording"],
  });
  assert.equal(
    authorize(godlike, "listen", thing({ kind: "recording", tenantId: "other" })).kind,
    "not_found",
  );
});

test("a forbidden inside the tenant is a 403, and says so", () => {
  const d = authorize(who("agent"), "listen", thing({ kind: "recording" }));
  assert.equal(d.kind, "forbidden");
  assert.equal(httpStatus(d), 403);
});

// ---------------------------------------------------------------------------
// The two deliberate separations
// ---------------------------------------------------------------------------

test("the analyst sees numbers, not people", () => {
  const analyst = who("analyst");
  assert.equal(authorize(analyst, "read", thing({ kind: "report" })).kind, "allow");
  assert.equal(
    authorize(analyst, "listen", thing({ kind: "recording" })).kind,
    "forbidden",
  );
  assert.equal(
    authorize(analyst, "read", thing({ kind: "contact" })).kind,
    "forbidden",
  );
});

test("a grant cannot open the analyst separation", () => {
  // A boundary that holds only while nobody adds a grant is not a boundary.
  const analyst = who("analyst", { grants: ["listen:recording", "read:contact"] });
  assert.equal(
    authorize(analyst, "listen", thing({ kind: "recording" })).kind,
    "forbidden",
  );
  assert.equal(
    authorize(analyst, "read", thing({ kind: "contact" })).kind,
    "forbidden",
  );
});

test("the admin configures and does not listen", () => {
  // An IT administrator who can hear every sales call by default is a
  // problem, not a feature.
  const admin = who("admin");
  assert.equal(
    authorize(admin, "configure", thing({ kind: "tenant_settings" })).kind,
    "allow",
  );
  assert.equal(
    authorize(admin, "listen", thing({ kind: "recording" })).kind,
    "forbidden",
  );
});

test("listening is reachable only as an explicit grant, and it is audited", () => {
  const admin = who("admin", { grants: ["listen:recording"] });
  const d = authorize(admin, "listen", thing({ kind: "recording" }));
  assert.equal(d.kind, "allow");
  assert.equal(d.kind === "allow" && d.mustAudit, true);
});

// ---------------------------------------------------------------------------
// Scope
// ---------------------------------------------------------------------------

test("an agent sees only their own records", () => {
  const agent = who("agent");
  assert.equal(
    authorize(agent, "read", thing({ ownerUserId: "u-agent" })).kind,
    "allow",
  );
  assert.equal(
    authorize(agent, "read", thing({ ownerUserId: "u-someone-else" })).kind,
    "forbidden",
  );
});

test("a supervisor is confined to their own teams", () => {
  const sup = who("supervisor", { teamIds: ["team-1"] });
  assert.equal(
    authorize(sup, "read", thing({ teamId: "team-1" })).kind,
    "allow",
  );
  assert.equal(
    authorize(sup, "read", thing({ teamId: "team-2" })).kind,
    "forbidden",
  );
});

test("an empty team scope is tenant-wide, not empty", () => {
  const sup = who("supervisor", { teamIds: [] });
  assert.equal(authorize(sup, "read", thing({ teamId: "any" })).kind, "allow");
});

test("an explicit denial beats every grant, including the owner's", () => {
  // The only way "revoke this person now" is something an admin can actually
  // do during an incident.
  const owner = who("owner", { denials: ["listen:recording"] });
  assert.equal(
    authorize(owner, "listen", thing({ kind: "recording" })).kind,
    "forbidden",
  );
});

// ---------------------------------------------------------------------------
// The audit obligation
// ---------------------------------------------------------------------------

test("a sensitive action writes its audit entry before it runs", () => {
  const audit = new Recorder();
  const order: string[] = [];
  const sink: AuditSink = {
    record(e) {
      order.push("audit");
      audit.record(e);
    },
  };
  guard(who("supervisor"), "listen", thing({ kind: "recording" }), sink, () => {
    order.push("action");
  });
  assert.deepEqual(order, ["audit", "action"]);
  assert.equal(audit.entries.length, 1);
  assert.equal(audit.entries[0]!.resourceId, "c-1");
});

test("if the audit cannot be recorded, the action does not happen", () => {
  // An unlogged recording playback is indistinguishable, afterwards, from an
  // unauthorised one. "We think it was fine" is not an answer to a customer
  // asking who listened to their call.
  let ran = false;
  assert.throws(
    () =>
      guard(who("supervisor"), "listen", thing({ kind: "recording" }),
            new BrokenSink(), () => {
        ran = true;
      }),
    AuditFailure,
  );
  assert.equal(ran, false);
});

test("an ordinary read is not audited, so the log stays readable", () => {
  const audit = new Recorder();
  guard(who("agent"), "read", thing({ ownerUserId: "u-agent" }), audit, () => 1);
  assert.equal(audit.entries.length, 0);
});

test("every sensitive action in the spec carries the obligation", () => {
  for (const perm of AUDITED) {
    const [action, kind] = perm.split(":") as [never, never];
    const p = who("owner");
    const d = authorize(p, action, thing({ kind }));
    assert.equal(d.kind, "allow", perm);
    assert.equal(d.kind === "allow" && d.mustAudit, true, perm);
  }
});

test("a refused decision cannot be performed at all", () => {
  const audit = new Recorder();
  assert.throws(
    () => guard(who("agent"), "listen", thing({ kind: "recording" }), audit, () => 1),
    NotAuthorized,
  );
  assert.equal(audit.entries.length, 0);
});

test("the audit entry identifies who, what and when", () => {
  const audit = new Recorder();
  const at = new Date("2026-08-07T12:00:00Z");
  perform(
    authorize(who("analyst"), "export", thing({ kind: "export" })),
    {
      principal: who("analyst"),
      action: "export",
      resource: thing({ kind: "export" }),
      audit,
      now: () => at,
    },
    () => 1,
  );
  const e = audit.entries[0]!;
  assert.equal(e.userId, "u-agent");
  assert.equal(e.tenantId, "acme");
  assert.equal(e.action, "export");
  assert.equal(e.at, at);
});

// ---------------------------------------------------------------------------
// The matrix itself
// ---------------------------------------------------------------------------

test("the matrix covers every resource kind the type system knows about", () => {
  // If this drifts, the isolation suite has stopped being exhaustive and is
  // quietly passing on a subset.
  assert.equal(ISOLATION_MATRIX.KINDS.length, 13);
  assert.equal(ISOLATION_MATRIX.ACTIONS.length, 8);
  assert.equal(ISOLATION_MATRIX.ROLES.length, 6);
});
