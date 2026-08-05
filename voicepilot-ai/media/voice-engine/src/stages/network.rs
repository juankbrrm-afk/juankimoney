//! Ingress network simulation: delay, jitter, loss, reordering.
//!
//! Models the agent's uplink (stage 2 of the Mode A budget in `docs/02`).
//! Without it the jitter buffer has nothing to absorb and the whole bench
//! reports fictional numbers — a call-centre floor on shared WiFi is exactly
//! where our latency budget goes to die, so it has to be in the model.

use std::collections::VecDeque;

use crate::frame::Frame;
use crate::metrics::StageStats;
use crate::rng::Rng;
use crate::stage::{record_drop, record_exit, DropReason, PushResult, Stage};

pub struct NetworkParams {
    pub base_delay_ns: u64,
    pub jitter_sigma_ns: u64,
    pub loss_probability: f64,
    /// Probability that a frame is delayed by an extra burst, which is what
    /// actually produces reordering on real networks.
    pub reorder_probability: f64,
    pub reorder_extra_ns: u64,
}

impl NetworkParams {
    /// Wired connection, agent routed to a regional edge.
    pub fn good_edge() -> Self {
        NetworkParams {
            base_delay_ns: 25_000_000,
            jitter_sigma_ns: 3_000_000,
            loss_probability: 0.001,
            reorder_probability: 0.001,
            reorder_extra_ns: 15_000_000,
        }
    }

    /// Shared WiFi on a busy floor. The realistic case, not the demo case.
    pub fn busy_floor() -> Self {
        NetworkParams {
            base_delay_ns: 35_000_000,
            jitter_sigma_ns: 12_000_000,
            loss_probability: 0.008,
            reorder_probability: 0.01,
            reorder_extra_ns: 40_000_000,
        }
    }

    /// Agent routed to the wrong region. Included because it is the single
    /// most common way the latency budget is blown in production, and the
    /// bench should be able to show exactly what it costs.
    pub fn wrong_region() -> Self {
        NetworkParams {
            base_delay_ns: 140_000_000,
            jitter_sigma_ns: 20_000_000,
            loss_probability: 0.005,
            reorder_probability: 0.02,
            reorder_extra_ns: 50_000_000,
        }
    }

    pub fn perfect() -> Self {
        NetworkParams {
            base_delay_ns: 0,
            jitter_sigma_ns: 0,
            loss_probability: 0.0,
            reorder_probability: 0.0,
            reorder_extra_ns: 0,
        }
    }
}

struct InFlight {
    arrives_at_ns: u64,
    pushed_at_ns: u64,
    frame: Frame,
}

pub struct NetworkStage {
    params: NetworkParams,
    rng: Rng,
    in_flight: Vec<InFlight>,
    ready: VecDeque<(u64, Frame)>,
    stats: StageStats,
    lost: u64,
}

impl NetworkStage {
    pub fn new(params: NetworkParams, seed: u64) -> Self {
        NetworkStage {
            params,
            rng: Rng::new(seed),
            in_flight: Vec::with_capacity(64),
            ready: VecDeque::with_capacity(64),
            stats: StageStats::new("network"),
            lost: 0,
        }
    }

    pub fn lost(&self) -> u64 {
        self.lost
    }
}

impl Stage for NetworkStage {
    fn name(&self) -> &'static str {
        "network"
    }

    fn push(&mut self, frame: Frame, now_ns: u64) -> PushResult {
        self.stats.pushed += 1;

        if self.rng.chance(self.params.loss_probability) {
            self.lost += 1;
            return record_drop(&mut self.stats, DropReason::Failure);
        }

        let mut delay = self.params.base_delay_ns + self.rng.jitter_ns(self.params.jitter_sigma_ns);
        if self.rng.chance(self.params.reorder_probability) {
            delay += self.params.reorder_extra_ns;
        }

        // No ordering guarantee: that is the whole point of a network stage.
        self.in_flight.push(InFlight {
            arrives_at_ns: now_ns + delay,
            pushed_at_ns: now_ns,
            frame,
        });
        PushResult::Accepted
    }

    fn poll(&mut self, now_ns: u64) -> Option<Frame> {
        let mut i = 0;
        while i < self.in_flight.len() {
            if self.in_flight[i].arrives_at_ns <= now_ns {
                let item = self.in_flight.swap_remove(i);
                record_exit(&mut self.stats, item.pushed_at_ns, now_ns);
                self.ready.push_back((item.arrives_at_ns, item.frame));
            } else {
                i += 1;
            }
        }
        // Frames that became due in the same tick leave in arrival order.
        if self.ready.len() > 1 {
            let mut v: Vec<(u64, Frame)> = self.ready.drain(..).collect();
            v.sort_by_key(|(t, _)| *t);
            self.ready.extend(v);
        }
        self.ready.pop_front().map(|(_, f)| f)
    }

    fn depth(&self) -> usize {
        self.in_flight.len() + self.ready.len()
    }

    fn stats(&self) -> &StageStats {
        &self.stats
    }

    fn reset(&mut self) {
        self.in_flight.clear();
        self.ready.clear();
    }
}
