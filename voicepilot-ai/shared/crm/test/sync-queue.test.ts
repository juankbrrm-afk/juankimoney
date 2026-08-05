import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_RETRY,
  SyncQueue,
  backoffMs,
  classifyFailure,
  idempotencyKey,
  type Clock,
  type Random,
} from "../src/sync-queue.ts";

class FakeClock implements Clock {
  private t: number;

  constructor(t = 0) {
    this.t = t;
  }
  now() {
    return this.t;
  }
  advance(ms: number) {
    this.t += ms;
  }
}

/** Deterministic: a flaky retry test trains the team to re-run CI until green. */
class FixedRandom implements Random {
  private readonly value: number;

  constructor(value = 0.5) {
    this.value = value;
  }
  next() {
    return this.value;
  }
}

function queue() {
  const clock = new FakeClock();
  const q = new SyncQueue(clock, new FixedRandom(0.5));
  return { clock, q };
}

const base = {
  tenantId: "t1",
  connectionId: "conn_1",
  entity: "note" as const,
  operation: "create" as const,
  internalId: "call_123",
  payload: { body: "Customer asked for a callback" },
};

test("the idempotency key ignores time and payload", () => {
  // A retry that carries a slightly different payload must produce the same
  // key, or "retry" silently means "create another one".
  const a = idempotencyKey("conn_1", "note", "create", "call_123");
  const b = idempotencyKey("conn_1", "note", "create", "call_123");
  assert.equal(a, b);
});

test("different connections produce different keys", () => {
  // A sandbox and a production connection to the same provider must never
  // collide — that is how a test run overwrites production ids.
  assert.notEqual(
    idempotencyKey("conn_sandbox", "note", "create", "call_123"),
    idempotencyKey("conn_prod", "note", "create", "call_123"),
  );
});

test("enqueueing the same write twice does not create two operations", () => {
  const { q } = queue();
  const first = q.enqueue(base);
  const second = q.enqueue({ ...base, payload: { body: "slightly edited" } });

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.operation.id, first.operation.id);
  assert.equal(q.stats().pending, 1);
});

test("a discriminator separates writes that are genuinely different", () => {
  const { q } = queue();
  q.enqueue({ ...base, discriminator: "summary" });
  const second = q.enqueue({ ...base, discriminator: "next_steps" });
  assert.equal(second.created, true);
  assert.equal(q.stats().pending, 2);
});

test("a permanent failure is buried immediately rather than retried for hours", () => {
  const { q } = queue();
  const { operation } = q.enqueue(base);
  q.claim(10);

  // 400 means the provider understood us and refused. It will refuse again.
  const result = q.fail(operation.id, "Invalid field: Foo__c", 400);

  assert.equal(result.willRetry, false);
  assert.equal(q.get(operation.id)?.status, "dead");
  assert.equal(q.stats().dead, 1);
});

test("a transient failure is retried with growing backoff", () => {
  const { clock, q } = queue();
  const { operation } = q.enqueue(base);

  let lastDelay = 0;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const claimed = q.claim(10);
    assert.equal(claimed.length, 1, `attempt ${attempt} should be claimable`);

    const before = clock.now();
    const result = q.fail(operation.id, "503 Service Unavailable", 503);
    assert.equal(result.willRetry, true);

    const delay = q.get(operation.id)!.nextAttemptAt - before;
    assert.ok(delay > lastDelay, `backoff must grow: ${delay} <= ${lastDelay}`);
    lastDelay = delay;
    clock.advance(delay);
  }
});

test("retries stop at the ceiling and the operation goes to the DLQ", () => {
  const { clock, q } = queue();
  const { operation } = q.enqueue(base);

  for (let i = 0; i < DEFAULT_RETRY.maxAttempts; i++) {
    q.claim(10);
    q.fail(operation.id, "timeout");
    clock.advance(DEFAULT_RETRY.maxBackoffMs);
  }

  assert.equal(q.get(operation.id)?.status, "dead");
  // And it is visible, not swallowed — the customer's UI shows this queue.
  assert.equal(q.deadLetters().length, 1);
});

test("rate limiting backs off harder than an ordinary error", () => {
  const { clock, q } = queue();
  const a = q.enqueue(base).operation;
  const b = q.enqueue({ ...base, internalId: "call_456" }).operation;

  q.claim(10);
  const t = clock.now();
  q.fail(a.id, "500", 500);
  q.fail(b.id, "429 Too Many Requests", 429);

  const ordinary = q.get(a.id)!.nextAttemptAt - t;
  const throttled = q.get(b.id)!.nextAttemptAt - t;
  assert.ok(
    throttled > ordinary,
    `a throttle is a request to slow down, not a transient error: ${throttled} <= ${ordinary}`,
  );
});

test("network-level failures with no status are treated as retryable", () => {
  // No response at all is the one case where we genuinely do not know, and
  // losing the customer's data is worse than one wasted retry.
  assert.equal(classifyFailure(undefined), "retryable");
  assert.equal(classifyFailure(503), "retryable");
  assert.equal(classifyFailure(409), "retryable");
  assert.equal(classifyFailure(429), "rate_limited");
  assert.equal(classifyFailure(400), "permanent");
  assert.equal(classifyFailure(403), "permanent");
});

test("jitter spreads retries instead of synchronising them", () => {
  // Without it, an outage that fails a thousand operations retries all thousand
  // at the same instant, forever, against a system that is already unwell.
  const spread = new Set<number>();
  for (const r of [0, 0.25, 0.5, 0.75, 1]) {
    spread.add(backoffMs(4, DEFAULT_RETRY, new FixedRandom(r)));
  }
  assert.ok(spread.size >= 4, `expected spread, got ${[...spread].join(",")}`);
});

test("backoff is capped so a retry is never scheduled for next week", () => {
  const delay = backoffMs(40, DEFAULT_RETRY, new FixedRandom(1));
  assert.ok(delay <= DEFAULT_RETRY.maxBackoffMs * (1 + DEFAULT_RETRY.jitterRatio));
});

test("claim only returns operations that are actually due", () => {
  const { clock, q } = queue();
  const { operation } = q.enqueue(base);
  q.claim(10);
  q.fail(operation.id, "503", 503);

  assert.equal(q.claim(10).length, 0, "not due yet");
  clock.advance(q.get(operation.id)!.nextAttemptAt - clock.now());
  assert.equal(q.claim(10).length, 1, "due now");
});

test("reviving a dead operation keeps its idempotency key", () => {
  const { q } = queue();
  const { operation } = q.enqueue(base);
  const key = operation.idempotencyKey;

  q.claim(10);
  q.fail(operation.id, "Invalid field", 400);
  assert.equal(q.get(operation.id)?.status, "dead");

  assert.equal(q.revive(operation.id), true);
  const revived = q.get(operation.id)!;
  assert.equal(revived.status, "pending");
  assert.equal(revived.attempts, 0);
  // If a partial write did land before the failure, the provider deduplicates
  // on this key and we do not create a second record.
  assert.equal(revived.idempotencyKey, key);
});

test("success is terminal and records the external id", () => {
  const { q } = queue();
  const { operation } = q.enqueue(base);
  q.claim(10);
  q.succeed(operation.id, "00Q5g00000ABCDE");

  const done = q.get(operation.id)!;
  assert.equal(done.status, "succeeded");
  assert.equal(done.externalId, "00Q5g00000ABCDE");
  assert.equal(q.claim(10).length, 0);
});

test("operations are claimed oldest first", () => {
  const { clock, q } = queue();
  const first = q.enqueue(base).operation;
  clock.advance(1000);
  const second = q.enqueue({ ...base, internalId: "call_456" }).operation;

  const claimed = q.claim(10);
  assert.equal(claimed[0]?.id, first.id);
  assert.equal(claimed[1]?.id, second.id);
});
