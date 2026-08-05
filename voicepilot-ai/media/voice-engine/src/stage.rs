//! The pipeline stage contract.
//!
//! Every stage is a time-driven queue: you `push` frames in and `poll` frames
//! out as time advances. No stage ever blocks, sleeps, or waits — the caller
//! owns the clock, and a stage that is not ready simply returns `None`.
//!
//! That shape is what makes the backpressure rule from `docs/02` enforceable:
//!
//! > If the consumer falls more than 3 chunks behind, drop and bypass.
//! > Do not queue. A growing buffer in a real-time system is a time bomb.
//!
//! A stage declares `max_depth`; past it, `push` returns `Dropped` and the
//! frame is recycled immediately. Latency degrades to a known bound instead of
//! growing without limit until the call is unusable.

use crate::frame::Frame;
use crate::metrics::StageStats;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum DropReason {
    /// The stage was already at max depth. The consumer is too slow.
    Backpressure,
    /// Injected or real processing failure.
    Failure,
    /// Arrived after its playout deadline — useless by definition.
    Late,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum PushResult {
    Accepted,
    Dropped(DropReason),
}

impl PushResult {
    pub fn is_accepted(&self) -> bool {
        matches!(self, PushResult::Accepted)
    }
}

pub trait Stage {
    fn name(&self) -> &'static str;

    /// Hands a frame to the stage at time `now_ns`. Never blocks.
    fn push(&mut self, frame: Frame, now_ns: u64) -> PushResult;

    /// Returns a frame if one is ready at `now_ns`. Never blocks.
    fn poll(&mut self, now_ns: u64) -> Option<Frame>;

    /// Frames currently held.
    fn depth(&self) -> usize;

    fn stats(&self) -> &StageStats;

    /// Drops everything held. Used when a call ends or on hard reset.
    fn reset(&mut self);
}

/// Records residence time on the way out of a stage, so per-stage latency is
/// measured from real frame timestamps rather than inferred from stage config.
#[inline]
pub fn record_exit(stats: &mut StageStats, pushed_at_ns: u64, now_ns: u64) {
    stats.emitted += 1;
    stats.residence.record(now_ns.saturating_sub(pushed_at_ns));
}

#[inline]
pub fn record_drop(stats: &mut StageStats, reason: DropReason) -> PushResult {
    match reason {
        DropReason::Backpressure => stats.dropped_backpressure += 1,
        DropReason::Failure => stats.dropped_failure += 1,
        DropReason::Late => stats.dropped_late += 1,
    }
    PushResult::Dropped(reason)
}
