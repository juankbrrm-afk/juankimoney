//! Pipeline stages, in the order a frame meets them:
//!
//! ```text
//! capture -> network -> jitter buffer -> conditioning -> model -> scheduler
//! ```
//!
//! Each is a time-driven queue implementing [`crate::stage::Stage`]: push in,
//! poll out, never block. The scheduler is not a stage — it owns the output
//! deadline and lives in its own module.

pub mod jitter;
pub mod model;
pub mod network;
pub mod vad;

pub use jitter::{JitterBuffer, JitterParams};
pub use model::{ModelParams, ModelStage};
pub use network::{NetworkParams, NetworkStage};
pub use vad::{VadGate, VadParams};
