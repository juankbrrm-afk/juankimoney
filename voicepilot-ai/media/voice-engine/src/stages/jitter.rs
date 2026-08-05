//! Adaptive jitter buffer.
//!
//! Stage 3 of the Mode A budget (30 ms). It is the most consequential tunable
//! in the whole pipeline: too shallow and every network hiccup becomes a gap in
//! the audio; too deep and it quietly eats the latency budget that the GPU
//! needs.
//!
//! So it adapts. The buffer tracks arrival jitter (RFC 3550 style smoothing)
//! and targets roughly twice the observed jitter, clamped between a floor and a
//! ceiling. On a wired connection it sits near the floor and costs almost
//! nothing; on a bad WiFi floor it deepens and trades latency for continuity —
//! which is the right trade, because a gap is always more audible than 20 ms.

use std::collections::BTreeMap;

use crate::frame::{Frame, FRAME_NS};
use crate::metrics::StageStats;
use crate::stage::{record_drop, record_exit, DropReason, PushResult, Stage};

pub struct JitterParams {
    pub min_depth_frames: usize,
    pub max_depth_frames: usize,
    pub initial_depth_frames: usize,
    /// How strongly the target follows measured jitter. 2.0 covers ~95% of a
    /// normal jitter distribution.
    pub jitter_multiplier: f64,
}

impl Default for JitterParams {
    fn default() -> Self {
        JitterParams {
            min_depth_frames: 1,
            max_depth_frames: 8,
            initial_depth_frames: 2,
            jitter_multiplier: 2.0,
        }
    }
}

struct Held {
    pushed_at_ns: u64,
    frame: Frame,
}

pub struct JitterBuffer {
    params: JitterParams,
    held: BTreeMap<u64, Held>,
    next_seq: u64,
    primed: bool,
    target_depth: usize,
    // RFC 3550 style interarrival jitter estimate.
    jitter_est_ns: f64,
    last_arrival_ns: u64,
    last_seq: u64,
    stats: StageStats,
    concealed: u64,
}

impl JitterBuffer {
    pub fn new(params: JitterParams) -> Self {
        let target = params.initial_depth_frames;
        JitterBuffer {
            params,
            held: BTreeMap::new(),
            next_seq: 0,
            primed: false,
            target_depth: target,
            jitter_est_ns: 0.0,
            last_arrival_ns: 0,
            last_seq: 0,
            stats: StageStats::new("jitter_buffer"),
            concealed: 0,
        }
    }

    pub fn target_depth_frames(&self) -> usize {
        self.target_depth
    }

    pub fn jitter_estimate_ns(&self) -> u64 {
        self.jitter_est_ns as u64
    }

    /// Frames that never arrived and had to be skipped. Each one is a hole the
    /// scheduler fills with concealment.
    pub fn concealed(&self) -> u64 {
        self.concealed
    }

    fn update_jitter(&mut self, seq: u64, now_ns: u64) {
        if self.last_arrival_ns != 0 && seq > self.last_seq {
            let expected = (seq - self.last_seq) * FRAME_NS;
            let actual = now_ns.saturating_sub(self.last_arrival_ns);
            let d = (actual as i64 - expected as i64).abs() as f64;
            // Smoothing factor 1/16, as in RFC 3550.
            self.jitter_est_ns += (d - self.jitter_est_ns) / 16.0;
        }
        if seq >= self.last_seq {
            self.last_seq = seq;
            self.last_arrival_ns = now_ns;
        }

        let wanted = ((self.jitter_est_ns * self.params.jitter_multiplier) / FRAME_NS as f64).ceil()
            as usize;
        self.target_depth = wanted
            .max(self.params.min_depth_frames)
            .min(self.params.max_depth_frames);
    }
}

impl Stage for JitterBuffer {
    fn name(&self) -> &'static str {
        "jitter_buffer"
    }

    fn push(&mut self, frame: Frame, now_ns: u64) -> PushResult {
        self.stats.pushed += 1;
        let seq = frame.seq;
        self.update_jitter(seq, now_ns);

        // Already played out. A late frame is not data, it is garbage.
        if self.primed && seq < self.next_seq {
            return record_drop(&mut self.stats, DropReason::Late);
        }
        if self.held.len() >= self.params.max_depth_frames * 2 {
            return record_drop(&mut self.stats, DropReason::Backpressure);
        }
        self.held.insert(
            seq,
            Held {
                pushed_at_ns: now_ns,
                frame,
            },
        );
        PushResult::Accepted
    }

    fn poll(&mut self, now_ns: u64) -> Option<Frame> {
        if !self.primed {
            if self.held.len() < self.target_depth.max(1) {
                return None;
            }
            self.primed = true;
            self.next_seq = *self.held.keys().next()?;
        }

        if let Some(held) = self.held.remove(&self.next_seq) {
            self.next_seq += 1;
            record_exit(&mut self.stats, held.pushed_at_ns, now_ns);
            return Some(held.frame);
        }

        // The next frame is missing. Wait only while the buffer is still
        // shallow; once it is over target, the frame is not coming and holding
        // the line just adds latency for everyone behind it.
        if self.held.len() > self.target_depth {
            self.concealed += 1;
            self.next_seq += 1;
            return self.poll(now_ns);
        }
        None
    }

    fn depth(&self) -> usize {
        self.held.len()
    }

    fn stats(&self) -> &StageStats {
        &self.stats
    }

    fn reset(&mut self) {
        self.held.clear();
        self.primed = false;
        self.next_seq = 0;
    }
}
