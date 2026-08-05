//! The output scheduler. This file holds the single invariant the whole
//! product rests on:
//!
//! > **One frame of audio leaves for the customer every 20 ms. Always.
//! > Even if the entire intelligence plane is down.**
//!
//! Everything else in VoicePilot is allowed to fail. The copilot can go dark,
//! compliance can miss an alert, the CRM can stop writing notes — the call
//! survives all of it. Audio is different: a gap is not a degraded experience,
//! it is a dropped sale and a customer who hangs up.
//!
//! So the scheduler never waits for anything. At each deadline it emits the
//! best thing available, in this order:
//!
//! 1. the processed frame, if it arrived in time and health allows it
//! 2. the raw frame, if we have it (bypass)
//! 3. concealment built from the last emitted frame (nothing arrived at all)
//!
//! There is no fourth branch, and no path that emits nothing.

use std::collections::BTreeMap;

use crate::frame::{Frame, FramePool, Speaker, FRAME_NS, FRAME_SAMPLES};
use crate::health::Health;
use crate::metrics::Histogram;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Source {
    /// AI-converted audio. What we sell.
    Processed,
    /// Raw agent audio. The safety net.
    Bypass,
    /// Neither arrived; synthesised from history. Should be rare.
    Conceal,
    /// Crossfading between processed and raw.
    Crossfade,
}

pub struct Emitted {
    pub seq: u64,
    pub source: Source,
    pub deadline_ns: u64,
    /// Mouth-to-ear latency for this frame, measured from the capture
    /// timestamp that travelled with it. Zero for concealment, which has no
    /// source frame and therefore no honest latency to report.
    pub latency_ns: u64,
    pub frame: Frame,
}

pub struct SchedulerParams {
    /// 200 ms, per `docs/05`. A hard cut between timbres is more suspicious to
    /// the customer than a gradual one.
    pub crossfade_frames: u32,
    /// How many raw frames to retain for bypass. Two seconds is plenty; the
    /// scheduler is not a recording buffer.
    pub raw_window_frames: usize,
    /// How long a processed frame may wait past its deadline before it is
    /// worthless.
    pub processed_window_frames: usize,
}

impl Default for SchedulerParams {
    fn default() -> Self {
        SchedulerParams {
            crossfade_frames: 10,
            raw_window_frames: 100,
            processed_window_frames: 50,
        }
    }
}

pub struct SchedulerStats {
    pub emitted: u64,
    pub from_processed: u64,
    pub from_bypass: u64,
    pub from_conceal: u64,
    pub from_crossfade: u64,
    pub late_processed_discarded: u64,
    pub e2e: Histogram,
}

impl SchedulerStats {
    fn new() -> Self {
        SchedulerStats {
            emitted: 0,
            from_processed: 0,
            from_bypass: 0,
            from_conceal: 0,
            from_crossfade: 0,
            late_processed_discarded: 0,
            e2e: Histogram::latency(),
        }
    }

    /// Share of output the customer actually heard as converted audio. The
    /// number that decides whether the product delivered what was sold.
    pub fn processed_ratio(&self) -> f64 {
        if self.emitted == 0 {
            0.0
        } else {
            (self.from_processed + self.from_crossfade) as f64 / self.emitted as f64
        }
    }
}

pub struct OutputScheduler {
    params: SchedulerParams,
    pool: FramePool,
    next_deadline_ns: u64,
    next_seq: u64,
    started: bool,
    processed: BTreeMap<u64, Frame>,
    raw: BTreeMap<u64, Frame>,
    /// Last emitted samples, for concealment. Repeating the previous frame is
    /// far less audible than silence, which reads as a dropped call.
    last_emitted: Box<[f32]>,
    fade_remaining: u32,
    fade_to_processed: bool,
    last_target: Source,
    stats: SchedulerStats,
}

impl OutputScheduler {
    pub fn new(params: SchedulerParams, pool: FramePool) -> Self {
        OutputScheduler {
            params,
            pool,
            next_deadline_ns: 0,
            next_seq: 0,
            started: false,
            processed: BTreeMap::new(),
            raw: BTreeMap::new(),
            last_emitted: vec![0.0f32; FRAME_SAMPLES].into_boxed_slice(),
            fade_remaining: 0,
            fade_to_processed: true,
            last_target: Source::Processed,
            stats: SchedulerStats::new(),
        }
    }

    /// Anchors the output cadence. Every subsequent deadline is exactly
    /// `first_deadline_ns + n * 20 ms` — computed from the anchor, never
    /// accumulated from the previous tick, so the cadence cannot drift.
    pub fn start(&mut self, first_deadline_ns: u64, first_seq: u64) {
        self.next_deadline_ns = first_deadline_ns;
        self.next_seq = first_seq;
        self.started = true;
    }

    pub fn started(&self) -> bool {
        self.started
    }

    pub fn stats(&self) -> &SchedulerStats {
        &self.stats
    }

    pub fn next_deadline_ns(&self) -> u64 {
        self.next_deadline_ns
    }

    /// Sequence number of the next frame to be emitted. Anything below this has
    /// missed its deadline.
    pub fn next_seq(&self) -> u64 {
        self.next_seq
    }

    pub fn submit_processed(&mut self, frame: Frame) {
        if self.started && frame.seq < self.next_seq {
            self.stats.late_processed_discarded += 1;
            return; // Its deadline has passed. Recycled on drop.
        }
        self.processed.insert(frame.seq, frame);
        self.trim(self.params.processed_window_frames, TrimTarget::Processed);
    }

    pub fn submit_raw(&mut self, frame: Frame) {
        if self.started && frame.seq < self.next_seq {
            return;
        }
        self.raw.insert(frame.seq, frame);
        self.trim(self.params.raw_window_frames, TrimTarget::Raw);
    }

    fn trim(&mut self, max: usize, target: TrimTarget) {
        let map = match target {
            TrimTarget::Processed => &mut self.processed,
            TrimTarget::Raw => &mut self.raw,
        };
        while map.len() > max {
            let oldest = match map.keys().next() {
                Some(k) => *k,
                None => break,
            };
            map.remove(&oldest);
        }
    }

    /// Emits every frame whose deadline has passed at `now_ns`.
    ///
    /// Returns frames through `out` rather than allocating, so the hot path
    /// stays allocation-free across the whole call.
    pub fn tick(&mut self, now_ns: u64, health: Health, out: &mut Vec<Emitted>) {
        if !self.started {
            return;
        }
        while now_ns >= self.next_deadline_ns {
            let e = self.emit_one(self.next_deadline_ns, health);
            out.push(e);
            self.next_seq += 1;
            self.next_deadline_ns += FRAME_NS;
        }
    }

    fn emit_one(&mut self, deadline_ns: u64, health: Health) -> Emitted {
        let seq = self.next_seq;
        let want_processed = health != Health::Bypass;

        // A deliberate health-driven switch gets a crossfade. A missing frame
        // does not: there is nothing to fade with.
        let target = if want_processed {
            Source::Processed
        } else {
            Source::Bypass
        };
        if target != self.last_target {
            self.fade_remaining = self.params.crossfade_frames;
            self.fade_to_processed = want_processed;
            self.last_target = target;
        }

        let processed = if want_processed || self.fade_remaining > 0 {
            self.processed.remove(&seq)
        } else {
            None
        };
        let raw = self.raw.remove(&seq);

        let (mut frame, source, latency_ns) = match (processed, raw) {
            // Both present and mid-crossfade: blend them.
            (Some(mut p), Some(r)) if self.fade_remaining > 0 => {
                let total = self.params.crossfade_frames.max(1) as f32;
                let done = (self.params.crossfade_frames - self.fade_remaining) as f32;
                let progress = (done + 1.0) / total;
                // `alpha` is the weight of the processed signal.
                let alpha = if self.fade_to_processed {
                    progress
                } else {
                    1.0 - progress
                };
                let (ps, rs) = (p.samples_mut(), r.samples());
                for i in 0..FRAME_SAMPLES {
                    ps[i] = ps[i] * alpha + rs[i] * (1.0 - alpha);
                }
                self.fade_remaining -= 1;
                let lat = deadline_ns.saturating_sub(p.capture_ts_ns);
                (p, Source::Crossfade, lat)
            }
            // Processed frame in hand and nothing to blend it with. Emit it:
            // converted audio always beats concealment.
            (Some(p), _) => {
                let lat = deadline_ns.saturating_sub(p.capture_ts_ns);
                (p, Source::Processed, lat)
            }
            (_, Some(r)) => {
                let lat = deadline_ns.saturating_sub(r.capture_ts_ns);
                (r, Source::Bypass, lat)
            }
            // Nothing arrived. Conceal — but still emit, on time.
            (None, None) => {
                let mut f = self.pool.acquire(seq, deadline_ns, Speaker::Agent);
                let last = &self.last_emitted;
                let s = f.samples_mut();
                // Repeat the previous frame at reduced gain: audible as a tiny
                // smear rather than as a hole.
                for i in 0..FRAME_SAMPLES {
                    s[i] = last[i] * 0.6;
                }
                (f, Source::Conceal, 0)
            }
        };

        // A fade only advances when it actually blends. Bound it anyway, so a
        // stretch of missing raw frames cannot leave the scheduler permanently
        // "mid-crossfade" and pulling processed frames it should not.
        if self.fade_remaining > 0 && source != Source::Crossfade {
            self.fade_remaining -= 1;
        }

        frame.seq = seq;
        self.last_emitted.copy_from_slice(frame.samples());

        self.stats.emitted += 1;
        match source {
            Source::Processed => self.stats.from_processed += 1,
            Source::Bypass => self.stats.from_bypass += 1,
            Source::Conceal => self.stats.from_conceal += 1,
            Source::Crossfade => self.stats.from_crossfade += 1,
        }
        if latency_ns > 0 {
            self.stats.e2e.record(latency_ns);
        }

        Emitted {
            seq,
            source,
            deadline_ns,
            latency_ns,
            frame,
        }
    }

    pub fn reset(&mut self) {
        self.processed.clear();
        self.raw.clear();
        self.started = false;
        self.fade_remaining = 0;
        self.last_emitted.fill(0.0);
    }
}

enum TrimTarget {
    Processed,
    Raw,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::frame::FRAME_NS;

    fn setup() -> (FramePool, OutputScheduler) {
        let pool = FramePool::with_capacity(512);
        let sched = OutputScheduler::new(SchedulerParams::default(), pool.clone());
        (pool, sched)
    }

    #[test]
    fn cadence_is_exact_with_no_input_at_all() {
        let (_pool, mut s) = setup();
        s.start(0, 0);
        let mut out = Vec::new();
        // Ten seconds of wall clock, nothing ever submitted.
        s.tick(10 * 1_000_000_000, Health::Processing, &mut out);
        assert_eq!(out.len(), 501, "one frame per 20 ms, no exceptions");
        for (i, e) in out.iter().enumerate() {
            assert_eq!(e.seq, i as u64);
            assert_eq!(e.deadline_ns, i as u64 * FRAME_NS);
            assert_eq!(e.source, Source::Conceal);
        }
    }

    #[test]
    fn processed_audio_is_preferred_when_available() {
        let (pool, mut s) = setup();
        s.start(0, 0);
        for seq in 0..5u64 {
            s.submit_processed(pool.acquire(seq, seq * FRAME_NS, Speaker::Agent));
            s.submit_raw(pool.acquire(seq, seq * FRAME_NS, Speaker::Agent));
        }
        let mut out = Vec::new();
        // Deadlines are inclusive: ticking to 4*FRAME_NS covers seqs 0..=4.
        s.tick(4 * FRAME_NS, Health::Processing, &mut out);
        assert_eq!(out.len(), 5);
        assert!(out.iter().all(|e| e.source == Source::Processed));
    }

    #[test]
    fn bypass_uses_raw_audio_not_silence() {
        let (pool, mut s) = setup();
        s.start(0, 0);
        for seq in 0..5u64 {
            let mut f = pool.acquire(seq, seq * FRAME_NS, Speaker::Agent);
            f.samples_mut().fill(0.4);
            s.submit_raw(f);
        }
        let mut out = Vec::new();
        s.tick(4 * FRAME_NS, Health::Bypass, &mut out);
        assert_eq!(out.len(), 5);
        assert!(out.iter().all(|e| e.source == Source::Bypass));
        assert!(out[4].frame.rms() > 0.3, "bypass must carry real audio");
    }

    #[test]
    fn latency_is_measured_from_the_capture_timestamp() {
        let (pool, mut s) = setup();
        s.start(0, 0);
        // Captured at t=0, deadline at t=250 ms => 250 ms of latency.
        s.submit_processed(pool.acquire(0, 0, Speaker::Agent));
        let mut out = Vec::new();
        s.start(250_000_000, 0);
        s.tick(250_000_000, Health::Processing, &mut out);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].latency_ns, 250_000_000);
    }
}
