//! Deterministic PRNG for latency and loss simulation.
//!
//! Seeded, reproducible, and dependency-free. A flaky latency test is worse
//! than no latency test: it trains the team to re-run CI until it goes green,
//! and then a real regression slips through the same door. Same seed, same
//! numbers, on every machine and every run.

pub struct Rng {
    state: u64,
}

impl Rng {
    pub fn new(seed: u64) -> Self {
        // Any non-zero state; xorshift64* is degenerate at zero.
        Rng {
            state: if seed == 0 { 0x9E3779B97F4A7C15 } else { seed },
        }
    }

    #[inline]
    pub fn next_u64(&mut self) -> u64 {
        let mut x = self.state;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        self.state = x;
        x.wrapping_mul(0x2545F4914F6CDD1D)
    }

    /// Uniform in [0, 1).
    #[inline]
    pub fn next_f64(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 / (1u64 << 53) as f64
    }

    /// Uniform in [0, n).
    #[inline]
    pub fn below(&mut self, n: u64) -> u64 {
        if n == 0 {
            0
        } else {
            self.next_u64() % n
        }
    }

    /// True with probability `p`.
    #[inline]
    pub fn chance(&mut self, p: f64) -> bool {
        self.next_f64() < p
    }

    /// Approximate standard normal via sum of 12 uniforms (Irwin-Hall).
    /// Good enough to model network jitter and inference variance; we are not
    /// doing statistics, we are stressing a scheduler.
    pub fn next_normal(&mut self) -> f64 {
        let mut sum = 0.0;
        for _ in 0..12 {
            sum += self.next_f64();
        }
        sum - 6.0
    }

    /// Non-negative normal sample, in nanoseconds.
    pub fn jitter_ns(&mut self, sigma_ns: u64) -> u64 {
        if sigma_ns == 0 {
            return 0;
        }
        let v = self.next_normal() * sigma_ns as f64;
        if v < 0.0 {
            0
        } else {
            v as u64
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_seed_same_sequence() {
        let mut a = Rng::new(42);
        let mut b = Rng::new(42);
        for _ in 0..100 {
            assert_eq!(a.next_u64(), b.next_u64());
        }
    }

    #[test]
    fn different_seeds_diverge() {
        let mut a = Rng::new(1);
        let mut b = Rng::new(2);
        assert_ne!(a.next_u64(), b.next_u64());
    }

    #[test]
    fn f64_stays_in_unit_interval() {
        let mut r = Rng::new(7);
        for _ in 0..10_000 {
            let v = r.next_f64();
            assert!((0.0..1.0).contains(&v));
        }
    }

    #[test]
    fn chance_is_roughly_calibrated() {
        let mut r = Rng::new(9);
        let hits = (0..100_000).filter(|_| r.chance(0.10)).count();
        assert!((8_000..12_000).contains(&hits), "hits = {hits}");
    }
}
