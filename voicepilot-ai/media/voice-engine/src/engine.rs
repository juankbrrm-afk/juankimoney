//! The Voice Engine: the whole Mode A / Mode B path, wired together.
//!
//! ```text
//! capture -> network -> jitter buffer -> conditioning -+-> model -> scheduler -> customer
//!                                                      |                ^
//!                                                      +--- raw copy ---+
//! ```
//!
//! The raw copy is not a debugging aid. It is what makes bypass possible: the
//! scheduler always has real agent audio on hand, so when the model is late,
//! failed, or unhealthy, the customer hears the agent instead of a hole.
//!
//! The engine never blocks and never sleeps. `capture` feeds it, `tick` drives
//! it, and the caller owns the clock — which is what makes a ten-minute call
//! reproducible in milliseconds inside a test.

use crate::clock::ns_to_ms_f;
use crate::frame::{Frame, FramePool, Speaker, FRAME_NS, FRAME_SAMPLES};
use crate::health::{Health, HealthMonitor, HealthParams};
use crate::metrics::{Histogram, LatencySummary};
use crate::scheduler::{Emitted, OutputScheduler, SchedulerParams, SchedulerStats, Source};
use crate::stage::{PushResult, Stage};
use crate::stages::{
    JitterBuffer, JitterParams, ModelParams, ModelStage, NetworkParams, NetworkStage, VadGate,
    VadParams,
};

pub struct EngineConfig {
    pub network: NetworkParams,
    pub jitter: JitterParams,
    pub vad: VadParams,
    pub model: ModelParams,
    pub scheduler: SchedulerParams,
    pub health: HealthParams,
    /// Everything after the scheduler: output mixing, egress network to the
    /// PSTN gateway, and Opus -> G.711 transcoding. Stages 8-10 of the budget
    /// in `docs/02`. Modelled as a constant because it genuinely is one.
    pub egress_ns: u64,
    /// How far behind real time the output cadence runs. Set from the expected
    /// pipeline latency; too small and every frame is late, too large and we
    /// hand away budget for nothing.
    pub playout_offset_ns: Option<u64>,
    pub pool_capacity: usize,
    pub seed: u64,
}

impl EngineConfig {
    pub fn mode_a(seed: u64) -> Self {
        EngineConfig {
            network: NetworkParams::good_edge(),
            jitter: JitterParams::default(),
            vad: VadParams::default(),
            model: ModelParams::mode_a(),
            scheduler: SchedulerParams::default(),
            health: HealthParams::default(),
            egress_ns: 55_000_000,
            playout_offset_ns: None,
            pool_capacity: 1024,
            seed,
        }
    }

    pub fn mode_b(seed: u64) -> Self {
        EngineConfig {
            model: ModelParams::mode_b(),
            health: HealthParams {
                // Mode B is expected to be slow; judging it against Mode A's
                // thresholds would keep it permanently in bypass, which would
                // be a bug in the monitor, not a finding about the pipeline.
                degraded_threshold_ns: 1_200_000_000,
                bypass_threshold_ns: 1_800_000_000,
                ..HealthParams::default()
            },
            ..EngineConfig::mode_a(seed)
        }
    }

    /// Ideal conditions, fixed model latency: used to prove the harness itself
    /// measures accurately.
    pub fn calibration(fixed_model_ns: u64) -> Self {
        EngineConfig {
            network: NetworkParams::perfect(),
            jitter: JitterParams {
                min_depth_frames: 1,
                max_depth_frames: 1,
                initial_depth_frames: 1,
                jitter_multiplier: 0.0,
            },
            vad: VadParams {
                processing_ns: 0,
                agc_target_rms: 0.0,
                ..VadParams::default()
            },
            model: ModelParams::fixed(fixed_model_ns),
            scheduler: SchedulerParams::default(),
            health: HealthParams::default(),
            egress_ns: 0,
            playout_offset_ns: Some(fixed_model_ns + FRAME_NS),
            pool_capacity: 1024,
            seed: 1,
        }
    }

    /// The playout offset this config will use. Public so tooling can sweep
    /// around it instead of guessing an absolute range — Mode A needs ~165 ms
    /// and Mode B ~860 ms, so any fixed sweep range is wrong for one of them.
    pub fn effective_playout_offset(&self) -> u64 {
        self.playout_offset_ns.unwrap_or_else(|| {
            // Nominal pipeline delay, plus margin in two parts.
            //
            // Two frames for tick quantisation: the pipeline advances on 20 ms
            // boundaries, so a queued stage can round its residence up by
            // almost a full frame, and the first frame of a chunk waits the
            // whole chunk.
            //
            // Two sigma for the model's own variance. A fixed margin is wrong
            // and the bench proved it: Mode A's inference varies by 6 ms and
            // Mode B's by 25 ms, so the two frames that comfortably cover Mode
            // A left Mode B arriving 1 ms past its own deadline — which the
            // health monitor correctly read as failure and dropped 39% of a
            // healthy translated call into bypass.
            //
            // `latency-bench --sweep` puts Mode A's absolute floor at 140 ms
            // (255 ms mouth-to-ear), but at 99.1% delivered with no headroom
            // for a bad minute on the network. The extra margin costs ~25 ms
            // and buys 99.9%. Inaudible difference, very audible improvement.
            let quantisation = 2 * FRAME_NS;
            let variance = 2 * self.model.inference_sigma_ns;
            self.vad.processing_ns + self.model.pipeline_delay_ns() + quantisation + variance
        })
    }
}

pub struct VoiceEngine {
    pool: FramePool,
    network: NetworkStage,
    jitter: JitterBuffer,
    conditioning: VadGate,
    model: ModelStage,
    scheduler: OutputScheduler,
    health: HealthMonitor,
    playout_offset_ns: u64,
    egress_ns: u64,
    capture_seq: u64,
    /// Mouth-to-ear latency including egress: what the customer experienced.
    /// Constant by construction — the playout offset sets it.
    e2e: Histogram,
    /// Pipeline arrival latency: how long the pipeline actually took. This is
    /// the number with a distribution, and the one that decides whether a frame
    /// makes its deadline.
    pipeline: Histogram,
    frames_captured: u64,
    conceal_events: u64,
}

impl VoiceEngine {
    pub fn new(config: EngineConfig) -> Self {
        let pool = FramePool::with_capacity(config.pool_capacity);
        let playout_offset_ns = config.effective_playout_offset();
        VoiceEngine {
            network: NetworkStage::new(config.network, config.seed),
            jitter: JitterBuffer::new(config.jitter),
            conditioning: VadGate::new(config.vad),
            model: ModelStage::new("model", config.model, config.seed ^ 0xA5A5),
            scheduler: OutputScheduler::new(config.scheduler, pool.clone()),
            health: HealthMonitor::new(config.health),
            playout_offset_ns,
            egress_ns: config.egress_ns,
            capture_seq: 0,
            e2e: Histogram::latency(),
            pipeline: Histogram::latency(),
            frames_captured: 0,
            conceal_events: 0,
            pool,
        }
    }

    /// Chaos-testing handle. Lets a test kill the GPU mid-call.
    pub fn model_mut(&mut self) -> &mut ModelStage {
        &mut self.model
    }

    pub fn health(&self) -> Health {
        self.health.state()
    }

    /// How far behind real time the output runs.
    pub fn playout_offset_ns(&self) -> u64 {
        self.playout_offset_ns
    }

    /// Ticks needed after the last capture for everything still in flight to
    /// come out. Past this, the scheduler is emitting concealment over an empty
    /// pipeline — correct behaviour, but not something a report should count.
    pub fn drain_ticks(&self) -> u64 {
        self.playout_offset_ns / FRAME_NS + 5
    }

    pub fn pool(&self) -> &FramePool {
        &self.pool
    }

    /// Feeds 20 ms of microphone audio.
    ///
    /// `capture_ts` is set to the timestamp of the frame's *first* sample, not
    /// the moment the buffer completed. That 20 ms is real mouth-to-ear latency
    /// (stage 1 of the budget) and pretending otherwise would flatter every
    /// number this crate produces.
    pub fn capture(&mut self, samples: &[f32], now_ns: u64) {
        debug_assert_eq!(samples.len(), FRAME_SAMPLES);
        let capture_ts = now_ns.saturating_sub(FRAME_NS);
        let mut frame = self
            .pool
            .acquire(self.capture_seq, capture_ts, Speaker::Agent);
        frame.samples_mut().copy_from_slice(samples);
        self.capture_seq += 1;
        self.frames_captured += 1;

        if let PushResult::Dropped(_) = self.network.push(frame, now_ns) {
            self.health.record_failure(now_ns);
        }
    }

    /// Advances the pipeline to `now_ns`, appending everything due to `out`.
    pub fn tick(&mut self, now_ns: u64, out: &mut Vec<Emitted>) {
        // 1. Network -> jitter buffer.
        while let Some(f) = self.network.poll(now_ns) {
            if let PushResult::Dropped(_) = self.jitter.push(f, now_ns) {
                self.health.record_failure(now_ns);
            }
        }

        // 2. Jitter buffer -> conditioning, keeping a raw copy for bypass.
        while let Some(f) = self.jitter.poll(now_ns) {
            if !self.scheduler.started() {
                // Anchor the output cadence to the first frame that made it
                // through the network, offset by the expected pipeline
                // latency. Anchoring here rather than on the first *processed*
                // frame is deliberate: if the model never produces anything,
                // the scheduler must still run.
                self.scheduler.start(now_ns + self.playout_offset_ns, f.seq);
            }
            self.scheduler.submit_raw(f.duplicate());
            if let PushResult::Dropped(_) = self.conditioning.push(f, now_ns) {
                self.health.record_failure(now_ns);
            }
        }

        // 3. Conditioning -> model.
        while let Some(f) = self.conditioning.poll(now_ns) {
            if let PushResult::Dropped(_) = self.model.push(f, now_ns) {
                self.health.record_failure(now_ns);
            }
        }

        // 4. Model -> scheduler.
        //
        // Health is judged here, on *arrival*, not on emission. Judging it on
        // emission starves the monitor: in bypass the scheduler stops emitting
        // processed frames, so no successes are ever recorded, so the pipeline
        // can never be observed to recover. It would latch into bypass for the
        // rest of the call no matter how healthy it got.
        //
        // Arrival latency is also the more useful signal. Mouth-to-ear latency
        // is constant by construction in a fixed-playout scheduler (see
        // `Report::e2e`); what varies — and what decides whether a frame makes
        // its deadline — is how long the pipeline took to hand it over.
        while let Some(f) = self.model.poll(now_ns) {
            let arrival_ns = now_ns.saturating_sub(f.capture_ts_ns) + self.egress_ns;
            self.pipeline.record(arrival_ns);
            let missed_deadline = self.scheduler.started() && f.seq < self.scheduler.next_seq();
            if missed_deadline {
                self.health.record_late(now_ns);
            } else {
                self.health.record_success(arrival_ns, now_ns);
            }
            self.scheduler.submit_processed(f);
        }

        // 5. The invariant: emit whatever is due, no matter what happened above.
        let health = self.health.state();
        let before = out.len();
        self.scheduler.tick(now_ns, health, out);

        for e in out.iter().skip(before) {
            match e.source {
                Source::Processed | Source::Crossfade => {
                    // Mouth-to-ear, as the customer experienced it.
                    self.e2e.record(e.latency_ns + self.egress_ns);
                }
                Source::Bypass => {
                    // Bypass is a working state, not a failure. Its latency is
                    // the raw path's, not the product's, so it does not belong
                    // in the mouth-to-ear histogram.
                }
                Source::Conceal => {
                    self.conceal_events += 1;
                }
            }
        }
    }

    pub fn report(&self) -> Report {
        Report {
            e2e: self.e2e.summary_ms(),
            pipeline: self.pipeline.summary_ms(),
            playout_offset_ms: ns_to_ms_f(self.playout_offset_ns),
            frames_captured: self.frames_captured,
            conceal_events: self.conceal_events,
            network_lost: self.network.lost(),
            jitter_concealed: self.jitter.concealed(),
            jitter_target_depth: self.jitter.target_depth_frames(),
            jitter_estimate_ms: ns_to_ms_f(self.jitter.jitter_estimate_ns()),
            speech_ratio: self.conditioning.speech_ratio(),
            model_processed: self.model.processed(),
            model_skipped_silence: self.model.skipped_silence(),
            model_dropped: self.model.stats().dropped_total(),
            pool_allocated: self.pool.allocated(),
            pool_high_water: self.pool.high_water(),
            health_state: self.health.state(),
            health_transitions: self.health.transitions().len(),
            bypass_ms: ns_to_ms_f(self.health.time_in_bypass_ns()),
            stages: vec![
                StageReport::from("network", self.network.stats()),
                StageReport::from("jitter_buffer", self.jitter.stats()),
                StageReport::from("conditioning", self.conditioning.stats()),
                StageReport::from("model", self.model.stats()),
            ],
            scheduler: SchedulerReport {
                emitted: self.scheduler.stats().emitted,
                from_processed: self.scheduler.stats().from_processed,
                from_bypass: self.scheduler.stats().from_bypass,
                from_conceal: self.scheduler.stats().from_conceal,
                from_crossfade: self.scheduler.stats().from_crossfade,
                late_discarded: self.scheduler.stats().late_processed_discarded,
                processed_ratio: self.scheduler.stats().processed_ratio(),
            },
        }
    }

    pub fn scheduler_stats(&self) -> &SchedulerStats {
        self.scheduler.stats()
    }
}

pub struct StageReport {
    pub name: &'static str,
    pub residence: LatencySummary,
    pub pushed: u64,
    pub emitted: u64,
    pub dropped: u64,
}

impl StageReport {
    fn from(name: &'static str, s: &crate::metrics::StageStats) -> Self {
        StageReport {
            name,
            residence: s.residence.summary_ms(),
            pushed: s.pushed,
            emitted: s.emitted,
            dropped: s.dropped_total(),
        }
    }
}

pub struct SchedulerReport {
    pub emitted: u64,
    pub from_processed: u64,
    pub from_bypass: u64,
    pub from_conceal: u64,
    pub from_crossfade: u64,
    pub late_discarded: u64,
    pub processed_ratio: f64,
}

pub struct Report {
    pub e2e: LatencySummary,
    pub pipeline: LatencySummary,
    pub playout_offset_ms: f64,
    pub frames_captured: u64,
    pub conceal_events: u64,
    pub network_lost: u64,
    pub jitter_concealed: u64,
    pub jitter_target_depth: usize,
    pub jitter_estimate_ms: f64,
    pub speech_ratio: f64,
    pub model_processed: u64,
    pub model_skipped_silence: u64,
    pub model_dropped: u64,
    pub pool_allocated: usize,
    pub pool_high_water: usize,
    pub health_state: Health,
    pub health_transitions: usize,
    pub bypass_ms: f64,
    pub stages: Vec<StageReport>,
    pub scheduler: SchedulerReport,
}

/// A lightweight record of one emitted frame, without the audio buffer.
///
/// Cadence verification and reporting need the timing, not the samples. Holding
/// the `Frame` would keep its pooled buffer alive for the whole call, which
/// both defeats the pool and makes the allocation test measure the harness
/// instead of the engine.
#[derive(Clone, Copy, Debug)]
pub struct EmittedRecord {
    pub seq: u64,
    pub source: Source,
    pub deadline_ns: u64,
    pub latency_ns: u64,
}

impl From<&Emitted> for EmittedRecord {
    fn from(e: &Emitted) -> Self {
        EmittedRecord {
            seq: e.seq,
            source: e.source,
            deadline_ns: e.deadline_ns,
            latency_ns: e.latency_ns,
        }
    }
}

/// Verifies the output cadence directly from emitted frames: exactly one frame
/// every 20 ms, sequence numbers contiguous, no gaps and no duplicates.
///
/// This is the invariant check. Every test that touches the engine runs it.
pub fn verify_cadence(emitted: &[EmittedRecord]) -> Result<(), String> {
    if emitted.is_empty() {
        return Err("no frames emitted at all".to_string());
    }
    for (i, e) in emitted.iter().enumerate().skip(1) {
        let prev = &emitted[i - 1];
        if e.seq != prev.seq + 1 {
            return Err(format!(
                "sequence break at index {i}: {} -> {} (gap or duplicate)",
                prev.seq, e.seq
            ));
        }
        let delta = e.deadline_ns - prev.deadline_ns;
        if delta != FRAME_NS {
            return Err(format!(
                "cadence break at seq {}: {} ns between frames, expected {}",
                e.seq, delta, FRAME_NS
            ));
        }
    }
    Ok(())
}

/// Largest sample-to-sample jump across a frame boundary. A crossfade that
/// works produces a small number; a hard cut produces a click, and a click is
/// exactly what makes a customer ask "what was that?".
pub fn max_boundary_discontinuity(frames: &[Frame]) -> f32 {
    let mut worst = 0.0f32;
    for w in frames.windows(2) {
        let a = w[0].samples();
        let b = w[1].samples();
        let jump = (b[0] - a[FRAME_SAMPLES - 1]).abs();
        if jump > worst {
            worst = jump;
        }
    }
    worst
}
