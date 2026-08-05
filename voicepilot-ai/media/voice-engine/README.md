# voice-engine

**Fase 0, módulo 0.1 — completo.**

The instrumented latency bench and the output scheduler. The first code of the
project, and deliberately not the CRM, the dashboard, or the copilot.

```bash
cargo test                                    # 50 tests
cargo run --release --bin latency-bench       # the budget, measured
cargo run --release --bin latency-bench -- --sweep
```

Zero dependencies. Builds and tests offline.

---

## What this is

Per `docs/10-roadmap.md`, Fase 0 answers one question before anything else is
built: *can we convert voice in real time with sales-grade quality and
invisible latency?*

There is no GPU here and no model weights. What there is:

1. **The apparatus that will measure the model the moment it exists.** When the
   conversion model lands it replaces `ModelStage` and the budget tests
   immediately say whether it fits. Building the harness after the model means
   a week of wiring before the first honest number.
2. **The one piece of the Media Plane that can be finished and proven correct
   today** — the output scheduler and its invariant.

### The exit criterion, met

> *"Banco de latencia instrumentado — medición punto a punto con precisión
> ±5 ms."*

Proven three independent ways in `tests/accuracy.rs`: against an analytically
derived ground truth, differentially (unit gain when a known latency is added,
which catches constant-offset bugs an absolute check would hide), and by
histogram quantisation (0.5 ms worst case, an order of magnitude inside the
requirement).

---

## The invariant

> **One frame of audio leaves for the customer every 20 ms. Always.
> Even if the entire intelligence plane is down.**

`tests/invariant.rs` does not test that the pipeline works. It tests that the
pipeline **cannot stop producing audio**, by taking the model away in every way
we could think of:

| Test | What it does |
|---|---|
| `cadence_holds_when_the_gpu_dies_mid_call` | Model fails permanently at the 10 s mark |
| `cadence_holds_when_the_model_never_produces_anything` | Dead from frame zero |
| `cadence_holds_when_the_model_stalls_past_every_threshold` | 900 ms stall on every frame |
| `cadence_holds_under_severe_packet_loss` | 20% loss |
| `cadence_holds_when_nothing_arrives_at_all` | 100% loss |
| `cadence_holds_under_backpressure` | Model 10× slower than real time |
| `cadence_holds_through_repeated_failure_and_recovery` | Kill/revive five times |
| `the_audio_loop_never_allocates` | Pool must not grow after warm-up |
| `a_ten_minute_call_stays_exact` | 30,000 frames, zero drift |

In every case the assertion is identical: exact 20 ms cadence, contiguous
sequence numbers, zero gaps.

---

## Measured results

`cargo run --release --bin latency-bench -- --seconds 120`

| Profile | Mouth-to-ear p50 | Converted audio delivered | Verdict |
|---|---|---|---|
| Mode A, wired agent, regional edge | **292.5 ms** | 99.9% | ✓ under the 300 ms promise |
| Mode A, shared WiFi, busy floor | 292.5 ms | 99.2% | ✓ |
| Mode A, **routed to the wrong region** | 392.5 ms | 98.3% | ⓘ +100 ms — one config mistake costs more than the whole GPU stage |
| Mode B, translation | 1025.5 ms | 97.5% | ✓ against the corrected budget |
| Mode A, silence skipping disabled | 292.5 ms | 99.9% | ⓘ prices unit-economics lever #4 at ~20% of GPU |

---

## What the bench found

Four defects, three of them in the specification rather than the code. This is
the return on building the harness first.

### 1. The backpressure rule was mis-specified — 46% of a healthy call discarded

`docs/02` said *"drop when the consumer is more than 3 chunks behind"*, which
was implemented as an absolute queue depth of 3. But a streaming model with
80 ms of lookahead holds ~6 frames **by construction** — that is the algorithm
working, not congestion. The threshold discarded 46% of a perfectly healthy
call.

Worse, the rule was also read in the wrong unit: "3 chunks" means three
*inference* chunks. For Mode B, whose chunk is 8 frames, counting slack in
frames gave it 60 ms of headroom against a stage whose own variance is larger
than that, and threw away 33% of a healthy translated call.

Fix: `max_depth = inherent_pipeline_depth + slack_chunks × chunk_frames`.

### 2. The health monitor could never recover from bypass

Health was fed by successfully *emitted* processed frames. But in bypass the
scheduler stops emitting them — so no successes were ever recorded, so the
pipeline could never be observed to recover. It latched into bypass for the
rest of the call no matter how healthy it got.

Fix: judge health on **arrival** at the scheduler, independent of what the
scheduler chooses to emit.

### 3. Three GPU stalls cost 21 seconds of bypass

A frame that misses its deadline was treated as a hard failure, and five
consecutive hard failures force bypass with a 5 second recovery hold. Three
transient 250 ms stalls in a 60 second Mode B call — 750 ms of real degradation
— turned into **21 seconds** of the customer hearing raw agent audio.

The over-reaction is the bug: the scheduler already handles a late frame
gracefully by emitting bypass for that one frame. Lateness is now a *rate*
signal (a handful is noise, a sustained share is a broken pipeline); only hard
failures trip the burst rule. Bypass time across all profiles went to zero.

### 4. The Mode B budget was missing a line

`docs/02` estimated ~930 ms. Measured: 1025 ms. The budget table had no entry
for the playout margin, which a fixed-playout scheduler cannot do without. The
document was corrected rather than the number massaged.

---

## The structural insight

**Mouth-to-ear latency in a fixed-playout scheduler is constant by
construction.** It is the playout offset plus fixed ingress and egress terms —
which is why every p50 above equals its p95 exactly.

Pipeline variance does not appear as latency jitter. It appears as frames that
miss their deadline and fall back to bypass.

That makes the playout offset the single latency knob in the system, and
choosing it a real trade rather than a guess: too small and converted audio
stops arriving in time, too large and budget is given away for nothing.
`--sweep` prices it:

```
   offset     mouth-to-ear    processed   verdict
    120 ms        235.5 ms      95.51%    ✗ too tight
    140 ms        255.5 ms      99.10%    ✓
    160 ms        275.5 ms      99.40%    ✓
    180 ms        295.5 ms      99.70%    ✓
```

The floor is 140 ms — but at 99.1%, with no headroom for a bad minute on the
network. The shipped default costs ~25 ms more and delivers 99.9%. The
difference between 255 ms and 280 ms is inaudible; the difference between 99.1%
and 99.9% converted audio is not.

---

## Design rules, enforced by tests rather than convention

| Rule | Enforced by |
|---|---|
| No allocation in the audio loop | `the_audio_loop_never_allocates` — pool must not grow after warm-up |
| No blocking, ever | Stages are time-driven queues; the caller owns the clock |
| Backpressure drops, never queues | `cadence_holds_under_backpressure` bounds latency growth |
| Latency is measured, not summed | `capture_ts_ns` travels with every frame, out and back |
| Time is injected | `TestClock` — a 10-minute call runs in milliseconds, identically everywhere |
| Determinism | `repeated_runs_are_bit_identical` — a flaky latency test trains the team to re-run CI until it passes |

---

## Layout

| Module | Role |
|---|---|
| `frame` | Frames and the recycling pool |
| `clock` | Injected time: monotonic in production, virtual in tests |
| `metrics` | Histograms and sliding windows |
| `stage` | The stage contract and backpressure rules |
| `stages/` | `network`, `jitter`, `vad` (conditioning), `model` |
| `health` | processing / degraded / bypass state machine |
| `scheduler` | **The invariant lives here** |
| `engine` | Everything wired together |
| `sim` | Synthetic call driver |
| `profile` | Named scenarios with their latency budgets |

## What replaces the model stage

`ModelStage` models a real streaming model's timing: chunked inference, a
serial worker (so an oversubscribed model shows up as unbounded latency rather
than vanishing), variance, stalls, and injectable hard failures. Swapping it
for a gRPC client to `ai-services` changes that one file. Everything else —
scheduler, health, bench, budget tests — works unchanged and starts reporting
on real inference the same day.
