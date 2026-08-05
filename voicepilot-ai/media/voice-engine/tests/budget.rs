//! The latency budget from `docs/02-pipeline-voz-tiempo-real.md`, as tests.
//!
//! A budget written in a document is a paragraph someone wrote once and nobody
//! checks again. A budget written as a test fails the build the day someone
//! adds 40 ms to a stage. These are the same numbers, in the form that has
//! consequences.
//!
//! Every number here is produced by the modelled pipeline, not by a GPU. When
//! the real conversion model lands it replaces `ModelStage` and these tests
//! immediately say whether it fits — which is the entire reason module 0.1 is
//! built before the model instead of after it.

use voice_engine::engine::EngineConfig;
use voice_engine::sim::run_clean_call;
use voice_engine::stages::{ModelParams, NetworkParams};
use voice_engine::Health;

const CALL_MS: u64 = 60_000;

#[test]
fn mode_a_meets_the_headline_latency_promise() {
    let r = run_clean_call(EngineConfig::mode_a(101), CALL_MS);
    assert!(r.cadence.is_ok(), "{:?}", r.cadence);

    assert!(
        r.report.e2e.p50_ms <= 300.0,
        "Mode A p50 was {:.1} ms; the product promises under 300 ms",
        r.report.e2e.p50_ms
    );
    assert!(
        r.report.e2e.p95_ms <= 380.0,
        "Mode A p95 was {:.1} ms",
        r.report.e2e.p95_ms
    );
    assert!(
        r.report.scheduler.processed_ratio >= 0.95,
        "only {:.2}% of audio was converted; the rest was bypass or concealment",
        r.report.scheduler.processed_ratio * 100.0
    );
    assert_eq!(
        r.report.health_state,
        Health::Processing,
        "a healthy call must end in the processing state"
    );
}

#[test]
fn mode_a_still_works_on_a_busy_floor() {
    // Shared WiFi with 60 people on it. This is the realistic case, and the one
    // that decides whether the product survives contact with a real call centre.
    let config = EngineConfig {
        network: NetworkParams::busy_floor(),
        ..EngineConfig::mode_a(102)
    };
    let r = run_clean_call(config, CALL_MS);
    assert!(r.cadence.is_ok(), "{:?}", r.cadence);
    assert!(
        r.report.e2e.p95_ms <= 460.0,
        "busy floor p95 was {:.1} ms",
        r.report.e2e.p95_ms
    );
    assert!(
        r.report.scheduler.processed_ratio >= 0.90,
        "busy floor delivered only {:.2}% converted audio",
        r.report.scheduler.processed_ratio * 100.0
    );
}

#[test]
fn mode_b_lands_where_the_specification_says_it_will() {
    // ~900 ms, not 300 ms. `docs/02` explains why translation cannot be faster:
    // emitted audio cannot be retracted, so the commit policy has to wait for
    // meaning to resolve. This test exists to keep that number honest in both
    // directions — it must not silently drift upward either.
    let r = run_clean_call(EngineConfig::mode_b(103), CALL_MS);
    assert!(r.cadence.is_ok(), "{:?}", r.cadence);
    assert!(
        r.report.e2e.p50_ms <= 1050.0,
        "Mode B p50 was {:.1} ms; the corrected budget is ~1025 ms",
        r.report.e2e.p50_ms
    );
    assert!(
        r.report.e2e.p50_ms >= 700.0,
        "Mode B p50 of {:.1} ms is suspiciously fast — the wait-k commit policy \
         is probably not being modelled, and a translation that commits early \
         is one that can contradict the agent",
        r.report.e2e.p50_ms
    );
    assert!(
        r.report.scheduler.processed_ratio >= 0.90,
        "Mode B delivered only {:.2}% translated audio",
        r.report.scheduler.processed_ratio * 100.0
    );
}

#[test]
fn routing_an_agent_to_the_wrong_region_blows_the_entire_budget() {
    // Not a regression test — a documented cost. This single operational
    // mistake costs more latency than the whole GPU stage, which is why
    // regional edge placement is a functional requirement in `docs/01` and not
    // an optimisation.
    let good = run_clean_call(EngineConfig::mode_a(104), 30_000)
        .report
        .e2e
        .p50_ms;
    let bad = run_clean_call(
        EngineConfig {
            network: NetworkParams::wrong_region(),
            ..EngineConfig::mode_a(104)
        },
        30_000,
    )
    .report
    .e2e
    .p50_ms;

    assert!(
        bad >= good + 90.0,
        "wrong-region routing should cost around 100 ms; measured {:.1} ms vs {:.1} ms",
        bad,
        good
    );
    assert!(
        bad > 380.0,
        "wrong-region routing measured {bad:.1} ms — expected it to break the p95 budget"
    );
}

#[test]
fn skipping_silence_saves_real_gpu_time() {
    // Unit-economics lever #4 (`docs/11`). Claimed at ~15%; this measures it.
    let r = run_clean_call(EngineConfig::mode_a(105), CALL_MS);
    let total = r.report.model_processed + r.report.model_skipped_silence;
    let saved = r.report.model_skipped_silence as f64 / total as f64;

    assert!(
        saved >= 0.15,
        "silence skipping saved only {:.1}% of inference; the lever is claimed at ~15%",
        saved * 100.0
    );
    // And it must not cost quality: skipped frames still have to be delivered.
    assert!(
        r.report.scheduler.processed_ratio >= 0.95,
        "silence skipping degraded delivery to {:.2}%",
        r.report.scheduler.processed_ratio * 100.0
    );
}

#[test]
fn a_healthy_call_drops_nothing_to_backpressure() {
    // This is the regression guard for the bug this module found: the
    // backpressure threshold was specified as an absolute queue depth of 3,
    // but a streaming model holds ~6 frames by construction. That mis-specified
    // rule discarded 46% of a perfectly healthy call as if it were congestion.
    let r = run_clean_call(EngineConfig::mode_a(106), CALL_MS);
    assert_eq!(
        r.report.model_dropped, 0,
        "a healthy call dropped {} frames at the model — backpressure is \
         misconfigured against the model's inherent pipeline depth",
        r.report.model_dropped
    );
}

#[test]
fn a_model_slower_than_real_time_is_caught_immediately() {
    // Real-time factor above 1.0 means the stage can never catch up. It must
    // surface as bypass and dropped frames within seconds, not as latency that
    // creeps up over a ten-minute call while nobody notices.
    let config = EngineConfig {
        model: ModelParams {
            chunk_frames: 4,
            inference_ns: 160_000_000, // 160 ms per 80 ms chunk: RTF 2.0
            ..ModelParams::mode_a()
        },
        ..EngineConfig::mode_a(107)
    };
    let r = run_clean_call(config, 30_000);

    assert!(r.cadence.is_ok(), "{:?}", r.cadence);
    assert!(
        r.report.model_dropped > 0,
        "an oversubscribed model must shed load, not accumulate it"
    );
    assert!(
        r.report.e2e.max_ms < 2000.0,
        "latency reached {:.0} ms — backpressure failed to bound it",
        r.report.e2e.max_ms
    );
    assert!(
        r.report.scheduler.from_bypass > 0,
        "the customer should have been carried by bypass"
    );
}

#[test]
fn the_jitter_buffer_adapts_to_the_network_it_is_given() {
    // Fixed-depth jitter buffers are the classic way to quietly lose the
    // latency budget: sized for the worst network, paid for by every agent.
    let quiet = run_clean_call(EngineConfig::mode_a(108), CALL_MS);
    let noisy = run_clean_call(
        EngineConfig {
            network: NetworkParams::busy_floor(),
            ..EngineConfig::mode_a(108)
        },
        CALL_MS,
    );

    assert!(
        noisy.report.jitter_target_depth >= quiet.report.jitter_target_depth,
        "buffer should deepen on a worse network: quiet {} frames, noisy {} frames",
        quiet.report.jitter_target_depth,
        noisy.report.jitter_target_depth
    );
    assert!(
        noisy.report.jitter_estimate_ms > quiet.report.jitter_estimate_ms,
        "jitter estimate should track the actual network"
    );
}
