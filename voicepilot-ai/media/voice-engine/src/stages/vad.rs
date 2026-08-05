//! Voice activity detection and audio conditioning.
//!
//! Stage 4 of the Mode A budget (10 ms). Two jobs:
//!
//! 1. Mark frames as speech or silence, so downstream stages can skip silence.
//! 2. Apply gain control, so the conversion model sees a consistent level.
//!
//! The silence skip is not a micro-optimisation. In a sales call the agent
//! speaks well under half the time; not burning GPU on the other half is
//! lever #4 in `docs/11-unit-economics.md`, and it is close to free because the
//! VAD has to run anyway.
//!
//! Energy VAD with hysteresis, not a neural VAD: production swaps in Silero at
//! this exact interface. What matters for the bench is the timing behaviour and
//! the hysteresis, both of which this reproduces.

use std::collections::VecDeque;

use crate::frame::Frame;
use crate::metrics::StageStats;
use crate::stage::{record_exit, PushResult, Stage};

pub struct VadParams {
    /// Fixed processing cost of the conditioning chain.
    pub processing_ns: u64,
    /// RMS above which a frame counts as speech.
    pub speech_rms: f32,
    /// RMS below which speech is considered over.
    pub silence_rms: f32,
    /// Consecutive speech frames required to open the gate. Prevents a cough
    /// or a keyboard from waking the pipeline.
    pub attack_frames: u32,
    /// Consecutive silent frames required to close it. Generous, because
    /// clipping the tail of a word is far worse than a few wasted frames.
    pub release_frames: u32,
    /// Target RMS for automatic gain control. 0.0 disables AGC.
    pub agc_target_rms: f32,
    pub agc_max_gain: f32,
}

impl Default for VadParams {
    fn default() -> Self {
        VadParams {
            processing_ns: 10_000_000,
            speech_rms: 0.02,
            silence_rms: 0.010,
            attack_frames: 2,
            release_frames: 12,
            agc_target_rms: 0.12,
            agc_max_gain: 8.0,
        }
    }
}

struct Held {
    ready_at_ns: u64,
    pushed_at_ns: u64,
    frame: Frame,
}

pub struct VadGate {
    params: VadParams,
    queue: VecDeque<Held>,
    speaking: bool,
    above: u32,
    below: u32,
    stats: StageStats,
    speech_frames: u64,
    silence_frames: u64,
}

impl VadGate {
    pub fn new(params: VadParams) -> Self {
        VadGate {
            params,
            queue: VecDeque::with_capacity(16),
            speaking: false,
            above: 0,
            below: 0,
            stats: StageStats::new("conditioning"),
            speech_frames: 0,
            silence_frames: 0,
        }
    }

    pub fn speech_frames(&self) -> u64 {
        self.speech_frames
    }

    pub fn silence_frames(&self) -> u64 {
        self.silence_frames
    }

    /// Share of frames carrying speech. Directly proportional to GPU spend.
    pub fn speech_ratio(&self) -> f64 {
        let total = self.speech_frames + self.silence_frames;
        if total == 0 {
            0.0
        } else {
            self.speech_frames as f64 / total as f64
        }
    }

    fn classify(&mut self, rms: f32) -> bool {
        if rms >= self.params.speech_rms {
            self.above += 1;
            self.below = 0;
        } else if rms <= self.params.silence_rms {
            self.below += 1;
            self.above = 0;
        } else {
            // In the hysteresis band: hold whatever we decided last.
            self.above = 0;
            self.below = 0;
        }

        if !self.speaking && self.above >= self.params.attack_frames {
            self.speaking = true;
        } else if self.speaking && self.below >= self.params.release_frames {
            self.speaking = false;
        }
        self.speaking
    }

    fn apply_agc(&self, frame: &mut Frame) {
        if self.params.agc_target_rms <= 0.0 {
            return;
        }
        let rms = frame.rms();
        if rms < 1e-6 {
            return;
        }
        let gain = (self.params.agc_target_rms / rms).min(self.params.agc_max_gain);
        for s in frame.samples_mut() {
            *s = (*s * gain).clamp(-1.0, 1.0);
        }
    }
}

impl Stage for VadGate {
    fn name(&self) -> &'static str {
        "conditioning"
    }

    fn push(&mut self, mut frame: Frame, now_ns: u64) -> PushResult {
        self.stats.pushed += 1;
        let rms = frame.rms();
        let speaking = self.classify(rms);
        frame.voice_active = speaking;
        if speaking {
            self.speech_frames += 1;
            self.apply_agc(&mut frame);
        } else {
            self.silence_frames += 1;
        }
        self.queue.push_back(Held {
            ready_at_ns: now_ns + self.params.processing_ns,
            pushed_at_ns: now_ns,
            frame,
        });
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
        self.queue.len()
    }

    fn stats(&self) -> &StageStats {
        &self.stats
    }

    fn reset(&mut self) {
        self.queue.clear();
        self.speaking = false;
        self.above = 0;
        self.below = 0;
    }
}
