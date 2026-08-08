# @voicepilot/authz

Scoped RBAC, tenant isolation, and the audit obligation. Zero dependencies.

```bash
npm test          # 19 tests, node:test, no install required
npm run typecheck # tsc --noEmit, strict
```

This is Fase 1 module 1.1, and it is first for a reason that is not
negotiable: **tenancy cannot be retrofitted.** Every table, every query and
every endpoint written before this exists is one that has to be revisited
after it, and the revisiting is where the gap gets left.

---

## Three decisions that are structural, not procedural

Each one exists because the alternative depends on a developer remembering
something under deadline.

**`tenantId` can only come from the signed token.** Not a header, not a query
parameter, not a field in the body. `Principal` is built from verified token
claims and there is no other constructor — so there is no shape of this API
in which a caller supplies the tenant they would like to be. That closes the
whole class of bug where an endpoint trusts `?tenant_id=` because it was
convenient at the time.

**A cross-tenant miss is a 404, never a 403.** A 403 confirms the resource
exists. With sequential or guessable ids, that turns an authorization check
into an enumeration oracle: probe ids, collect the 403s, and you now know how
many calls a competitor's tenant made last month without ever being allowed
to read one. `httpStatus()` lives here rather than at each call site, because
the day somebody writes `res.status(403)` for a cross-tenant miss is the day
the oracle opens, and it will look like a reasonable line of code.

**A sensitive action cannot happen without its audit entry.** Eight actions
must be logged without exception — playing a recording, joining a live call,
exporting, touching integration credentials. In most systems that is two
lines of code, and the second one is the one that gets forgotten, refactored
away, or skipped on the error path. So they are welded together: `perform()`
writes the entry **first**, and if the write fails the action does not run.
**If we cannot record it, we do not do it.** Losing the feature while the
audit store is down is the correct trade — an unlogged recording playback is
indistinguishable, afterwards, from an unauthorised one, and "we think it was
fine" is not an answer to a customer asking who listened to their call.

## The isolation suite is generated, not written

`docs/09` §4 asks for a CI suite that tries every endpoint across two tenants
and fails the build on any leak — and adds: *it regenerates itself when
endpoints are added; we do not rely on somebody remembering to write it.*

That sentence is the whole idea. A hand-written isolation suite is complete
on the day it is written and decays from then on: someone adds an endpoint,
does not add the test, and the gap is invisible because the suite is still
green. The nineteenth endpoint is the one that leaks.

So the matrix is derived from the type union: **6 roles × 13 resource kinds ×
8 actions = 624 attempts**, every one of them made by a principal holding
every grant and no denials. Adding a resource kind adds 48 rows whether
anyone remembers or not, and a new kind with no isolation is a red build on
the commit that introduced it rather than a finding in next year's
penetration test.

Note that a `forbidden` counts as a leak here, not just an `allow`. The
boundary has to answer *identically* whether or not the thing exists.

## The two separations worth not undoing

From `docs/09` §3:

| Separation | Why |
|---|---|
| **The analyst sees numbers, not people** | Whoever builds reports does not need to hear calls or see phone numbers. The cheapest possible reduction of leak surface — and it is enforced ahead of grants, because a boundary that holds only while nobody adds a grant is not a boundary |
| **The admin configures, does not listen** | An IT administrator who can hear every sales call by default is a problem, not a feature. `listen:recording` arrives only as an explicit grant, and the grant is itself audited |

An explicit denial beats every grant, **including the owner's**. That is the
only way "revoke this person now" is something an admin can actually do
during an incident.

## What the tests protect

| Test | What it prevents |
|---|---|
| `the isolation matrix is generated, and every row is a 404` | The nineteenth endpoint being the one nobody wrote a test for |
| `a cross-tenant miss is indistinguishable from a nonexistent resource` | An enumeration oracle built out of 403s |
| `the tenant check runs before anything can override it` | A grant, a role or an owner flag reaching across tenants |
| `a grant cannot open the analyst separation` | A boundary that survives only until someone adds a permission |
| `if the audit cannot be recorded, the action does not happen` | A recording played with no record of who played it |
| `a sensitive action writes its audit entry before it runs` | An audit written after a crash, which is to say never |
| `an explicit denial beats every grant, including the owner's` | Being unable to revoke access during an incident |
| `an agent sees only their own records` | The agent role being wider in practice than on the org chart |
| `an ordinary read is not audited` | A log so noisy nobody reads it, which is the same as no log |

## Boundaries

- **This is layer 2 of the four in `docs/09` §4.** Layer 1 is the signed
  token, layer 3 is Postgres row-level security, layer 4 is per-tenant
  storage keys. Each is independent on purpose: this module being wrong
  should still mean Postgres returns zero rows.
- **No token verification here.** `Principal` is what a verified token
  becomes; verifying signatures is the auth layer's job and needs crypto this
  package deliberately does not carry.
- **No persistence.** `AuditSink` is an interface, so the durability
  guarantee — the one that makes "audit first" meaningful — belongs to
  whatever implements it.
