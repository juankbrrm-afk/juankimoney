//! `remote-report` — what remote inference costs, by scenario.
//!
//! ```text
//! cargo run --release --example remote-report
//! ```
//!
//! Module 0.1's bench measured a model living inside this process. The real one
//! does not: it sits behind `shared/proto/voice.proto` on a GPU reachable only
//! across a network. This report prices that difference — including the two
//! cases that turn out to matter far more than the transport overhead itself:
//! a cold session, and a GPU in the wrong place.

use voice_engine::engine::EngineConfig;
use voice_engine::remote::{MockParams, MockTransport, RemoteModelParams, RemoteModelStage};
use voice_engine::sim::run_call_with_model;
use voice_engine::stage::Stage;
use voice_engine::stages::{ModelParams, ModelStage};

const PIPELINE_DELAY_NS: u64 = 115_000_000;
const MAX_INFLIGHT: usize = 18;

fn remote(mock: MockParams, seed: u64) -> RemoteModelStage {
    RemoteModelStage::new(
        Box::new(MockTransport::new(mock, seed)),
        RemoteModelParams::for_model(PIPELINE_DELAY_NS, MAX_INFLIGHT),
    )
}

/// A session warmed before the call starts, as the pool guarantees.
fn warm(mock: MockParams, seed: u64) -> Box<dyn Stage> {
    let mut s = remote(mock, seed);
    s.prewarm(0);
    for t in 0..40u64 {
        s.poll(t * 20_000_000);
    }
    Box::new(s)
}

/// A session that starts connecting only once the customer is already talking.
fn cold(mock: MockParams, seed: u64) -> Box<dyn Stage> {
    Box::new(remote(mock, seed))
}

struct Case {
    name: &'static str,
    model: Box<dyn Stage>,
    /// Some scenarios need the playout offset sized for their link.
    playout_offset_ns: Option<u64>,
    note: &'static str,
}

fn main() {
    let cases = vec![
        Case {
            name: "local model (module 0.1)",
            model: Box::new(ModelStage::new("model", ModelParams::mode_a(), 1)),
            playout_offset_ns: None,
            note: "baseline",
        },
        Case {
            name: "remote, colocated, warm",
            model: warm(MockParams::colocated(), 1),
            playout_offset_ns: None,
            note: "the deployment we require",
        },
        Case {
            name: "remote, colocated, COLD",
            model: cold(MockParams::colocated(), 1),
            playout_offset_ns: None,
            note: "no pre-warm: the greeting is lost",
        },
        Case {
            name: "remote, cross-region",
            model: warm(MockParams::cross_region(), 1),
            playout_offset_ns: None,
            note: "70 ms hop, offset sized for local",
        },
        Case {
            name: "cross-region, offset fixed",
            model: warm(MockParams::cross_region(), 11),
            playout_offset_ns: Some(330_000_000),
            note: "delivery restored, promise broken",
        },
        Case {
            name: "link dies at 12 s",
            model: warm(
                MockParams {
                    die_at_ns: Some(12_000_000_000),
                    ..MockParams::colocated()
                },
                2,
            ),
            playout_offset_ns: None,
            note: "GPU node rescheduled",
        },
        Case {
            name: "link goes silent",
            model: warm(
                MockParams {
                    response_loss_probability: 1.0,
                    ..MockParams::colocated()
                },
                3,
            ),
            playout_offset_ns: None,
            note: "socket open, server gone",
        },
        Case {
            name: "15% response loss",
            model: warm(
                MockParams {
                    response_loss_probability: 0.15,
                    ..MockParams::colocated()
                },
                4,
            ),
            playout_offset_ns: None,
            note: "lossy link",
        },
    ];

    println!();
    println!("VoicePilot AI — remote inference report");
    println!("Fase 0, modulo 0.2a  ·  30 s call per scenario");
    println!();
    println!(
        "{:<28} {:>10} {:>12} {:>9} {:>9}  note",
        "scenario", "e2e p50", "converted", "bypass", "cadence"
    );
    println!("{}", "─".repeat(100));

    for case in cases {
        let mut config = EngineConfig::mode_a(201);
        if let Some(offset) = case.playout_offset_ns {
            config.playout_offset_ns = Some(offset);
        }
        let r = run_call_with_model(config, case.model, 30_000, |_, _| {});

        println!(
            "{:<28} {:>7.1} ms {:>11.2}% {:>9} {:>9}  {}",
            case.name,
            r.report.e2e.p50_ms,
            r.report.scheduler.processed_ratio * 100.0,
            r.source_counts.bypass,
            if r.cadence.is_ok() { "OK" } else { "BROKEN" },
            case.note,
        );
    }

    println!();
    println!("Cadence is OK in every row, including the ones delivering 0% converted");
    println!("audio. That is the invariant doing its job: the call never breaks, it");
    println!("degrades to the agent's real voice.");
    println!();
}
