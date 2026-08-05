//! Audio frames and the pool that recycles them.
//!
//! Hard rule from `docs/02-pipeline-voz-tiempo-real.md`: **no allocations in
//! the audio loop.** Allocator pressure turns into jitter, and jitter at 20 ms
//! granularity is audible. Every buffer is allocated once, at startup, and
//! recycled through the pool for the lifetime of the call.
//!
//! `Frame` returns its buffer to the pool on `Drop`, so a frame that a stage
//! discards is recycled automatically — there is no way to leak one by
//! forgetting to release it, and no way for a discarded frame to cost an
//! allocation later.
//!
//! The pool is `Rc`-based and therefore **not** `Send`. That is deliberate: one
//! call is processed by one thread. Concurrency lives between calls, never
//! inside one.

use std::cell::RefCell;
use std::rc::Rc;

/// Internal processing rate. Telephony is 8 kHz, but the conversion model and
/// the conditioning chain run at 24 kHz; downsampling happens at the egress.
pub const SAMPLE_RATE_HZ: u32 = 24_000;

/// Frame duration. Matches the Opus frame size used on the wire, so no
/// re-framing is needed between the network and the pipeline.
pub const FRAME_MS: u64 = 20;

/// Samples per frame: 24 kHz * 20 ms = 480.
pub const FRAME_SAMPLES: usize = (SAMPLE_RATE_HZ as usize * FRAME_MS as usize) / 1000;

/// Frame duration in nanoseconds.
pub const FRAME_NS: u64 = FRAME_MS * 1_000_000;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Speaker {
    Agent,
    Customer,
    System,
}

struct PoolInner {
    free: Vec<Box<[f32]>>,
    /// Total buffers ever allocated. If this grows after warm-up, the pool was
    /// undersized and we allocated in the hot path — a test failure, not a
    /// performance note.
    allocated: usize,
    in_flight: usize,
    high_water: usize,
}

/// Recycling pool of fixed-size audio buffers.
#[derive(Clone)]
pub struct FramePool {
    inner: Rc<RefCell<PoolInner>>,
}

impl FramePool {
    /// Pre-allocates `capacity` buffers. Size it for the deepest the pipeline
    /// can get: sum of every stage's max depth, plus the scheduler's window.
    pub fn with_capacity(capacity: usize) -> Self {
        let mut free = Vec::with_capacity(capacity);
        for _ in 0..capacity {
            free.push(vec![0.0f32; FRAME_SAMPLES].into_boxed_slice());
        }
        FramePool {
            inner: Rc::new(RefCell::new(PoolInner {
                free,
                allocated: capacity,
                in_flight: 0,
                high_water: 0,
            })),
        }
    }

    pub fn acquire(&self, seq: u64, capture_ts_ns: u64, speaker: Speaker) -> Frame {
        let buf = {
            let mut inner = self.inner.borrow_mut();
            let buf = match inner.free.pop() {
                Some(b) => b,
                None => {
                    // Pool exhausted. In production this is a bug; we still
                    // serve the frame rather than drop audio, but the counter
                    // makes it impossible to miss.
                    inner.allocated += 1;
                    vec![0.0f32; FRAME_SAMPLES].into_boxed_slice()
                }
            };
            inner.in_flight += 1;
            if inner.in_flight > inner.high_water {
                inner.high_water = inner.in_flight;
            }
            buf
        };
        Frame {
            seq,
            capture_ts_ns,
            speaker,
            voice_active: false,
            buf: Some(buf),
            pool: Rc::clone(&self.inner),
        }
    }

    /// Acquires a frame filled with silence.
    pub fn acquire_silent(&self, seq: u64, capture_ts_ns: u64, speaker: Speaker) -> Frame {
        let mut f = self.acquire(seq, capture_ts_ns, speaker);
        f.samples_mut().fill(0.0);
        f
    }

    /// Total buffers ever allocated. Equal to the initial capacity iff the pool
    /// never had to allocate in the hot path.
    pub fn allocated(&self) -> usize {
        self.inner.borrow().allocated
    }

    pub fn in_flight(&self) -> usize {
        self.inner.borrow().in_flight
    }

    /// Peak simultaneous frames. Used to size the pool honestly.
    pub fn high_water(&self) -> usize {
        self.inner.borrow().high_water
    }
}

/// One 20 ms slice of mono audio, carrying the timestamps that make end-to-end
/// latency measurable rather than estimated.
pub struct Frame {
    pub seq: u64,
    /// Nanosecond timestamp of capture at the microphone. Travels with the
    /// frame through every stage and back out — this is what makes latency a
    /// measurement instead of a sum of guesses. See `docs/04-apis.md` §5.
    pub capture_ts_ns: u64,
    pub speaker: Speaker,
    pub voice_active: bool,
    buf: Option<Box<[f32]>>,
    pool: Rc<RefCell<PoolInner>>,
}

impl Frame {
    pub fn samples(&self) -> &[f32] {
        self.buf.as_ref().expect("frame buffer taken")
    }

    pub fn samples_mut(&mut self) -> &mut [f32] {
        self.buf.as_mut().expect("frame buffer taken")
    }

    /// Copies this frame into a new one from the same pool. Used to keep the
    /// raw audio alongside the processed audio, so bypass always has something
    /// real to fall back to.
    pub fn duplicate(&self) -> Frame {
        let pool = FramePool {
            inner: Rc::clone(&self.pool),
        };
        let mut f = pool.acquire(self.seq, self.capture_ts_ns, self.speaker);
        f.voice_active = self.voice_active;
        f.samples_mut().copy_from_slice(self.samples());
        f
    }

    pub fn rms(&self) -> f32 {
        let s = self.samples();
        if s.is_empty() {
            return 0.0;
        }
        let sum: f32 = s.iter().map(|v| v * v).sum();
        (sum / s.len() as f32).sqrt()
    }

    pub fn peak(&self) -> f32 {
        self.samples().iter().fold(0.0f32, |a, v| a.max(v.abs()))
    }
}

impl Drop for Frame {
    fn drop(&mut self) {
        if let Some(buf) = self.buf.take() {
            let mut inner = self.pool.borrow_mut();
            inner.in_flight -= 1;
            inner.free.push(buf);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frame_geometry_matches_wire_format() {
        assert_eq!(FRAME_SAMPLES, 480);
        assert_eq!(FRAME_NS, 20_000_000);
    }

    #[test]
    fn dropped_frames_return_to_the_pool() {
        let pool = FramePool::with_capacity(4);
        {
            let _a = pool.acquire(0, 0, Speaker::Agent);
            let _b = pool.acquire(1, 0, Speaker::Agent);
            assert_eq!(pool.in_flight(), 2);
        }
        assert_eq!(pool.in_flight(), 0);
        assert_eq!(pool.allocated(), 4, "recycling must not allocate");
    }

    #[test]
    fn exhausting_the_pool_is_visible_not_silent() {
        let pool = FramePool::with_capacity(1);
        let _a = pool.acquire(0, 0, Speaker::Agent);
        let _b = pool.acquire(1, 0, Speaker::Agent);
        assert_eq!(pool.allocated(), 2, "hot-path allocation must be counted");
        assert_eq!(pool.high_water(), 2);
    }

    #[test]
    fn duplicate_copies_samples_and_metadata() {
        let pool = FramePool::with_capacity(4);
        let mut a = pool.acquire(7, 1234, Speaker::Agent);
        a.voice_active = true;
        a.samples_mut()[0] = 0.5;
        let b = a.duplicate();
        assert_eq!(b.seq, 7);
        assert_eq!(b.capture_ts_ns, 1234);
        assert!(b.voice_active);
        assert_eq!(b.samples()[0], 0.5);
    }
}
