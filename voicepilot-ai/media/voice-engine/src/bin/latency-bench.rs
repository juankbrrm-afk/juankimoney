//! `latency-bench` — measures the mouth-to-ear latency budget from
//! `docs/02-pipeline-voz-tiempo-real.md` and prints it as a table.
//!
//! Usage:
//!
//! ```text
//! cargo run --release --bin latency-bench                 # all profiles, 60 s each
//! cargo run --release --bin latency-bench -- --seconds 300
//! cargo run --release --bin latency-bench -- --profile mode_a_good_edge
//! cargo run --release --bin latency-bench -- --seed 7 --verbose
//! ```
//!
//! Exit code is non-zero if any profile expected to pass its budget did not,
//! which is what makes this runnable from CI as a regression gate.

use std::process::ExitCode;

use voice_engine::profile::Profile;
use voice_engine::sim::run_clean_call;

struct Args {
    seconds: u64,
    seed: u64,
    profile: Option<String>,
    verbose: bool,
    sweep: bool,
}

fn parse_args() -> Args {
    let mut args = Args {
        seconds: 60,
        seed: 20260805,
        profile: None,
        verbose: false,
        sweep: false,
    };
    let argv: Vec<String> = std::env::args().skip(1).collect();
    let mut i = 0;
    while i < argv.len() {
        match argv[i].as_str() {
            "--seconds" | "-s" => {
                i += 1;
                args.seconds = argv.get(i).and_then(|v| v.parse().ok()).unwrap_or(60);
            }
            "--seed" => {
                i += 1;
                args.seed = argv.get(i).and_then(|v| v.parse().ok()).unwrap_or(20260805);
            }
            "--profile" | "-p" => {
                i += 1;
                args.profile = argv.get(i).cloned();
            }
            "--verbose" | "-v" => args.verbose = true,
            "--sweep" => args.sweep = true,
            "--help" | "-h" => {
                println!(
                    "latency-bench [--seconds N] [--seed N] [--profile NAME] [--verbose] [--sweep]"
                );
                std::process::exit(0);
            }
            other => eprintln!("warning: ignoring unknown argument {other}"),
        }
        i += 1;
    }
    args
}

fn main() -> ExitCode {
    let args = parse_args();
    let duration_ms = args.seconds * 1000;

    println!();
    println!("VoicePilot AI — Voice Engine latency bench");
    println!("Fase 0, modulo 0.1  ·  budget source: docs/02-pipeline-voz-tiempo-real.md");
    println!(
        "call duration {} s per profile  ·  seed {}",
        args.seconds, args.seed
    );
    println!();

    let profiles: Vec<Profile> = Profile::all(args.seed)
        .into_iter()
        .filter(|p| args.profile.as_deref().map_or(true, |want| p.name == want))
        .collect();

    if profiles.is_empty() {
        eprintln!("no profile matched");
        return ExitCode::FAILURE;
    }

    if args.sweep {
        return sweep(profiles, duration_ms);
    }

    let mut failures = 0;

    for profile in profiles {
        // This profile exists to quantify a known-bad setup; it is reported but
        // never counted as a failure.
        let informational = profile.name == "mode_a_wrong_region";
        let name = profile.name;
        let description = profile.description;
        let budget_p50 = profile.budget.p50_ms;
        let budget_p95 = profile.budget.p95_ms;
        let budget_ratio = profile.budget.min_processed_ratio;

        let result = run_clean_call(profile.config, duration_ms);
        let r = &result.report;

        println!("─────────────────────────────────────────────────────────────────────");
        println!("{name}");
        println!("{description}");
        println!();

        println!("  Added mouth-to-ear latency");
        println!(
            "    p50   {:>8.1} ms   budget {:>7.1} ms   {}",
            r.e2e.p50_ms,
            budget_p50,
            verdict(r.e2e.p50_ms <= budget_p50, informational)
        );
        println!(
            "    p95   {:>8.1} ms   budget {:>7.1} ms   {}",
            r.e2e.p95_ms,
            budget_p95,
            verdict(r.e2e.p95_ms <= budget_p95, informational)
        );
        println!("    p99   {:>8.1} ms", r.e2e.p99_ms);
        println!("    max   {:>8.1} ms", r.e2e.max_ms);
        println!();

        println!("  Per-stage residence (p50 / p95)");
        for s in &r.stages {
            println!(
                "    {:<16} {:>7.1} ms / {:>7.1} ms   pushed {:>6}  dropped {:>5}",
                s.name, s.residence.p50_ms, s.residence.p95_ms, s.pushed, s.dropped
            );
        }
        println!();

        println!("  What the customer actually heard");
        println!(
            "    processed   {:>7} ({:.2}%)",
            r.scheduler.from_processed,
            r.scheduler.processed_ratio * 100.0
        );
        println!("    bypass      {:>7}", r.scheduler.from_bypass);
        println!("    crossfade   {:>7}", r.scheduler.from_crossfade);
        println!("    concealed   {:>7}", r.scheduler.from_conceal);
        println!(
            "    ratio       {:>7.4}   floor {:.2}   {}",
            r.scheduler.processed_ratio,
            budget_ratio,
            verdict(r.scheduler.processed_ratio >= budget_ratio, informational)
        );
        println!();

        println!("  Cost signals");
        println!(
            "    speech ratio            {:.1}%  (GPU only pays for this)",
            r.speech_ratio * 100.0
        );
        println!("    model invocations       {}", r.model_processed);
        println!("    silent frames skipped   {}", r.model_skipped_silence);
        let total_model = r.model_processed + r.model_skipped_silence;
        if total_model > 0 {
            println!(
                "    GPU saved by skipping   {:.1}%",
                r.model_skipped_silence as f64 / total_model as f64 * 100.0
            );
        }
        println!();

        println!("  Health & integrity");
        println!("    final state             {}", r.health_state.as_str());
        println!("    transitions             {}", r.health_transitions);
        println!("    time in bypass          {:.0} ms", r.bypass_ms);
        println!(
            "    jitter buffer target    {} frames",
            r.jitter_target_depth
        );
        println!("    measured net jitter     {:.1} ms", r.jitter_estimate_ms);
        println!("    packets lost            {}", r.network_lost);
        println!(
            "    pool allocations        {} (high water {})  {}",
            r.pool_allocated,
            r.pool_high_water,
            if r.pool_allocated <= 1024 {
                "✓ no hot-path allocation"
            } else {
                "✗ ALLOCATED IN HOT PATH"
            }
        );
        match &result.cadence {
            Ok(()) => println!(
                "    cadence                 ✓ exact 20 ms across {} frames",
                result.emitted_frames
            ),
            Err(e) => {
                println!("    cadence                 ✗ {e}");
                failures += 1;
            }
        }
        println!();

        if args.verbose {
            println!("  Detail");
            println!("    frames captured         {}", r.frames_captured);
            println!("    conceal events          {}", r.conceal_events);
            println!("    jitter-buffer conceal   {}", r.jitter_concealed);
            println!("    model frames dropped    {}", r.model_dropped);
            println!("    late processed dropped  {}", r.scheduler.late_discarded);
            println!();
        }

        let passed = r.e2e.p50_ms <= budget_p50
            && r.e2e.p95_ms <= budget_p95
            && r.scheduler.processed_ratio >= budget_ratio;

        if informational {
            println!("  ⓘ informational profile — quantifies a known-bad setup, not a gate\n");
        } else if passed {
            println!("  ✓ within budget\n");
        } else {
            println!("  ✗ OVER BUDGET\n");
            failures += 1;
        }
    }

    println!("─────────────────────────────────────────────────────────────────────");
    if failures == 0 {
        println!("All gated profiles within budget.");
        ExitCode::SUCCESS
    } else {
        println!("{failures} gated profile(s) over budget.");
        ExitCode::FAILURE
    }
}

fn verdict(ok: bool, informational: bool) -> &'static str {
    if informational {
        "ⓘ"
    } else if ok {
        "✓"
    } else {
        "✗"
    }
}

/// Finds the smallest playout offset that still delivers converted audio.
///
/// Mouth-to-ear latency in a fixed-playout scheduler is **constant by
/// construction**: it is the playout offset plus the fixed ingress and egress
/// terms. Pipeline variance does not show up as latency jitter — it shows up as
/// frames that miss their deadline and fall back to bypass.
///
/// That makes the playout offset the single latency knob in the system, and
/// choosing it is a real engineering trade rather than a guess: too small and
/// the converted audio stops arriving in time, too large and we hand away
/// budget for nothing. This sweep prices the trade instead of arguing about it.
fn sweep(profiles: Vec<Profile>, duration_ms: u64) -> ExitCode {
    for profile in profiles {
        println!("─────────────────────────────────────────────────────────────────────");
        println!("{}  ·  playout offset sweep", profile.name);
        println!("{}", profile.description);
        println!();
        println!("   offset     mouth-to-ear    processed   concealed   verdict");
        println!("   ──────     ────────────    ─────────   ─────────   ───────");

        let mut best: Option<(u64, f64)> = None;

        // Sweep around the profile's own default rather than a fixed range:
        // Mode A needs ~165 ms and Mode B ~860 ms, so any absolute range is
        // meaningless for one of them.
        let base_ms = (clone_config(&profile).effective_playout_offset() / 1_000_000).max(20);
        let lo = (base_ms * 40 / 100).max(20);
        let hi = base_ms * 170 / 100;
        let step = ((hi - lo) / 15).max(5);

        for offset_ms in (lo..=hi).step_by(step as usize) {
            let mut config = clone_config(&profile);
            config.playout_offset_ns = Some(offset_ms * 1_000_000);
            let r = run_clean_call(config, duration_ms);
            let ratio = r.report.scheduler.processed_ratio;
            let ok = ratio >= 0.99;
            if ok && best.is_none() {
                best = Some((offset_ms, r.report.e2e.p50_ms));
            }
            println!(
                "   {:>4} ms     {:>8.1} ms    {:>7.2}%   {:>9}   {}",
                offset_ms,
                r.report.e2e.p50_ms,
                ratio * 100.0,
                r.report.scheduler.from_conceal,
                if ok { "✓" } else { "✗ too tight" }
            );
        }

        println!();
        match best {
            Some((offset, e2e)) => {
                println!("   → smallest viable offset: {offset} ms  ⇒  {e2e:.1} ms mouth-to-ear\n")
            }
            None => println!("   → no offset in range kept the processed ratio above 99%\n"),
        }
    }
    ExitCode::SUCCESS
}

/// Rebuilds a profile's config. `EngineConfig` is not `Clone` because the
/// params it holds are one-shot builders; rebuilding by name keeps the sweep
/// honest about which profile it is measuring.
fn clone_config(profile: &Profile) -> voice_engine::EngineConfig {
    use voice_engine::EngineConfig;
    match profile.name {
        "mode_b_good_edge" => EngineConfig::mode_b(profile.config.seed),
        "mode_a_busy_floor" => EngineConfig {
            network: voice_engine::stages::NetworkParams::busy_floor(),
            ..EngineConfig::mode_a(profile.config.seed)
        },
        "mode_a_wrong_region" => EngineConfig {
            network: voice_engine::stages::NetworkParams::wrong_region(),
            ..EngineConfig::mode_a(profile.config.seed)
        },
        _ => EngineConfig::mode_a(profile.config.seed),
    }
}
