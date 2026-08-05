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
└── voice-engine/     Frame scheduler, pipeline stages, latency bench
```

Still to come in Fase 0 / Fase 1:

```
media/
├── sip-gateway/      SIP trunk bridge (LiveKit SIP)
├── recorder/         Three-track recording to S3, off the hot path
└── engine-bridge/    gRPC client toward ai-services
```

## The rule this plane exists to enforce

> **One frame of audio leaves for the customer every 20 ms. Always.
> Even if the entire intelligence plane is down.**

Everything else in VoicePilot may fail — copilot, compliance, CRM writes,
the whole Control Plane. `docs/01-arquitectura.md` §8 lists what each failure
costs, and for all of them the answer in the "customer notices" column is
*no*. Audio is the single exception, and this plane is why.

## Status

`voice-engine` is **complete and tested** (Fase 0, módulo 0.1). The
remaining components start once the conversion model clears its
week-8 decision gate.
