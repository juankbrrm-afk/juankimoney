//! Time, injected rather than read.
//!
//! Every latency number this crate produces is a difference between two clock
//! readings. If the clock is `Instant::now()` buried inside the pipeline, the
//! tests are non-deterministic, slow, and impossible to run at 1000x speed.
//!
//! So time is a parameter. `TestClock` gives exact, virtual time — a 10-minute
//! call runs in milliseconds and produces byte-identical results on every
//! machine. `MonotonicClock` is what production uses.

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Instant;

pub trait Clock {
    fn now_ns(&self) -> u64;
}

/// Production clock. Monotonic — never goes backwards, unaffected by NTP steps
/// or the operator changing the system time mid-call.
pub struct MonotonicClock {
    start: Instant,
}

impl MonotonicClock {
    pub fn new() -> Self {
        MonotonicClock {
            start: Instant::now(),
        }
    }
}

impl Default for MonotonicClock {
    fn default() -> Self {
        Self::new()
    }
}

impl Clock for MonotonicClock {
    fn now_ns(&self) -> u64 {
        self.start.elapsed().as_nanos() as u64
    }
}

/// Virtual clock for deterministic tests and for the bench.
pub struct TestClock {
    now_ns: AtomicU64,
}

impl TestClock {
    pub fn new() -> Self {
        TestClock {
            now_ns: AtomicU64::new(0),
        }
    }

    pub fn starting_at(ns: u64) -> Self {
        TestClock {
            now_ns: AtomicU64::new(ns),
        }
    }

    pub fn advance_ns(&self, delta: u64) {
        self.now_ns.fetch_add(delta, Ordering::Relaxed);
    }

    pub fn advance_ms(&self, delta: u64) {
        self.advance_ns(delta * 1_000_000);
    }

    pub fn set_ns(&self, value: u64) {
        self.now_ns.store(value, Ordering::Relaxed);
    }
}

impl Default for TestClock {
    fn default() -> Self {
        Self::new()
    }
}

impl Clock for TestClock {
    fn now_ns(&self) -> u64 {
        self.now_ns.load(Ordering::Relaxed)
    }
}

pub const MS: u64 = 1_000_000;

pub fn ms(v: u64) -> u64 {
    v * MS
}

pub fn ns_to_ms_f(v: u64) -> f64 {
    v as f64 / 1_000_000.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_clock_is_exact() {
        let c = TestClock::new();
        assert_eq!(c.now_ns(), 0);
        c.advance_ms(20);
        assert_eq!(c.now_ns(), 20_000_000);
        c.advance_ns(1);
        assert_eq!(c.now_ns(), 20_000_001);
    }

    #[test]
    fn monotonic_clock_never_goes_backwards() {
        let c = MonotonicClock::new();
        let mut last = 0;
        for _ in 0..1000 {
            let now = c.now_ns();
            assert!(now >= last);
            last = now;
        }
    }
}
