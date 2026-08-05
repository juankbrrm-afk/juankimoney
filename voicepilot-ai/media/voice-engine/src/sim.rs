//! Call simulation: synthetic speech in, measured report out.
//!
//! Generates audio with the property that actually matters for this pipeline —
//! **speech and silence alternate the way a sales call does.** A generator that
//! emits continuous tone would make the VAD look useless and the GPU cost look
//! twice as high as it is. Agents talk in bursts, and the gaps are where a
//! third of our margin lives.
//!
//! Frequency content is a rough voiced-speech model (fundamental plus
//! harmonics, with an amplitude envelope and a noise floor). It is not meant to
//! sound like a person: it is meant to have realistic energy dynamics, which is
//! all the VAD and the scheduler can see.

use crate::clock::Clock;
use crate::clock::TestClock;
use crate::engine::{verify_cadence, EmittedRecord, EngineConfig, Report, VoiceEngine};
use crate::frame::{FRAME_NS, FRAME_SAMPLES, SAMPLE_RATE_HZ};
use crate::rng::Rng;
use crate::scheduler::{Emitted, Source};

pub struct SpeechGenerator {
    rng: Rng,
    phase: f32,
    f0: f32,
    speaking: bool,
    remaining_frames: u32,
    envelope: f32,
}

impl SpeechGenerator {
    pub fn new(seed: u64) -> Self {
        SpeechGenerator {
            rng: Rng::new(seed),
            phase: 0.0,
            f0: 120.0,
            speaking: false,
            remaining_frames: 0,
            envelope: 0.0,
        }
    }

    fn next_segment(&mut self) {
        self.speaking = !self.speaking;
        self.remaining_frames = if self.speaking {
            // Speech bursts: 1.5 s to 5 s.
            75 + self.rng.below(175) as u32
        } else {
            // Pauses: 0.4 s to 2.4 s.
            20 + self.rng.below(100) as u32
        };
        if self.speaking {
            // Pitch drifts between utterances.
            self.f0 = 95.0 + self.rng.next_f64() as f32 * 70.0;
        }
    }

    pub fn is_speaking(&self) -> bool {
        self.speaking
    }

    /// Fills one 20 ms frame.
    pub fn fill(&mut self, out: &mut [f32]) {
        if self.remaining_frames == 0 {
            self.next_segment();
        }
        self.remaining_frames -= 1;

        let target = if self.speaking { 0.30 } else { 0.0 };
        let dt = 1.0 / SAMPLE_RATE_HZ as f32;

        for s in out.iter_mut().take(FRAME_SAMPLES) {
            // Smooth envelope, so word onsets are not step functions.
            self.envelope += (target - self.envelope) * 0.002;

            self.phase += 2.0 * std::f32::consts::PI * self.f0 * dt;
            if self.phase > 2.0 * std::f32::consts::PI {
                self.phase -= 2.0 * std::f32::consts::PI;
            }

            let voiced = self.phase.sin()
                + 0.5 * (2.0 * self.phase).sin()
                + 0.25 * (3.0 * self.phase).sin()
                + 0.12 * (4.0 * self.phase).sin();

            // Room and line noise, always present. This is what a bad VAD
            // threshold trips on.
            let noise = (self.rng.next_f64() as f32 - 0.5) * 0.004;

            *s = (voiced * 0.25 * self.envelope + noise).clamp(-1.0, 1.0);
        }
    }
}

pub struct SimulationResult {
    pub report: Report,
    pub emitted_frames: usize,
    pub cadence: Result<(), String>,
    pub source_counts: SourceCounts,
}

#[derive(Default, Clone, Copy, Debug)]
pub struct SourceCounts {
    pub processed: usize,
    pub bypass: usize,
    pub conceal: usize,
    pub crossfade: usize,
}

/// Runs a call of `duration_ms` through the engine on a virtual clock.
///
/// `on_frame` is called with (frame_index, &mut engine) before each capture,
/// which is how chaos tests kill the GPU at a chosen moment.
pub fn run_call<F>(config: EngineConfig, duration_ms: u64, on_frame: F) -> SimulationResult
where
    F: FnMut(u64, &mut VoiceEngine),
{
    let seed = config.seed;
    let engine = VoiceEngine::new(config);
    drive(engine, seed, duration_ms, on_frame)
}

/// Same, with a caller-supplied model stage — an in-process simulation, a
/// remote gRPC client, or anything else implementing [`crate::stage::Stage`].
pub fn run_call_with_model<F>(
    config: EngineConfig,
    model: Box<dyn crate::stage::Stage>,
    duration_ms: u64,
    on_frame: F,
) -> SimulationResult
where
    F: FnMut(u64, &mut VoiceEngine),
{
    let seed = config.seed;
    let engine = VoiceEngine::with_model(config, model);
    drive(engine, seed, duration_ms, on_frame)
}

fn drive<F>(
    mut engine: VoiceEngine,
    seed: u64,
    duration_ms: u64,
    mut on_frame: F,
) -> SimulationResult
where
    F: FnMut(u64, &mut VoiceEngine),
{
    let clock = TestClock::new();
    let mut gen = SpeechGenerator::new(seed ^ 0xBEEF);

    let total_frames = duration_ms / crate::frame::FRAME_MS;
    let mut buf = vec![0.0f32; FRAME_SAMPLES];
    let mut out: Vec<Emitted> = Vec::with_capacity(64);
    let mut all: Vec<EmittedRecord> = Vec::with_capacity(total_frames as usize + 64);

    for i in 0..total_frames {
        clock.advance_ns(FRAME_NS);
        let now = clock.now_ns();

        on_frame(i, &mut engine);

        gen.fill(&mut buf);
        engine.capture(&buf, now);

        // Frames are recorded and released within the tick. Retaining them
        // would pin pooled buffers for the whole call and turn the
        // no-allocation test into a test of this loop.
        out.clear();
        engine.tick(now, &mut out);
        all.extend(out.iter().map(EmittedRecord::from));
    }

    // Drain exactly what is still in flight — no more. Ticking past that
    // point emits concealment over an empty pipeline, which is correct
    // behaviour but would show up in the report as a quality problem that
    // does not exist.
    for _ in 0..engine.drain_ticks() {
        clock.advance_ns(FRAME_NS);
        out.clear();
        engine.tick(clock.now_ns(), &mut out);
        all.extend(out.iter().map(EmittedRecord::from));
    }
    out.clear();

    let mut counts = SourceCounts::default();
    for e in &all {
        match e.source {
            Source::Processed => counts.processed += 1,
            Source::Bypass => counts.bypass += 1,
            Source::Conceal => counts.conceal += 1,
            Source::Crossfade => counts.crossfade += 1,
        }
    }

    SimulationResult {
        cadence: verify_cadence(&all),
        emitted_frames: all.len(),
        source_counts: counts,
        report: engine.report(),
    }
}

/// Convenience wrapper for a call with no injected faults.
pub fn run_clean_call(config: EngineConfig, duration_ms: u64) -> SimulationResult {
    run_call(config, duration_ms, |_, _| {})
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generator_alternates_speech_and_silence() {
        let mut g = SpeechGenerator::new(3);
        let mut buf = vec![0.0f32; FRAME_SAMPLES];
        let mut speech = 0;
        let mut silence = 0;
        for _ in 0..3000 {
            g.fill(&mut buf);
            if g.is_speaking() {
                speech += 1;
            } else {
                silence += 1;
            }
        }
        assert!(speech > 0 && silence > 0, "must produce both");
        let ratio = speech as f64 / (speech + silence) as f64;
        assert!(
            (0.4..0.9).contains(&ratio),
            "speech ratio {ratio} is not call-like"
        );
    }

    #[test]
    fn generated_speech_is_bounded() {
        let mut g = SpeechGenerator::new(11);
        let mut buf = vec![0.0f32; FRAME_SAMPLES];
        for _ in 0..500 {
            g.fill(&mut buf);
            for &s in buf.iter() {
                assert!(s.is_finite() && (-1.0..=1.0).contains(&s));
            }
        }
    }
}
