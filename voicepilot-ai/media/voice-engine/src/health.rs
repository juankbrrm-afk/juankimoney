//! Voice pipeline health, as an explicit state machine.
//!
//! From `docs/05-flujo-de-llamada.md`:
//!
//! ```text
//! processing --(p95 > 400ms)--> degraded --(p95 > 600ms | hard error)--> bypass
//!            <--(healthy 5s)--            <--(healthy 5s + 200ms crossfade)--
//! ```
//!
//! Two design points that are easy to get wrong:
//!
//! **Decisions come from a sliding window, not the whole call.** A call that
//! was fine for nine minutes and is drowning now must read as drowning. Whole
//! call statistics would hide it until the call is over and the customer is
//! gone.
//!
//! **Recovery requires a sustained hold.** Without it, a pipeline hovering at
//! the threshold flaps between processed and raw audio, and the customer hears
//! the agent's voice change every few seconds. Flapping is worse than staying
//! in bypass: bypass is one timbre change, flapping is many.

use crate::metrics::Window;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Health {
    /// Converted audio is going to the customer.
    Processing,
    /// Still converting, but latency is above target. The agent is told to slow
    /// down before the customer notices anything.
    Degraded,
    /// Raw agent audio is going to the customer. The agent must be told,
    /// loudly: their real voice is on the line.
    Bypass,
}

impl Health {
    pub fn as_str(&self) -> &'static str {
        match self {
            Health::Processing => "processing",
            Health::Degraded => "degraded",
            Health::Bypass => "bypass",
        }
    }
}

pub struct HealthParams {
    pub degraded_threshold_ns: u64,
    pub bypass_threshold_ns: u64,
    /// How long the pipeline must stay healthy before we trust it again.
    pub recovery_hold_ns: u64,
    /// Samples in the decision window.
    pub window_frames: usize,
    /// Consecutive **hard** failures (drops, errors) that force bypass without
    /// waiting for p95.
    pub failure_burst_to_bypass: u32,
    /// Share of frames missing their deadline that counts as degraded.
    pub late_rate_degraded: f64,
    /// Share of frames missing their deadline that counts as broken.
    pub late_rate_bypass: f64,
}

impl Default for HealthParams {
    fn default() -> Self {
        HealthParams {
            degraded_threshold_ns: 400_000_000,
            bypass_threshold_ns: 600_000_000,
            recovery_hold_ns: 5_000_000_000,
            // 100 frames = 2 s of audio.
            window_frames: 100,
            failure_burst_to_bypass: 5,
            late_rate_degraded: 0.15,
            late_rate_bypass: 0.50,
        }
    }
}

pub struct HealthMonitor {
    params: HealthParams,
    window: Window,
    /// 1 per frame that missed its deadline, 0 per frame that made it. Its mean
    /// is the late rate.
    late_window: Window,
    state: Health,
    healthy_since_ns: Option<u64>,
    consecutive_failures: u32,
    transitions: Vec<(u64, Health)>,
    time_in_bypass_ns: u64,
    last_eval_ns: u64,
}

impl HealthMonitor {
    pub fn new(params: HealthParams) -> Self {
        let window = Window::new(params.window_frames);
        let late_window = Window::new(params.window_frames);
        HealthMonitor {
            params,
            window,
            late_window,
            state: Health::Processing,
            healthy_since_ns: None,
            consecutive_failures: 0,
            transitions: Vec::new(),
            time_in_bypass_ns: 0,
            last_eval_ns: 0,
        }
    }

    pub fn state(&self) -> Health {
        self.state
    }

    pub fn transitions(&self) -> &[(u64, Health)] {
        &self.transitions
    }

    /// Total nanoseconds the customer spent hearing raw audio. Written to
    /// `calls.bypass_ms`; it is the quality metric the customer-facing SLA is
    /// built on.
    pub fn time_in_bypass_ns(&self) -> u64 {
        self.time_in_bypass_ns
    }

    /// A frame completed the processed path with this end-to-end latency.
    pub fn record_success(&mut self, latency_ns: u64, now_ns: u64) {
        self.consecutive_failures = 0;
        self.window.push(latency_ns);
        self.late_window.push(0);
        self.evaluate(now_ns);
    }

    /// A frame arrived, but after its playout deadline.
    ///
    /// Deliberately **not** a hard failure. The scheduler already handles a
    /// late frame gracefully by emitting bypass for that one frame; latching
    /// the whole pipeline into bypass because a few frames were late is a
    /// wild over-reaction, and the bench measured exactly what it costs: three
    /// transient GPU stalls, 250 ms each, put a Mode B call into bypass for
    /// **21 of its 60 seconds**. The stalls were worth 750 ms of degradation;
    /// the over-reaction turned that into 21 seconds.
    ///
    /// Lateness is a rate signal instead. A handful of late frames is noise;
    /// a sustained share of them is a pipeline that genuinely cannot keep up.
    pub fn record_late(&mut self, now_ns: u64) {
        self.late_window.push(1);
        self.evaluate(now_ns);
    }

    /// A frame failed to complete: dropped, lost, or never produced.
    pub fn record_failure(&mut self, now_ns: u64) {
        self.consecutive_failures += 1;
        self.late_window.push(1);
        if self.consecutive_failures >= self.params.failure_burst_to_bypass {
            self.transition(Health::Bypass, now_ns);
            self.healthy_since_ns = None;
        }
        self.accrue_bypass(now_ns);
    }

    fn accrue_bypass(&mut self, now_ns: u64) {
        if self.state == Health::Bypass && self.last_eval_ns != 0 && now_ns > self.last_eval_ns {
            self.time_in_bypass_ns += now_ns - self.last_eval_ns;
        }
        self.last_eval_ns = now_ns;
    }

    fn evaluate(&mut self, now_ns: u64) {
        self.accrue_bypass(now_ns);

        if self.window.len() < 10 {
            return; // Not enough evidence to judge anything.
        }
        let p95 = self.window.quantile(0.95);
        let late_rate = self.late_window.mean();

        let unhealthy =
            p95 > self.params.degraded_threshold_ns || late_rate > self.params.late_rate_degraded;
        if unhealthy {
            self.healthy_since_ns = None;
        } else if self.healthy_since_ns.is_none() {
            self.healthy_since_ns = Some(now_ns);
        }

        let next =
            if p95 > self.params.bypass_threshold_ns || late_rate > self.params.late_rate_bypass {
                Health::Bypass
            } else if unhealthy {
                // Never go straight from bypass to processing on one good sample.
                if self.state == Health::Bypass {
                    Health::Bypass
                } else {
                    Health::Degraded
                }
            } else {
                match self.state {
                    Health::Processing => Health::Processing,
                    Health::Degraded | Health::Bypass => {
                        let held = self
                            .healthy_since_ns
                            .map(|s| now_ns.saturating_sub(s) >= self.params.recovery_hold_ns)
                            .unwrap_or(false);
                        if held {
                            Health::Processing
                        } else {
                            self.state
                        }
                    }
                }
            };

        self.transition(next, now_ns);
    }

    fn transition(&mut self, next: Health, now_ns: u64) {
        if next != self.state {
            self.state = next;
            self.transitions.push((now_ns, next));
        }
    }

    pub fn reset(&mut self) {
        self.window.clear();
        self.late_window.clear();
        self.state = Health::Processing;
        self.healthy_since_ns = None;
        self.consecutive_failures = 0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn monitor() -> HealthMonitor {
        HealthMonitor::new(HealthParams::default())
    }

    #[test]
    fn healthy_latency_stays_processing() {
        let mut m = monitor();
        for i in 0..200u64 {
            m.record_success(270_000_000, i * 20_000_000);
        }
        assert_eq!(m.state(), Health::Processing);
    }

    #[test]
    fn crossing_the_degraded_threshold_degrades() {
        let mut m = monitor();
        for i in 0..200u64 {
            m.record_success(450_000_000, i * 20_000_000);
        }
        assert_eq!(m.state(), Health::Degraded);
    }

    #[test]
    fn crossing_the_bypass_threshold_bypasses() {
        let mut m = monitor();
        for i in 0..200u64 {
            m.record_success(800_000_000, i * 20_000_000);
        }
        assert_eq!(m.state(), Health::Bypass);
    }

    #[test]
    fn a_burst_of_failures_bypasses_immediately() {
        let mut m = monitor();
        for i in 0..5u64 {
            m.record_failure(i * 20_000_000);
        }
        assert_eq!(m.state(), Health::Bypass);
    }

    #[test]
    fn recovery_requires_a_sustained_hold_not_one_good_frame() {
        let mut m = monitor();
        let mut t = 0u64;
        for _ in 0..200 {
            m.record_success(800_000_000, t);
            t += 20_000_000;
        }
        assert_eq!(m.state(), Health::Bypass);

        // Two seconds of good latency: not enough.
        for _ in 0..100 {
            m.record_success(250_000_000, t);
            t += 20_000_000;
        }
        assert_eq!(
            m.state(),
            Health::Bypass,
            "recovered too eagerly; this is what causes audible flapping"
        );

        // Past the 5 s hold: now we trust it. The hold is counted from when
        // the *window* became healthy, which lags the first good sample by
        // roughly a window length — so this needs to be comfortably longer
        // than 5 s of samples, not exactly 5 s.
        for _ in 0..400 {
            m.record_success(250_000_000, t);
            t += 20_000_000;
        }
        assert_eq!(m.state(), Health::Processing);
    }

    #[test]
    fn bypass_time_is_accrued() {
        let mut m = monitor();
        let mut t = 0u64;
        for _ in 0..200 {
            m.record_success(900_000_000, t);
            t += 20_000_000;
        }
        assert_eq!(m.state(), Health::Bypass);
        let before = m.time_in_bypass_ns();
        for _ in 0..100 {
            m.record_success(900_000_000, t);
            t += 20_000_000;
        }
        assert!(m.time_in_bypass_ns() > before);
    }
}
