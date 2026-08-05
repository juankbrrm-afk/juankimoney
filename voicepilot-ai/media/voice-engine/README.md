# voice-engine

**Fase 0, módulo 0.1 — completo. Módulo 0.2a — completo.**

The instrumented latency bench, the output scheduler, and the remote-inference
seam. The first code of the project, and deliberately not the CRM, the
dashboard, or the copilot.

```bash
cargo test                                    # 71 tests
cargo run --release --bin latency-bench       # the budget, measured
cargo run --release --bin latency-bench -- --sweep
cargo run --release --example remote-report   # what remote inference costs
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

## Módulo 0.2a — remote inference

The model does not live in this process. It sits behind
[`shared/proto/voice.proto`](../../shared/proto/voice.proto) on a GPU in
another rack, and that is not a transport detail: it introduces failure modes
an in-process stage cannot have.

| In-process | Remote |
|---|---|
| A call either returns or panics | A request can vanish with no reply, ever |
| Responses arrive in order | Responses arrive out of order, or twice |
| Available immediately | Costs 300–900 ms to warm up |
| Fails visibly | **Fails by going quiet** |

That last row is the dangerous one: a dead link and a slow model look identical
from the client, and the difference decides whether to wait or to bypass. So
liveness is never inferred from silence — every in-flight frame carries a
deadline, the protocol requires an explicit `Dropped` instead of silence, and a
link that misses its deadlines is declared dead and reconnected.

`cargo run --release --example remote-report`:

| Scenario | e2e p50 | Converted | Cadence | |
|---|---|---|---|---|
| Local model (module 0.1) | 292.5 ms | 99.53% | OK | baseline |
| **Remote, colocated, warm** | **292.5 ms** | **99.73%** | OK | the deployment we require |
| Remote, colocated, **cold** | 292.5 ms | **75.57%** | OK | no pre-warm |
| Remote, **cross-region** | — | **0.00%** | OK | 70 ms hop |
| Cross-region, offset resized | 445.5 ms | 99.73% | OK | delivery back, promise broken |
| Link dies at 12 s | 292.5 ms | 39.21% | OK | GPU node rescheduled |
| Link goes silent | — | 0.00% | OK | socket open, server gone |
| 15% response loss | 292.5 ms | 84.22% | OK | lossy link |

**Cadence is OK in every row, including the ones delivering 0% converted
audio.** That is the invariant doing its job: the call never breaks, it
degrades to the agent's real voice.

### Two findings worth more than the transport work itself

**A cold session costs 7.3 seconds of the greeting.** Without pre-warming,
363 frames go out unconverted while the model loads — at the exact start of the
call, which is the only part that decides whether the customer stays on the
line. `docs/05` argued for a pre-warmed session pool on principle; this is the
number. Warm sessions deliver 99.73%, cold ones 75.57%, and the missing quarter
is all at the front.

**A GPU in another region delivers nothing at all.** Not "somewhat worse" —
0.00% converted. A 70 ms one-way hop pushes every single frame past a playout
offset that was sized for the model alone, so the customer hears the agent's
raw voice for the entire call while every dashboard reports a healthy link.

Resizing the offset to 330 ms restores delivery to 99.73% — and lands
mouth-to-ear at **445 ms**, well past the 300 ms the product promises. So there
is no configuration that makes a remote-region GPU acceptable: the choice is
colocation or a different promise. `docs/01` treats regional placement as a
functional requirement; this is why, with a number attached.

Both halves are asserted in `tests/remote.rs` — the failure *and* the
remediation, so neither can quietly stop being true.

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
| `remote` | Transport contract, reconnection, warm session pool |
| `sim` | Synthetic call driver |
| `profile` | Named scenarios with their latency budgets |

## What is left before real audio flows

`RemoteModelStage` speaks the contract and handles every network failure mode
above. What it talks to is `MockTransport`, because the real transport needs
`tonic` (gRPC) and the real media path needs LiveKit — neither of which can be
fetched in this environment.

Two pieces remain, and both are now mechanical:

| Piece | Work |
|---|---|
| `TonicTransport` | Implement `Transport` over the generated gRPC client. ~200 lines; every failure path it must handle is already specified and already tested against the mock. |
| LiveKit SFU + SIP bridge | Module 0.2b. Blocked on network access, not on design. |

Everything downstream — scheduler, health monitor, bench, budget tests — is
unaware of which transport is installed, and stays unchanged when the real one
arrives.
