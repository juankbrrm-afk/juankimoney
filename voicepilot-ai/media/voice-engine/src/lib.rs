//! # VoicePilot AI — Voice Engine
//!
//! Fase 0, módulo 0.1: the instrumented latency bench and the frame scheduler.
//!
//! This is the first code of the project, and it is deliberately not the CRM,
//! the dashboard, or the copilot. Per `docs/10-roadmap.md`, Fase 0 answers one
//! question before anything else gets built:
//!
//! > Can we convert voice in real time with sales-grade quality and invisible
//! > latency?
//!
//! There is no GPU here and no model weights. What this crate provides is the
//! apparatus that will *measure* the model the moment it exists — plus the one
//! piece of the media plane that can be finished and proven correct today:
//!
//! **The output scheduler, and its invariant: one frame of audio leaves for the
//! customer every 20 ms, always, even with the entire intelligence plane down.**
//!
//! That invariant is not aspirational. `tests/invariant.rs` kills the model
//! mid-call, stalls it past every threshold, drops 100% of its output, and
//! asserts that the emitted cadence is still exactly 20 ms with contiguous
//! sequence numbers.
//!
//! ## Design rules, enforced by tests rather than by convention
//!
//! - **No allocation in the audio loop.** Buffers are pooled and recycled on
//!   `Drop`; `FramePool::allocated()` must not grow after warm-up.
//! - **No blocking, ever.** Stages are time-driven queues: push in, poll out.
//!   The caller owns the clock.
//! - **Backpressure drops, never queues.** Past `max_depth`, frames are
//!   discarded and the pipeline degrades to a known bound.
//! - **Latency is measured, not summed.** `capture_ts_ns` travels with every
//!   frame from microphone to egress.
//! - **Time is injected.** A ten-minute call is reproducible in milliseconds
//!   and identical on every machine.
//!
//! ## Layout
//!
//! | Module | Role |
//! |---|---|
//! | [`frame`] | Frames and the recycling pool |
//! | [`clock`] | Injected time: monotonic in production, virtual in tests |
//! | [`metrics`] | Histograms and sliding windows |
//! | [`stage`] | The stage contract and backpressure rules |
//! | [`stages`] | Network, jitter buffer, conditioning, model |
//! | [`health`] | processing / degraded / bypass state machine |
//! | [`remote`] | Remote inference: transport, reconnection, warm session pool |
//! | [`scheduler`] | The invariant lives here |
//! | [`engine`] | Everything wired together |
//! | [`sim`] | Synthetic call driver |
//! | [`profile`] | Named scenarios with their latency budgets |

pub mod clock;
pub mod engine;
pub mod frame;
pub mod health;
pub mod metrics;
pub mod profile;
pub mod remote;
pub mod rng;
pub mod scheduler;
pub mod sim;
pub mod stage;
pub mod stages;

pub use clock::{Clock, MonotonicClock, TestClock};
pub use engine::{verify_cadence, EmittedRecord, EngineConfig, Report, VoiceEngine};
pub use frame::{Frame, FramePool, Speaker, FRAME_MS, FRAME_NS, FRAME_SAMPLES, SAMPLE_RATE_HZ};
pub use health::{Health, HealthMonitor, HealthParams};
pub use profile::{Budget, Profile};
pub use remote::{
    LinkState, MockParams, MockTransport, RemoteModelParams, RemoteModelStage, SessionPool,
    Transport, TransportEvent,
};
pub use scheduler::{Emitted, OutputScheduler, Source};
pub use sim::{run_call, run_clean_call, SimulationResult};
