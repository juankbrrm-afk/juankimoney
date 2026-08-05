//! The invariant, held across a network.
//!
//! `tests/invariant.rs` proves the scheduler survives an in-process model that
//! fails. That is the easy half. A model behind a socket fails in ways an
//! in-process one cannot: it goes quiet without dying, it dies without saying
//! so, it answers out of order, it answers twice, and it costs the better part
//! of a second to become usable at all.
//!
//! Every test here drives the **full engine** — not the stage in isolation —
//! and asserts the same thing `tests/invariant.rs` does: exact 20 ms cadence,
//! contiguous sequence numbers, zero gaps. The customer must not be able to
//! hear the difference between a healthy GPU and a dead one, except in timbre.

use voice_engine::engine::EngineConfig;
use voice_engine::remote::{
    MockParams, MockTransport, RemoteModelParams, RemoteModelStage, SessionPool,
};
use voice_engine::sim::run_call_with_model;
use voice_engine::stage::Stage;
use voice_engine::LinkState;

const CALL_MS: u64 = 30_000;

/// Mode A timing: 115 ms of pipeline delay, 12 frames in flight (3 chunks of 4
/// beyond the model's inherent depth).
fn params() -> RemoteModelParams {
    RemoteModelParams::for_model(115_000_000, 18)
}

/// A pre-warmed remote stage, ready before the first frame — the state the
/// session pool exists to guarantee.
fn warm_stage(mock: MockParams, seed: u64) -> Box<dyn Stage> {
    let mut stage = RemoteModelStage::new(Box::new(MockTransport::new(mock, seed)), params());
    stage.prewarm(0);
    // Warm it on its own clock before the call starts, exactly as the pool does.
    for t in 0..40u64 {
        stage.poll(t * 20_000_000);
    }
    Box::new(stage)
}

fn assert_cadence(r: &voice_engine::sim::SimulationResult, context: &str) {
    if let Err(e) = &r.cadence {
        panic!("INVARIANT VIOLATED [{context}]: {e}");
    }
}

#[test]
fn a_healthy_remote_model_delivers_like_a_local_one() {
    let r = run_call_with_model(
        EngineConfig::mode_a(201),
        warm_stage(MockParams::colocated(), 1),
        CALL_MS,
        |_, _| {},
    );
    assert_cadence(&r, "healthy remote");
    assert!(
        r.report.scheduler.processed_ratio >= 0.95,
        "remote model delivered only {:.2}% converted audio",
        r.report.scheduler.processed_ratio * 100.0
    );
    assert!(
        r.report.e2e.p50_ms <= 310.0,
        "colocated remote inference should cost almost nothing over local; got {:.1} ms",
        r.report.e2e.p50_ms
    );
}

#[test]
fn the_link_dying_mid_call_does_not_break_the_cadence() {
    // The GPU node is rescheduled 12 seconds in. Everything in flight is lost
    // with the socket, and the client must notice, bypass, and reconnect —
    // without the customer hearing a gap.
    let mock = MockParams {
        die_at_ns: Some(12_000_000_000),
        ..MockParams::colocated()
    };
    let r = run_call_with_model(
        EngineConfig::mode_a(202),
        warm_stage(mock, 2),
        CALL_MS,
        |_, _| {},
    );

    assert_cadence(&r, "link death mid-call");
    assert!(
        r.source_counts.processed > 0,
        "should have converted audio before the link died"
    );
    assert!(
        r.source_counts.bypass > 0,
        "should have fallen back to raw agent audio, got {:?}",
        r.source_counts
    );
    // Bypass, not silence: the customer keeps hearing the agent.
    assert!(
        r.source_counts.conceal < 50,
        "too much concealment after link death: {:?}",
        r.source_counts
    );
}

#[test]
fn a_link_that_goes_quiet_is_declared_dead_rather_than_waited_on() {
    // The nastiest remote failure: the socket is open, the server is gone. No
    // error, no close, just silence. Waiting politely means the whole call is
    // spent holding in-flight slots for replies that never come.
    let mock = MockParams {
        response_loss_probability: 1.0,
        ..MockParams::colocated()
    };
    let r = run_call_with_model(
        EngineConfig::mode_a(203),
        warm_stage(mock, 3),
        CALL_MS,
        |_, _| {},
    );

    assert_cadence(&r, "silent link");
    assert_eq!(
        r.source_counts.processed, 0,
        "nothing ever came back; nothing should have been reported as converted"
    );
    assert!(
        r.source_counts.bypass > 1000,
        "the entire call should have been carried by bypass, got {:?}",
        r.source_counts
    );
}

#[test]
fn intermittent_response_loss_degrades_gracefully() {
    let mock = MockParams {
        response_loss_probability: 0.15,
        ..MockParams::colocated()
    };
    let r = run_call_with_model(
        EngineConfig::mode_a(204),
        warm_stage(mock, 4),
        CALL_MS,
        |_, _| {},
    );
    assert_cadence(&r, "15% response loss");
    // Losses become bypass frames, one for one — not a collapse of the session.
    assert!(
        r.report.scheduler.processed_ratio >= 0.70,
        "15% loss collapsed delivery to {:.2}%",
        r.report.scheduler.processed_ratio * 100.0
    );
}

#[test]
fn out_of_order_and_duplicated_responses_are_handled() {
    // Real streams reorder and, after a retry, duplicate. The scheduler indexes
    // by sequence number so reordering is harmless — but a duplicate must not
    // be counted twice or injected as stale audio.
    // Jitter large enough to shuffle delivery order, small enough that the
    // shuffling itself is the variable under test rather than lateness. With
    // 25 ms of jitter the frames miss their deadlines and the test measures
    // the playout margin instead of the reordering logic.
    let mock = MockParams {
        rtt_jitter_ns: 6_000_000,
        duplicate_probability: 0.10,
        ..MockParams::colocated()
    };
    let r = run_call_with_model(
        EngineConfig::mode_a(205),
        warm_stage(mock, 5),
        CALL_MS,
        |_, _| {},
    );
    assert_cadence(&r, "reordered and duplicated responses");
    assert!(
        r.report.scheduler.processed_ratio >= 0.90,
        "reordering should not cost delivery; got {:.2}%",
        r.report.scheduler.processed_ratio * 100.0
    );
}

#[test]
fn a_cold_start_costs_the_greeting_and_the_bench_says_how_much() {
    // Not pre-warmed. This is the exact failure the session pool exists to
    // prevent (`docs/05`), and this test puts a number on it instead of
    // asserting a policy.
    let stage = RemoteModelStage::new(
        Box::new(MockTransport::new(MockParams::colocated(), 6)),
        params(),
    );
    // No `prewarm` — the link starts connecting only once the call is running.
    let r = run_call_with_model(
        EngineConfig::mode_a(206),
        Box::new(stage),
        CALL_MS,
        |_, _| {},
    );

    assert_cadence(&r, "cold start");

    // 600 ms of warm-up plus reconnect backoff, all of it at the start of the
    // call — which is precisely the greeting.
    let bypass_frames = r.source_counts.bypass;
    assert!(
        bypass_frames >= 25,
        "expected the greeting to go out unconverted; only {bypass_frames} bypass frames"
    );
    // But it recovers, and the rest of the call is converted.
    assert!(
        r.source_counts.processed > 1000,
        "the call should recover once the model is warm, got {:?}",
        r.source_counts
    );
}

#[test]
fn a_prewarmed_session_converts_the_greeting() {
    // The counterpart to the cold-start test, and the justification for paying
    // for idle GPU: with a warm session, the opening seconds are converted.
    let r = run_call_with_model(
        EngineConfig::mode_a(207),
        warm_stage(MockParams::colocated(), 7),
        CALL_MS,
        |_, _| {},
    );
    assert_cadence(&r, "pre-warmed");

    let cold = run_call_with_model(
        EngineConfig::mode_a(207),
        Box::new(RemoteModelStage::new(
            Box::new(MockTransport::new(MockParams::colocated(), 7)),
            params(),
        )),
        CALL_MS,
        |_, _| {},
    );

    assert!(
        r.source_counts.bypass + 20 < cold.source_counts.bypass,
        "pre-warming must measurably reduce unconverted audio: warm {} bypass frames \
         vs cold {}",
        r.source_counts.bypass,
        cold.source_counts.bypass
    );
}

#[test]
fn putting_the_gpu_in_another_region_is_measurably_worse() {
    // `docs/01` requires the GPU next to the media edge. This prices the
    // alternative rather than asserting the rule.
    let near = run_call_with_model(
        EngineConfig::mode_a(208),
        warm_stage(MockParams::colocated(), 8),
        CALL_MS,
        |_, _| {},
    );
    let far = run_call_with_model(
        EngineConfig::mode_a(208),
        warm_stage(MockParams::cross_region(), 8),
        CALL_MS,
        |_, _| {},
    );

    assert_cadence(&far, "cross-region inference");

    // The result is not "somewhat worse". With the playout offset sized for a
    // colocated GPU, a 70 ms hop makes **every** frame miss its deadline and
    // the product delivers nothing but bypass. The call still sounds
    // continuous — the invariant holds — but the customer hears the agent's
    // real voice for the entire call.
    assert!(
        far.report.scheduler.processed_ratio < 0.05,
        "expected near-total delivery failure across a region boundary, got {:.2}%",
        far.report.scheduler.processed_ratio * 100.0
    );
    assert!(
        near.report.scheduler.processed_ratio > 0.95,
        "colocated should be fine: {:.2}%",
        near.report.scheduler.processed_ratio * 100.0
    );
}

#[test]
fn a_cross_region_link_can_only_be_fixed_by_paying_the_latency() {
    // The follow-up to the previous test, and the honest half of the finding.
    //
    // Delivery collapses across a region boundary because the playout offset
    // was sized for the model alone. Size it for the model **plus the measured
    // link** and delivery comes back — but the mouth-to-ear number lands well
    // past the 300 ms the product promises.
    //
    // So there is no configuration that makes a remote-region GPU acceptable.
    // The choice is colocation or a different promise, and `docs/01` treats
    // regional placement as a functional requirement for exactly this reason.
    let mut config = EngineConfig::mode_a(211);
    // 140 ms round trip + 115 ms inference + margin.
    config.playout_offset_ns = Some(330_000_000);

    let r = run_call_with_model(
        config,
        warm_stage(MockParams::cross_region(), 11),
        CALL_MS,
        |_, _| {},
    );

    assert_cadence(&r, "cross-region with a correctly sized offset");
    assert!(
        r.report.scheduler.processed_ratio > 0.95,
        "sizing the offset for the real link should restore delivery, got {:.2}%",
        r.report.scheduler.processed_ratio * 100.0
    );
    assert!(
        r.report.e2e.p50_ms > 380.0,
        "...but it must cost the latency promise; got {:.1} ms, which would mean \
         the budget was never real",
        r.report.e2e.p50_ms
    );
}

#[test]
fn injected_disconnects_are_survivable_repeatedly() {
    // Flapping infrastructure. Every transition exercises reconnection, the
    // in-flight teardown, and the crossfade.
    let r = run_call_with_model(
        EngineConfig::mode_a(209),
        warm_stage(MockParams::colocated(), 9),
        60_000,
        |i, engine| {
            if i > 0 && i % 500 == 0 {
                engine.model_mut().inject_disconnect(i * 20_000_000);
            }
        },
    );
    assert_cadence(&r, "repeated disconnects");
    assert!(
        r.source_counts.processed > 0 && r.source_counts.bypass > 0,
        "should have exercised both paths, got {:?}",
        r.source_counts
    );
}

#[test]
fn the_audio_loop_still_never_allocates_with_a_remote_model() {
    // Frames handed to a transport must come back to the pool, whether they are
    // answered, dropped, or lost with the socket. A leak here would be invisible
    // until a long shift ran the process out of memory.
    let mock = MockParams {
        response_loss_probability: 0.10,
        die_at_ns: Some(40_000_000_000),
        ..MockParams::colocated()
    };
    let r = run_call_with_model(
        EngineConfig::mode_a(210),
        warm_stage(mock, 10),
        90_000,
        |_, _| {},
    );
    assert_cadence(&r, "long remote call");
    assert_eq!(
        r.report.pool_allocated, 1024,
        "pool grew to {} — frames leaked in the transport (high water {})",
        r.report.pool_allocated, r.report.pool_high_water
    );
}

#[test]
fn the_session_pool_keeps_sessions_warm_ahead_of_demand() {
    let mut pool = SessionPool::new(
        4,
        Box::new(|_| Box::new(MockTransport::new(MockParams::colocated(), 21))),
    );
    // Shift starts: warm the pool before the dialer does anything.
    for t in 0..40u64 {
        pool.tick(t * 20_000_000);
    }
    assert_eq!(pool.warm_available(), 4);

    // Four calls connect back to back; every one gets a warm session, and the
    // pool refills behind them.
    for _ in 0..4 {
        let t = pool.acquire(800_000_000);
        assert_eq!(t.state(), LinkState::Ready);
    }
    assert_eq!(
        pool.served_cold(),
        0,
        "no call should have paid a cold start"
    );
    assert_eq!(pool.served_warm(), 4);
}
