# media/

**The Media Plane.** Rust. The only place in VoicePilot where a business
decision touches a frame of audio.

## Why this is its own top-level surface

The original folder plan had six surfaces and no home for this. That was a
mistake in the specification, not a detail: the Media Plane is a different
language, a different failure model, a different deployment topology and a
different SLA from everything else. Filing it under `ai-services/` (Python)
or `backend/` (TypeScript) would have buried the one component that cannot
tolerate a garbage-collection pause.

| | Media Plane | Intelligence Plane | Control Plane |
|---|---|---|---|
| Language | **Rust** | Python | TypeScript |
| Latency | < 300 ms mouth-to-ear | 100–900 ms | 50–500 ms |
| Failure tolerance | **None** — a fault is a dead call | Degradable | Retryable |
| Scales by | Concurrent calls, GPU | AI streams | Requests |

## Contents

```
media/
└── voice-engine/     Frame scheduler, pipeline stages, latency bench,
                      remote-inference seam (transport, reconnection,
                      warm session pool)
```

Still to come:

```
media/
├── sip-gateway/      SIP trunk bridge (LiveKit SIP)   — blocked on network access
├── recorder/         Three-track recording to S3, off the hot path
└── transport-grpc/   TonicTransport: the real implementation of the
                      `Transport` trait the voice engine already consumes
```

## The rule this plane exists to enforce

> **One frame of audio leaves for the customer every 20 ms. Always.
> Even if the entire intelligence plane is down.**

Everything else in VoicePilot may fail — copilot, compliance, CRM writes,
the whole Control Plane. `docs/01-arquitectura.md` §8 lists what each failure
costs, and for all of them the answer in the "customer notices" column is
*no*. Audio is the single exception, and this plane is why.

## Status

`voice-engine` is **complete and tested** — módulo 0.1 (latency bench and
scheduler) and módulo 0.2a (remote-inference seam), 71 tests.

Módulo 0.2b (LiveKit SFU + SIP bridge) is **blocked on environment, not on
design**: it needs `tonic` and the LiveKit crates, and this environment has no
access to crates.io. The contract those components implement
(`shared/proto/voice.proto`) and the client that consumes it are done and
tested against a fault-injecting mock, so the remaining work is wiring rather
than design.
