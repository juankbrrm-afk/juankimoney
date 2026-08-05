//! **The exit criterion for module 0.1.**
//!
//! From `docs/10-roadmap.md`: *"Banco de latencia instrumentado — medición
//! punto a punto con precisión ±5 ms."*
//!
//! A latency harness that is itself inaccurate is worse than none: it produces
//! confident numbers that send the team optimising the wrong stage for a month.
//! So before the harness is allowed to make any claim about the pipeline, it
//! has to prove it can measure a latency it was *told* in advance.
//!
//! Three independent checks:
//!
//! 1. **Absolute** — with every source of variance removed, the measured value
//!    must equal the analytically derived one.
//! 2. **Differential** — when a known latency is added, the measurement must
//!    move by exactly that much. This catches a constant offset bug, which an
//!    absolute check alone can hide.
//! 3. **Quantisation** — the histogram's own resolution error must be well
//!    inside the tolerance.

use voice_engine::clock::ns_to_ms_f;
use voice_engine::engine::EngineConfig;
use voice_engine::frame::FRAME_NS;
use voice_engine::sim::run_clean_call;

/// The requirement, in milliseconds.
const TOLERANCE_MS: f64 = 5.0;

/// Under `EngineConfig::calibration` the network is instant, the jitter buffer
/// holds one frame, conditioning costs nothing and egress is zero. The only
/// latency left is the capture buffer plus the playout offset — both known
/// exactly, so the expected measurement can be derived rather than observed.
fn expected_ms(model_latency_ns: u64) -> f64 {
    // playout offset (set to model + one frame) + the 20 ms capture buffer.
    ns_to_ms_f(model_latency_ns + FRAME_NS + FRAME_NS)
}

#[test]
fn measurement_matches_a_known_ground_truth() {
    for model_ms in [40u64, 80, 120, 200, 350] {
        let model_ns = model_ms * 1_000_000;
        let result = run_clean_call(EngineConfig::calibration(model_ns), 20_000);

        assert!(
            result.cadence.is_ok(),
            "cadence broken during calibration: {:?}",
            result.cadence
        );
        assert!(
            result.report.e2e.count > 500,
            "not enough measured frames to judge accuracy: {}",
            result.report.e2e.count
        );

        let measured = result.report.e2e.p50_ms;
        let expected = expected_ms(model_ns);
        let error = (measured - expected).abs();

        assert!(
            error <= TOLERANCE_MS,
            "model {model_ms} ms: measured {measured:.2} ms, expected {expected:.2} ms, \
             error {error:.2} ms exceeds the ±{TOLERANCE_MS} ms requirement"
        );
    }
}

#[test]
fn measurement_tracks_a_known_change_exactly() {
    // A constant offset bug passes an absolute check if the expectation is
    // derived from the same wrong assumption. Differential measurement does not
    // care about offsets — only about whether the instrument has unit gain.
    let base_ns = 100_000_000u64;
    let base = run_clean_call(EngineConfig::calibration(base_ns), 20_000)
        .report
        .e2e
        .p50_ms;

    for added_ms in [20u64, 60, 100, 240] {
        let added_ns = added_ms * 1_000_000;
        let measured = run_clean_call(EngineConfig::calibration(base_ns + added_ns), 20_000)
            .report
            .e2e
            .p50_ms;

        let observed_delta = measured - base;
        let error = (observed_delta - added_ms as f64).abs();

        assert!(
            error <= TOLERANCE_MS,
            "added {added_ms} ms of known latency, instrument reported \
             {observed_delta:.2} ms — gain error {error:.2} ms"
        );
    }
}

#[test]
fn repeated_runs_are_bit_identical() {
    // Determinism is what makes a latency regression in CI actionable rather
    // than something to re-run until it passes.
    let a = run_clean_call(EngineConfig::mode_a(4242), 30_000);
    let b = run_clean_call(EngineConfig::mode_a(4242), 30_000);

    assert_eq!(a.emitted_frames, b.emitted_frames);
    assert_eq!(a.report.e2e.p50_ms, b.report.e2e.p50_ms);
    assert_eq!(a.report.e2e.p95_ms, b.report.e2e.p95_ms);
    assert_eq!(a.report.model_processed, b.report.model_processed);
    assert_eq!(a.source_counts.processed, b.source_counts.processed);
    assert_eq!(a.source_counts.bypass, b.source_counts.bypass);
}

#[test]
fn different_seeds_produce_different_calls() {
    // Guards against a determinism implementation so aggressive that the seed
    // stopped mattering — which would make every "different scenario" the same
    // scenario wearing a different name.
    let a = run_clean_call(EngineConfig::mode_a(1), 30_000);
    let b = run_clean_call(EngineConfig::mode_a(2), 30_000);
    assert_ne!(
        a.report.model_processed, b.report.model_processed,
        "seeds must produce genuinely different calls"
    );
}

#[test]
fn the_reported_latency_is_not_secretly_constant_across_configs() {
    // Mouth-to-ear latency is constant *within* a configuration by design. It
    // must not be constant *across* configurations, or the instrument is
    // reporting its own settings back rather than measuring anything.
    let fast = run_clean_call(EngineConfig::mode_a(11), 30_000)
        .report
        .e2e
        .p50_ms;
    let slow = run_clean_call(EngineConfig::mode_b(11), 30_000)
        .report
        .e2e
        .p50_ms;
    assert!(
        slow > fast + 300.0,
        "Mode B ({slow:.1} ms) should be far slower than Mode A ({fast:.1} ms)"
    );
}
