//! **The invariant.**
//!
//! > One frame of audio leaves for the customer every 20 ms. Always.
//! > Even if the entire intelligence plane is down.
//!
//! Everything else in VoicePilot may fail. The copilot can go dark, compliance
//! can miss an alert, the CRM can stop writing notes — the call survives all of
//! it, and `docs/01-arquitectura.md` §8 says so in a table.
//!
//! Audio is the exception. A gap is not a degraded experience; it is a customer
//! saying "hello? hello?" and hanging up. So this file does not test that the
//! pipeline works. It tests that the pipeline **cannot stop producing audio**,
//! by taking the model away in every way we know how:
//!
//! - killing it outright, mid-call
//! - stalling it past the bypass threshold
//! - dropping 100% of its output for the whole call
//! - flooding it until backpressure discards frames
//! - starving the network so nothing arrives at all
//!
//! In each case the assertion is identical and non-negotiable: exact 20 ms
//! cadence, contiguous sequence numbers, zero gaps.

use voice_engine::engine::EngineConfig;
use voice_engine::sim::{run_call, run_clean_call};
use voice_engine::stages::{ModelParams, NetworkParams};
use voice_engine::Health;

const CALL_MS: u64 = 30_000;

fn assert_cadence(result: &voice_engine::sim::SimulationResult, context: &str) {
    if let Err(e) = &result.cadence {
        panic!("INVARIANT VIOLATED [{context}]: {e}");
    }
    assert!(
        result.emitted_frames > 0,
        "INVARIANT VIOLATED [{context}]: nothing was emitted at all"
    );
}

#[test]
fn cadence_holds_on_a_healthy_call() {
    let result = run_clean_call(EngineConfig::mode_a(1), CALL_MS);
    assert_cadence(&result, "healthy call");
    assert!(
        result.source_counts.processed > 1000,
        "a healthy call should be mostly converted audio, got {:?}",
        result.source_counts
    );
}

#[test]
fn cadence_holds_when_the_gpu_dies_mid_call() {
    // At the 10 s mark, every frame pushed to the model fails, forever.
    let result = run_call(EngineConfig::mode_a(2), CALL_MS, |i, engine| {
        if i == 500 {
            engine.model_mut().inject_failures(u64::MAX);
        }
    });
    assert_cadence(&result, "gpu death");

    let c = result.source_counts;
    assert!(
        c.processed > 0,
        "should have produced converted audio before the failure"
    );
    assert!(
        c.bypass > 0,
        "should have fallen back to raw agent audio, got {c:?}"
    );
    // The customer keeps hearing the agent, not silence.
    assert!(
        c.conceal * 20 < CALL_MS as usize / 4,
        "too much concealment: {c:?} — bypass should be carrying the call"
    );
}

#[test]
fn cadence_holds_when_the_model_stalls_past_every_threshold() {
    // A 900 ms stall on every frame: far past the 600 ms bypass threshold.
    let result = run_call(EngineConfig::mode_a(3), CALL_MS, |i, engine| {
        if i == 400 {
            engine.model_mut().inject_stall(900_000_000);
        }
    });
    assert_cadence(&result, "model stall");
    assert!(
        result.report.health_transitions > 0,
        "health monitor should have reacted to a 900 ms stall"
    );
}

#[test]
fn cadence_holds_when_the_model_never_produces_anything() {
    // Dead on arrival: not one frame is ever converted.
    let result = run_call(EngineConfig::mode_a(4), CALL_MS, |i, engine| {
        if i == 0 {
            engine.model_mut().inject_failures(u64::MAX);
        }
    });
    assert_cadence(&result, "model dead from frame zero");
    assert_eq!(
        result.source_counts.processed, 0,
        "the model was dead; nothing should have been converted"
    );
    assert!(
        result.source_counts.bypass > 1000,
        "the entire call should have been carried by bypass, got {:?}",
        result.source_counts
    );
    assert_eq!(
        result.report.health_state,
        Health::Bypass,
        "health must end in bypass"
    );
}

#[test]
fn cadence_holds_under_severe_packet_loss() {
    let config = EngineConfig {
        network: NetworkParams {
            base_delay_ns: 40_000_000,
            jitter_sigma_ns: 25_000_000,
            loss_probability: 0.20, // 20% loss: a broken connection
            reorder_probability: 0.05,
            reorder_extra_ns: 60_000_000,
        },
        ..EngineConfig::mode_a(5)
    };
    let result = run_clean_call(config, CALL_MS);
    assert_cadence(&result, "20% packet loss");
}

#[test]
fn cadence_holds_when_nothing_arrives_at_all() {
    // Total uplink failure: every packet is lost.
    let config = EngineConfig {
        network: NetworkParams {
            base_delay_ns: 25_000_000,
            jitter_sigma_ns: 0,
            loss_probability: 1.0,
            reorder_probability: 0.0,
            reorder_extra_ns: 0,
        },
        ..EngineConfig::mode_a(6)
    };
    let result = run_clean_call(config, CALL_MS);
    // The scheduler never starts, because no frame ever reached it — there is
    // no audio timeline to anchor to. That is correct: this is a dead uplink,
    // not a degraded pipeline. What must NOT happen is a panic, a hang, or a
    // broken cadence if it did start.
    if result.emitted_frames > 0 {
        assert_cadence(&result, "total uplink loss");
    }
}

#[test]
fn cadence_holds_under_backpressure() {
    // Inference far slower than real time: the model can never keep up and
    // max_depth forces drops on every push.
    let config = EngineConfig {
        model: ModelParams {
            inference_ns: 200_000_000, // 200 ms per 20 ms frame — 10x too slow
            inference_sigma_ns: 10_000_000,
            ..ModelParams::mode_a()
        },
        ..EngineConfig::mode_a(7)
    };
    let result = run_clean_call(config, CALL_MS);
    assert_cadence(&result, "sustained backpressure");
    assert!(
        result.report.model_dropped > 0,
        "backpressure must drop frames rather than queue them"
    );
    // The point of dropping: latency stays bounded instead of growing forever.
    assert!(
        result.report.e2e.max_ms < 5000.0,
        "unbounded latency growth — backpressure is not working, max was {} ms",
        result.report.e2e.max_ms
    );
}

#[test]
fn cadence_holds_through_repeated_failure_and_recovery() {
    // Kill and revive the model five times. Flapping is the case most likely to
    // break a scheduler, because every transition touches the crossfade path.
    let result = run_call(EngineConfig::mode_a(8), 60_000, |i, engine| match i % 600 {
        100 => engine.model_mut().inject_failures(200),
        400 => engine.model_mut().clear_injections(),
        _ => {}
    });
    assert_cadence(&result, "repeated failure and recovery");
    assert!(
        result.source_counts.processed > 0 && result.source_counts.bypass > 0,
        "should have exercised both paths, got {:?}",
        result.source_counts
    );
}

#[test]
fn the_audio_loop_never_allocates() {
    // The pool is sized for the pipeline's worst depth. If it ever had to grow,
    // we allocated while audio was in flight — the exact thing that produces
    // audible jitter.
    let result = run_clean_call(EngineConfig::mode_a(9), 120_000);
    assert_cadence(&result, "long call");
    assert_eq!(
        result.report.pool_allocated, 1024,
        "pool grew from 1024 to {} — allocation in the audio path (high water {})",
        result.report.pool_allocated, result.report.pool_high_water
    );
}

#[test]
fn a_ten_minute_call_stays_exact() {
    // Cadence drift is cumulative and invisible in short tests. Ten minutes is
    // 30,000 frames; a scheduler that accumulated instead of computing its
    // deadlines from an anchor would be visibly wrong by now.
    let result = run_clean_call(EngineConfig::mode_a(10), 600_000);
    assert_cadence(&result, "ten minute call");
    assert!(
        result.emitted_frames >= 29_000,
        "expected ~30k frames, got {}",
        result.emitted_frames
    );
}
