//! The inference stage: voice conversion (Mode A) or the ASR/MT/TTS cascade
//! (Mode B), modelled by its timing behaviour.
//!
//! There is no GPU in this crate and no model weights. That is the point of
//! module 0.1: build the harness that will *measure* the model before the model
//! exists, so that when it lands we already know whether it fits the budget,
//! and the answer arrives in seconds instead of after a week of wiring.
//!
//! What is modelled is what actually determines the latency distribution:
//!
//! - **Algorithmic lookahead** — fixed, irreducible, the dominant term in
//!   Mode A. Not a function of hardware; buying a faster GPU does not shrink it.
//! - **Serial inference** — one worker, batch 1. A frame cannot finish before
//!   its predecessor, which is why queueing shows up as latency and not as
//!   throughput.
//! - **Variance and stalls** — CUDA sync, page faults, a neighbour on the same
//!   card. This is where p95 comes from, and p95 is the number we are judged on.
//! - **Hard failures** — injectable, because the bypass path must be exercised.
//!
//! Swapping this for a real gRPC client to `ai-services` changes this file and
//! nothing else.

use std::collections::VecDeque;

use crate::frame::Frame;
use crate::metrics::StageStats;
use crate::rng::Rng;
use crate::stage::{record_drop, record_exit, DropReason, PushResult, Stage};

pub struct ModelParams {
    /// Frames per inference call.
    ///
    /// Streaming models do not run once per 20 ms frame — they accumulate a
    /// chunk and run once over it. Modelling per-frame inference produced a
    /// real-time factor of 1.75x on a stage that is comfortably real-time in
    /// practice, and the queue grew without bound until backpressure ate 36%
    /// of the call. The chunk is also *where the lookahead comes from*: a 4
    /// frame chunk is the 80 ms of future context in the `docs/02` budget.
    pub chunk_frames: usize,
    /// Algorithmic lookahead **beyond** the chunk. Zero for a model whose only
    /// future context is its own chunk; non-zero for a commit policy like
    /// Mode B's wait-k, which is linguistic and not helped by hardware.
    pub lookahead_ns: u64,
    /// Median compute time for one chunk. Real-time requires
    /// `inference_ns < chunk_frames * 20 ms`, or the stage falls behind
    /// forever — the bench will show it immediately.
    pub inference_ns: u64,
    /// Standard deviation of compute time.
    pub inference_sigma_ns: u64,
    /// Probability of an occasional long stall.
    pub stall_probability: f64,
    pub stall_ns: u64,
    /// Backpressure slack, in **inference chunks**, on top of the model's
    /// inherent pipeline depth.
    ///
    /// `docs/02` states the rule as "drop when the consumer is more than 3
    /// chunks behind". Implementing that as an absolute queue limit is wrong,
    /// and measurably so: a model with 80 ms of lookahead and 35 ms of
    /// inference holds ~6 frames at all times *by construction*. Capping the
    /// queue at 3 discarded 46% of frames as congestion when nothing was
    /// congested — the algorithm was simply doing its job.
    ///
    /// The real threshold is inherent depth + slack, and the slack is counted
    /// in chunks — which is what "3 chunks behind" meant all along. Counting it
    /// in frames instead silently gave Mode B a slack of 3 frames (60 ms)
    /// against a stage whose own variance is larger than that, and 33% of a
    /// healthy translated call was discarded as congestion.
    ///
    /// Mode A: 3 chunks x 4 frames = 12 frames of slack.
    /// Mode B: 3 chunks x 8 frames = 24 frames of slack.
    pub backpressure_slack: usize,
    /// Pass silent frames through at zero cost (unit-economics lever #4).
    pub skip_silence: bool,
}

impl ModelParams {
    /// Mode A: streaming voice conversion. 80 ms lookahead + 35 ms inference,
    /// per the budget table in `docs/02`.
    pub fn mode_a() -> Self {
        ModelParams {
            // 4 frames = the 80 ms lookahead from the budget table.
            chunk_frames: 4,
            lookahead_ns: 0,
            // 35 ms per 80 ms chunk: real-time factor 0.44.
            inference_ns: 35_000_000,
            inference_sigma_ns: 6_000_000,
            stall_probability: 0.004,
            stall_ns: 60_000_000,
            backpressure_slack: 3,
            skip_silence: true,
        }
    }

    /// Mode B: the ASR -> wait-k -> MT -> TTS cascade, collapsed into one
    /// stage. The lookahead term is the commit policy, which is linguistic,
    /// not computational — no hardware makes it smaller.
    pub fn mode_b() -> Self {
        ModelParams {
            chunk_frames: 8,
            // The wait-k commit policy. Not compute — grammar. See `docs/02`.
            lookahead_ns: 550_000_000,
            // 100 ms per 160 ms chunk: real-time factor 0.63.
            inference_ns: 100_000_000,
            inference_sigma_ns: 25_000_000,
            stall_probability: 0.01,
            stall_ns: 250_000_000,
            backpressure_slack: 3,
            skip_silence: true,
        }
    }

    /// Zero-cost stage, for calibrating the harness itself.
    pub fn passthrough() -> Self {
        ModelParams {
            chunk_frames: 1,
            lookahead_ns: 0,
            inference_ns: 0,
            inference_sigma_ns: 0,
            stall_probability: 0.0,
            stall_ns: 0,
            backpressure_slack: 3,
            skip_silence: false,
        }
    }

    /// Exact fixed latency, no variance. Used by the accuracy test to prove
    /// the measurement is within +/-5 ms of a known truth.
    pub fn fixed(latency_ns: u64) -> Self {
        ModelParams {
            chunk_frames: 1,
            lookahead_ns: latency_ns,
            inference_ns: 0,
            inference_sigma_ns: 0,
            stall_probability: 0.0,
            stall_ns: 0,
            backpressure_slack: 64,
            skip_silence: false,
        }
    }

    /// Delay this stage adds to a frame at steady state: waiting for its chunk
    /// to fill, the inference itself, and any lookahead beyond the chunk.
    pub fn pipeline_delay_ns(&self) -> u64 {
        self.chunk_frames as u64 * crate::frame::FRAME_NS + self.inference_ns + self.lookahead_ns
    }

    /// Real-time factor. Above 1.0 the stage can never keep up.
    pub fn real_time_factor(&self) -> f64 {
        self.inference_ns as f64 / (self.chunk_frames as f64 * crate::frame::FRAME_NS as f64)
    }
}

struct Held {
    ready_at_ns: u64,
    pushed_at_ns: u64,
    frame: Frame,
}

pub struct ModelStage {
    name: &'static str,
    params: ModelParams,
    rng: Rng,
    queue: VecDeque<Held>,
    /// Frames accumulating into the chunk currently being assembled.
    pending: Vec<Held>,
    /// When the serial worker becomes free. Enforces that inference is
    /// sequential — the reason depth turns into latency.
    worker_free_at_ns: u64,
    /// Frames the model holds by construction (lookahead + inference), plus
    /// slack. Derived once, at construction.
    max_depth: usize,
    stats: StageStats,
    inject_failures: u64,
    inject_stall_ns: u64,
    skipped_silence: u64,
    processed: u64,
}

impl ModelStage {
    pub fn new(name: &'static str, params: ModelParams, seed: u64) -> Self {
        // Frames in flight purely because of how the model works: everything
        // inside the lookahead window plus whatever the worker is chewing on.
        let params_chunk = params.chunk_frames.max(1);
        let inherent_depth = (params.pipeline_delay_ns().div_ceil(crate::frame::FRAME_NS)) as usize;
        let max_depth = inherent_depth + params.backpressure_slack * params_chunk;
        ModelStage {
            name,
            params,
            rng: Rng::new(seed),
            queue: VecDeque::with_capacity(max_depth + 4),
            pending: Vec::with_capacity(params_chunk + 1),
            worker_free_at_ns: 0,
            max_depth,
            stats: StageStats::new("model"),
            inject_failures: 0,
            inject_stall_ns: 0,
            skipped_silence: 0,
            processed: 0,
        }
    }

    /// Queue depth at which the stage starts dropping. Inherent pipeline depth
    /// plus the configured slack.
    pub fn max_depth(&self) -> usize {
        self.max_depth
    }

    /// Runs inference over the accumulated chunk and releases its frames.
    ///
    /// A chunk containing only silence costs no compute at all — that is
    /// unit-economics lever #4, and it is charged per chunk rather than per
    /// frame because that is how a GPU is actually billed.
    fn close_chunk(&mut self, now_ns: u64) {
        if self.pending.is_empty() {
            return;
        }
        let voiced = !self.params.skip_silence || self.pending.iter().any(|h| h.frame.voice_active);

        let compute = if voiced {
            let mut c =
                self.params.inference_ns + self.rng.jitter_ns(self.params.inference_sigma_ns);
            if self.rng.chance(self.params.stall_probability) {
                c += self.params.stall_ns;
            }
            c + self.inject_stall_ns
        } else {
            0
        };

        if voiced {
            self.processed += self.pending.len() as u64;
        } else {
            self.skipped_silence += self.pending.len() as u64;
        }

        // Serial worker: this chunk cannot start before the previous finishes.
        // This is what turns a real-time factor above 1.0 into unbounded
        // latency growth instead of silently vanishing.
        let start = now_ns.max(self.worker_free_at_ns);
        let finish = start + compute;
        self.worker_free_at_ns = finish;
        let ready_at = finish + self.params.lookahead_ns;

        for mut held in self.pending.drain(..) {
            held.ready_at_ns = ready_at;
            self.queue.push_back(held);
        }
    }
}

impl Stage for ModelStage {
    fn name(&self) -> &'static str {
        self.name
    }

    fn push(&mut self, frame: Frame, now_ns: u64) -> PushResult {
        self.stats.pushed += 1;

        if self.inject_failures > 0 {
            self.inject_failures -= 1;
            return record_drop(&mut self.stats, DropReason::Failure);
        }

        // The backpressure rule, enforced: drop, never queue.
        if self.queue.len() + self.pending.len() >= self.max_depth {
            return record_drop(&mut self.stats, DropReason::Backpressure);
        }

        self.pending.push(Held {
            ready_at_ns: 0,
            pushed_at_ns: now_ns,
            frame,
        });

        if self.pending.len() >= self.params.chunk_frames.max(1) {
            self.close_chunk(now_ns);
        }
        PushResult::Accepted
    }

    fn poll(&mut self, now_ns: u64) -> Option<Frame> {
        let ready = self
            .queue
            .front()
            .map(|h| h.ready_at_ns <= now_ns)
            .unwrap_or(false);
        if !ready {
            return None;
        }
        let held = self.queue.pop_front()?;
        record_exit(&mut self.stats, held.pushed_at_ns, now_ns);
        Some(held.frame)
    }

    fn depth(&self) -> usize {
        self.queue.len() + self.pending.len()
    }

    fn stats(&self) -> &StageStats {
        &self.stats
    }

    fn reset(&mut self) {
        self.queue.clear();
        self.pending.clear();
        self.worker_free_at_ns = 0;
    }

    /// Frames that skipped inference because they were silence. Multiply by the
    /// per-frame GPU cost to get the money saved.
    fn skipped_silence(&self) -> u64 {
        self.skipped_silence
    }

    fn processed(&self) -> u64 {
        self.processed
    }

    /// Makes the next `n` pushes fail hard. Chaos testing for the bypass path.
    fn inject_failures(&mut self, n: u64) {
        self.inject_failures = n;
    }

    /// Adds a constant delay to every subsequent frame — a degraded GPU, a
    /// noisy neighbour, a model that got slower after a deploy.
    fn inject_stall(&mut self, extra_ns: u64) {
        self.inject_stall_ns = extra_ns;
    }

    fn clear_injections(&mut self) {
        self.inject_failures = 0;
        self.inject_stall_ns = 0;
    }
}
