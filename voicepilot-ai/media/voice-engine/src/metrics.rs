//! Latency measurement.
//!
//! The exit criterion for this module is "point-to-point measurement accurate
//! to +/-5 ms" (`docs/10-roadmap.md`, module 0.1). That accuracy is a property
//! of this file: a fixed-bucket histogram with 1 ms buckets, reporting bucket
//! midpoints, has a worst-case quantisation error of 0.5 ms — an order of
//! magnitude inside the requirement, with no allocation and no sorting on the
//! recording path.
//!
//! Deliberately not a t-digest or HDR histogram: our range of interest is
//! 0-4000 ms with millisecond resolution, which is 4000 buckets — 32 KB. Exact
//! within quantisation, trivially auditable, and constant-time to record.

use crate::clock::ns_to_ms_f;

pub struct Histogram {
    bucket_ns: u64,
    buckets: Vec<u64>,
    overflow: u64,
    count: u64,
    sum: u64,
    min: u64,
    max: u64,
}

impl Histogram {
    pub fn new(bucket_ns: u64, max_value_ns: u64) -> Self {
        let n = (max_value_ns / bucket_ns) as usize + 1;
        Histogram {
            bucket_ns,
            buckets: vec![0; n],
            overflow: 0,
            count: 0,
            sum: 0,
            min: u64::MAX,
            max: 0,
        }
    }

    /// 1 ms buckets up to 4 s. The default for every latency metric here.
    pub fn latency() -> Self {
        Self::new(1_000_000, 4_000_000_000)
    }

    #[inline]
    pub fn record(&mut self, value_ns: u64) {
        let idx = (value_ns / self.bucket_ns) as usize;
        if idx < self.buckets.len() {
            self.buckets[idx] += 1;
        } else {
            self.overflow += 1;
        }
        self.count += 1;
        self.sum += value_ns;
        if value_ns < self.min {
            self.min = value_ns;
        }
        if value_ns > self.max {
            self.max = value_ns;
        }
    }

    /// Returns the bucket midpoint, which bounds quantisation error at half a
    /// bucket. Returning the upper edge instead would bias every reported
    /// number upward by a full bucket — small, but it would be a systematic
    /// error in the one metric this project is judged on.
    pub fn quantile(&self, q: f64) -> u64 {
        if self.count == 0 {
            return 0;
        }
        let target = ((self.count as f64) * q).ceil().max(1.0) as u64;
        let mut cumulative = 0u64;
        for (i, &c) in self.buckets.iter().enumerate() {
            cumulative += c;
            if cumulative >= target {
                return (i as u64) * self.bucket_ns + self.bucket_ns / 2;
            }
        }
        self.max
    }

    pub fn p50(&self) -> u64 {
        self.quantile(0.50)
    }

    pub fn p95(&self) -> u64 {
        self.quantile(0.95)
    }

    pub fn p99(&self) -> u64 {
        self.quantile(0.99)
    }

    pub fn mean(&self) -> u64 {
        if self.count == 0 {
            0
        } else {
            self.sum / self.count
        }
    }

    pub fn count(&self) -> u64 {
        self.count
    }

    pub fn min(&self) -> u64 {
        if self.count == 0 {
            0
        } else {
            self.min
        }
    }

    pub fn max(&self) -> u64 {
        self.max
    }

    /// Samples that exceeded the histogram range. Non-zero means the reported
    /// quantiles understate reality and must not be trusted.
    pub fn overflow(&self) -> u64 {
        self.overflow
    }

    pub fn summary_ms(&self) -> LatencySummary {
        LatencySummary {
            count: self.count,
            p50_ms: ns_to_ms_f(self.p50()),
            p95_ms: ns_to_ms_f(self.p95()),
            p99_ms: ns_to_ms_f(self.p99()),
            mean_ms: ns_to_ms_f(self.mean()),
            max_ms: ns_to_ms_f(self.max()),
            overflow: self.overflow,
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub struct LatencySummary {
    pub count: u64,
    pub p50_ms: f64,
    pub p95_ms: f64,
    pub p99_ms: f64,
    pub mean_ms: f64,
    pub max_ms: f64,
    pub overflow: u64,
}

/// Bounded sliding window, for health decisions that must react to the last few
/// seconds rather than to the whole call. A call that was healthy for nine
/// minutes and is drowning now must read as drowning.
pub struct Window {
    buf: Vec<u64>,
    idx: usize,
    filled: usize,
    scratch: Vec<u64>,
}

impl Window {
    pub fn new(capacity: usize) -> Self {
        Window {
            buf: vec![0; capacity],
            idx: 0,
            filled: 0,
            scratch: Vec::with_capacity(capacity),
        }
    }

    #[inline]
    pub fn push(&mut self, value: u64) {
        self.buf[self.idx] = value;
        self.idx = (self.idx + 1) % self.buf.len();
        if self.filled < self.buf.len() {
            self.filled += 1;
        }
    }

    pub fn len(&self) -> usize {
        self.filled
    }

    pub fn is_empty(&self) -> bool {
        self.filled == 0
    }

    pub fn clear(&mut self) {
        self.idx = 0;
        self.filled = 0;
    }

    /// Mean of the window. Used for rate signals (share of frames that missed
    /// their deadline), where a quantile would be meaningless.
    pub fn mean(&self) -> f64 {
        if self.filled == 0 {
            return 0.0;
        }
        let sum: u64 = self.buf[..self.filled].iter().sum();
        sum as f64 / self.filled as f64
    }

    /// Sorts a reusable scratch buffer — no allocation after the first call.
    /// Called once every N frames by the health monitor, never per frame.
    pub fn quantile(&mut self, q: f64) -> u64 {
        if self.filled == 0 {
            return 0;
        }
        self.scratch.clear();
        self.scratch.extend_from_slice(&self.buf[..self.filled]);
        self.scratch.sort_unstable();
        let idx = (((self.filled as f64) * q).ceil() as usize).saturating_sub(1);
        self.scratch[idx.min(self.filled - 1)]
    }
}

/// Per-stage residence time: how long a frame sat inside one stage. The sum of
/// these across stages is the latency budget from `docs/02`, measured instead
/// of assumed.
pub struct StageStats {
    pub name: &'static str,
    pub residence: Histogram,
    pub pushed: u64,
    pub emitted: u64,
    pub dropped_backpressure: u64,
    pub dropped_failure: u64,
    pub dropped_late: u64,
}

impl StageStats {
    pub fn new(name: &'static str) -> Self {
        StageStats {
            name,
            residence: Histogram::latency(),
            pushed: 0,
            emitted: 0,
            dropped_backpressure: 0,
            dropped_failure: 0,
            dropped_late: 0,
        }
    }

    pub fn dropped_total(&self) -> u64 {
        self.dropped_backpressure + self.dropped_failure + self.dropped_late
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quantisation_error_is_bounded_by_half_a_bucket() {
        let mut h = Histogram::latency();
        // Every sample exactly 250 ms.
        for _ in 0..10_000 {
            h.record(250_000_000);
        }
        let p50 = h.p50();
        let err = (p50 as i64 - 250_000_000i64).abs();
        assert!(
            err <= 500_000,
            "quantisation error {} ns exceeds half a bucket",
            err
        );
    }

    #[test]
    fn quantiles_track_a_known_distribution() {
        let mut h = Histogram::latency();
        // 0..999 ms, one sample each: p50 ~ 500 ms, p95 ~ 950 ms.
        for i in 0..1000u64 {
            h.record(i * 1_000_000);
        }
        assert!((h.p50() as i64 - 500_000_000).abs() < 2_000_000);
        assert!((h.p95() as i64 - 950_000_000).abs() < 2_000_000);
        assert!((h.p99() as i64 - 990_000_000).abs() < 2_000_000);
    }

    #[test]
    fn overflow_is_reported_not_hidden() {
        let mut h = Histogram::new(1_000_000, 100_000_000);
        h.record(50_000_000);
        h.record(5_000_000_000);
        assert_eq!(h.overflow(), 1);
        assert_eq!(h.count(), 2);
    }

    #[test]
    fn empty_histogram_does_not_panic() {
        let h = Histogram::latency();
        assert_eq!(h.p50(), 0);
        assert_eq!(h.mean(), 0);
    }

    #[test]
    fn window_forgets_old_samples() {
        let mut w = Window::new(4);
        for v in [100u64, 100, 100, 100] {
            w.push(v);
        }
        assert_eq!(w.quantile(0.95), 100);
        for v in [900u64, 900, 900, 900] {
            w.push(v);
        }
        assert_eq!(w.quantile(0.95), 900, "window must drop stale samples");
    }
}
