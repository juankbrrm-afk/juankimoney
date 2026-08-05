//! Named scenarios, each with the latency budget it is expected to meet.
//!
//! The budgets are lifted straight from `docs/02-pipeline-voz-tiempo-real.md`.
//! Keeping them in code means the budget is a test, not a paragraph somebody
//! wrote once and nobody checks again.

use crate::engine::EngineConfig;
use crate::stages::{ModelParams, NetworkParams};

pub struct Budget {
    /// Added mouth-to-ear latency targets, in milliseconds.
    pub p50_ms: f64,
    pub p95_ms: f64,
    /// Minimum share of output the customer must hear as converted audio.
    pub min_processed_ratio: f64,
}

pub struct Profile {
    pub name: &'static str,
    pub description: &'static str,
    pub config: EngineConfig,
    pub budget: Budget,
}

impl Profile {
    /// The product's headline case: agent on a wired connection, routed to a
    /// regional edge, Mode A conversion.
    pub fn mode_a_good_edge(seed: u64) -> Self {
        Profile {
            name: "mode_a_good_edge",
            description: "Mode A, wired agent, regional edge — the case we sell",
            config: EngineConfig::mode_a(seed),
            budget: Budget {
                p50_ms: 300.0,
                p95_ms: 380.0,
                min_processed_ratio: 0.95,
            },
        }
    }

    /// The realistic case: shared WiFi on a busy floor.
    pub fn mode_a_busy_floor(seed: u64) -> Self {
        Profile {
            name: "mode_a_busy_floor",
            description: "Mode A, shared WiFi, 60 people on the floor",
            config: EngineConfig {
                network: NetworkParams::busy_floor(),
                ..EngineConfig::mode_a(seed)
            },
            budget: Budget {
                p50_ms: 340.0,
                p95_ms: 460.0,
                min_processed_ratio: 0.90,
            },
        }
    }

    /// The failure case, included so the bench can put a number on it: an agent
    /// routed to the wrong region. This single mistake costs more than the
    /// entire GPU stage.
    pub fn mode_a_wrong_region(seed: u64) -> Self {
        Profile {
            name: "mode_a_wrong_region",
            description: "Mode A, agent routed across an ocean — what bad routing costs",
            config: EngineConfig {
                network: NetworkParams::wrong_region(),
                ..EngineConfig::mode_a(seed)
            },
            budget: Budget {
                // Deliberately unreachable. This profile is expected to fail;
                // the point is to quantify by how much.
                p50_ms: 300.0,
                p95_ms: 380.0,
                min_processed_ratio: 0.90,
            },
        }
    }

    /// Mode B: Spanish -> English. Budget reflects the measured ~1025 ms, not
    /// the 300 ms that is physically impossible for translation.
    pub fn mode_b_good_edge(seed: u64) -> Self {
        Profile {
            name: "mode_b_good_edge",
            description: "Mode B, translation, wired agent — measured ~1025 ms",
            config: EngineConfig::mode_b(seed),
            budget: Budget {
                // The spec estimated ~930 ms. The bench measured 1025 ms: the
                // original budget table had no line for the playout margin,
                // which a fixed-playout scheduler cannot do without. `docs/02`
                // has been corrected rather than the number massaged.
                p50_ms: 1050.0,
                p95_ms: 1400.0,
                min_processed_ratio: 0.90,
            },
        }
    }

    /// Mode A with silence-skipping disabled, to price unit-economics lever #4.
    pub fn mode_a_no_silence_skip(seed: u64) -> Self {
        let mut config = EngineConfig::mode_a(seed);
        config.model = ModelParams {
            skip_silence: false,
            ..ModelParams::mode_a()
        };
        Profile {
            name: "mode_a_no_silence_skip",
            description: "Mode A without silence skipping — the cost of lever #4",
            config,
            budget: Budget {
                p50_ms: 300.0,
                p95_ms: 380.0,
                min_processed_ratio: 0.95,
            },
        }
    }

    pub fn all(seed: u64) -> Vec<Profile> {
        vec![
            Profile::mode_a_good_edge(seed),
            Profile::mode_a_busy_floor(seed),
            Profile::mode_a_wrong_region(seed),
            Profile::mode_b_good_edge(seed),
            Profile::mode_a_no_silence_skip(seed),
        ]
    }
}
