//! Remote inference: the seam where the model stops being in-process.
//!
//! `ModelStage` simulates a model that lives inside this process. The real one
//! does not. It sits behind `shared/proto/voice.proto`, on a GPU in another
//! rack, reachable only across a network — and that difference is not a detail
//! of transport. It introduces failure modes the in-process stage cannot have:
//!
//! | In-process | Remote |
//! |---|---|
//! | A call either returns or panics | A request can vanish with no reply, ever |
//! | Responses arrive in order | Responses arrive out of order, or twice |
//! | Available immediately | Costs 300-900 ms to warm up |
//! | Fails visibly | Fails by going quiet |
//!
//! That last row is the dangerous one. A dead link and a slow model look
//! identical from the client, and the difference decides whether to wait or to
//! bypass. So this module never infers liveness from silence: every in-flight
//! frame carries a deadline, the protocol requires an explicit `Dropped` rather
//! than silence, and a link that misses its deadlines is declared dead and
//! reconnected rather than hoped over.
//!
//! Everything here is poll-driven and allocation-free in steady state, like the
//! rest of the engine. No async runtime, no threads: the caller owns the clock,
//! so a mid-call disconnect and its reconnection are exactly reproducible in a
//! test.

use std::collections::{BTreeMap, VecDeque};

use crate::frame::Frame;
use crate::metrics::StageStats;
use crate::rng::Rng;
use crate::stage::{record_drop, record_exit, DropReason, PushResult, Stage};

// ---------------------------------------------------------------------------
// Transport contract
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum LinkState {
    /// No connection attempted or the previous one is gone.
    Cold,
    /// Connected, model loading. Audio sent now would be lost.
    Warming,
    /// `SessionReady` received. Safe to send audio.
    Ready,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum SendError {
    /// The link is not `Ready`. Sending anyway would drop the audio silently.
    NotReady,
    /// The link died between the last poll and this send.
    LinkDown,
}

pub enum TransportEvent {
    /// The session finished warming and may now receive audio.
    Ready { pipeline_delay_ns: u64 },
    /// A converted frame came back.
    Frame(Frame),
    /// The server explicitly declined this sequence number. Explicit refusal is
    /// worth a round trip: it frees the in-flight slot now instead of at
    /// timeout, and it distinguishes "the model refused" from "the link died".
    Dropped { seq: u64 },
    /// The link is gone. Everything in flight on it is lost.
    Lost,
}

/// A bidirectional stream to a `VoiceProcessor`.
///
/// Deliberately poll-based rather than async. The engine advances on a 20 ms
/// tick it already owns; handing that control to an async runtime would make
/// mid-call disconnects untestable and drag in a scheduler whose pauses we do
/// not control.
pub trait Transport {
    fn state(&self) -> LinkState;

    /// Begins connecting and warming. Idempotent while already warming.
    fn connect(&mut self, now_ns: u64);

    /// Sends one frame. Takes ownership: on a real transport the frame is
    /// serialised and gone, and on link loss it is lost with the link — which
    /// is exactly what must be modelled.
    fn send(&mut self, frame: Frame, now_ns: u64) -> Result<(), SendError>;

    fn poll(&mut self, now_ns: u64) -> Option<TransportEvent>;

    fn disconnect(&mut self, now_ns: u64);
}

// ---------------------------------------------------------------------------
// The stage
// ---------------------------------------------------------------------------

pub struct RemoteModelParams {
    /// Frames allowed in flight. Sized from the model's pipeline depth plus
    /// slack, in chunks — see `ModelParams::backpressure_slack`.
    pub max_inflight: usize,

    /// How long a frame may be in flight before it is written off.
    ///
    /// This is the number that turns "the link went quiet" into an actionable
    /// fact. Too short and a healthy stall becomes a fake failure; too long and
    /// a dead link keeps consuming in-flight slots while the customer hears
    /// nothing. Set it from the model's pipeline delay plus real headroom, not
    /// from a round number.
    pub response_timeout_ns: u64,

    /// Consecutive timeouts before the link is declared dead. One timeout is a
    /// hiccup; a run of them is a corpse.
    pub timeouts_to_declare_dead: u32,

    pub initial_backoff_ns: u64,
    pub max_backoff_ns: u64,
}

impl RemoteModelParams {
    /// Derived from the model's own timing rather than guessed.
    pub fn for_model(pipeline_delay_ns: u64, max_inflight: usize) -> Self {
        RemoteModelParams {
            max_inflight,
            // Twice the nominal delay plus 100 ms: generous enough that normal
            // variance never trips it, tight enough that a dead link is noticed
            // inside a couple of hundred milliseconds.
            response_timeout_ns: pipeline_delay_ns * 2 + 100_000_000,
            timeouts_to_declare_dead: 5,
            initial_backoff_ns: 50_000_000,
            max_backoff_ns: 2_000_000_000,
        }
    }
}

struct InFlight {
    sent_at_ns: u64,
}

pub struct RemoteModelStage {
    transport: Box<dyn Transport>,
    params: RemoteModelParams,
    inflight: BTreeMap<u64, InFlight>,
    ready: VecDeque<Frame>,
    stats: StageStats,

    reconnect_at_ns: Option<u64>,
    backoff_ns: u64,
    consecutive_timeouts: u32,

    processed: u64,
    reconnects: u64,
    timeouts: u64,
    lost_in_flight: u64,
    out_of_order: u64,
    last_seq_out: u64,

    /// Reported by the server on `SessionReady`. The engine can size its
    /// playout offset from the model's own answer instead of a local guess.
    server_pipeline_delay_ns: u64,

    inject_failures: u64,
}

impl RemoteModelStage {
    pub fn new(transport: Box<dyn Transport>, params: RemoteModelParams) -> Self {
        RemoteModelStage {
            transport,
            params,
            inflight: BTreeMap::new(),
            ready: VecDeque::with_capacity(16),
            stats: StageStats::new("model"),
            reconnect_at_ns: None,
            backoff_ns: 0,
            consecutive_timeouts: 0,
            processed: 0,
            reconnects: 0,
            timeouts: 0,
            lost_in_flight: 0,
            out_of_order: 0,
            last_seq_out: 0,
            server_pipeline_delay_ns: 0,
            inject_failures: 0,
        }
    }

    /// Starts warming the link. Call at session provisioning, never mid-call:
    /// warm-up costs 300-900 ms and paying it after the customer answers ruins
    /// the greeting (`docs/05`).
    pub fn prewarm(&mut self, now_ns: u64) {
        self.transport.connect(now_ns);
        self.backoff_ns = self.params.initial_backoff_ns;
    }

    pub fn link_state(&self) -> LinkState {
        self.transport.state()
    }

    pub fn reconnects(&self) -> u64 {
        self.reconnects
    }

    pub fn timeouts(&self) -> u64 {
        self.timeouts
    }

    /// Frames that were in flight when a link died. They are gone: the audio
    /// was serialised into a socket that no longer exists.
    pub fn lost_in_flight(&self) -> u64 {
        self.lost_in_flight
    }

    /// Responses that arrived after a higher sequence number. Harmless — the
    /// scheduler indexes by sequence — but worth counting, because a sudden
    /// rise means the transport or the server changed behaviour.
    pub fn out_of_order(&self) -> u64 {
        self.out_of_order
    }

    pub fn server_pipeline_delay_ns(&self) -> u64 {
        self.server_pipeline_delay_ns
    }

    pub fn inflight_count(&self) -> usize {
        self.inflight.len()
    }

    fn on_link_lost(&mut self, now_ns: u64) {
        // Everything in flight died with the link. Counting them is what makes
        // the health monitor react instead of waiting out five timeouts.
        self.lost_in_flight += self.inflight.len() as u64;
        self.stats.dropped_failure += self.inflight.len() as u64;
        self.inflight.clear();
        self.consecutive_timeouts = 0;

        if self.backoff_ns == 0 {
            self.backoff_ns = self.params.initial_backoff_ns;
        }
        self.reconnect_at_ns = Some(now_ns + self.backoff_ns);
        // Exponential, capped. A GPU node that just died is often a GPU node
        // that is about to be rescheduled; hammering it delays its recovery.
        self.backoff_ns = (self.backoff_ns * 2).min(self.params.max_backoff_ns);
    }

    fn sweep_timeouts(&mut self, now_ns: u64) {
        let cutoff = now_ns.saturating_sub(self.params.response_timeout_ns);
        let expired: Vec<u64> = self
            .inflight
            .iter()
            .filter(|(_, f)| f.sent_at_ns <= cutoff)
            .map(|(seq, _)| *seq)
            .collect();

        if expired.is_empty() {
            return;
        }
        for seq in expired {
            self.inflight.remove(&seq);
            self.timeouts += 1;
            self.stats.dropped_failure += 1;
            self.consecutive_timeouts += 1;
        }

        if self.consecutive_timeouts >= self.params.timeouts_to_declare_dead {
            // The link is not slow, it is dead. Silence is not evidence of
            // life, and continuing to send into it wastes the whole call.
            self.transport.disconnect(now_ns);
            self.on_link_lost(now_ns);
        }
    }

    fn drive_transport(&mut self, now_ns: u64) {
        while let Some(event) = self.transport.poll(now_ns) {
            match event {
                TransportEvent::Ready { pipeline_delay_ns } => {
                    self.server_pipeline_delay_ns = pipeline_delay_ns;
                    self.backoff_ns = self.params.initial_backoff_ns;
                    self.consecutive_timeouts = 0;
                }
                TransportEvent::Frame(frame) => {
                    let seq = frame.seq;
                    if let Some(f) = self.inflight.remove(&seq) {
                        record_exit(&mut self.stats, f.sent_at_ns, now_ns);
                        self.processed += 1;
                        self.consecutive_timeouts = 0;
                        if seq < self.last_seq_out {
                            self.out_of_order += 1;
                        } else {
                            self.last_seq_out = seq;
                        }
                        self.ready.push_back(frame);
                    }
                    // A response for a sequence we are not waiting on is a
                    // duplicate or a survivor of a previous session. Dropping
                    // it here is what keeps a reconnect from injecting stale
                    // audio into the new call.
                }
                TransportEvent::Dropped { seq } => {
                    if self.inflight.remove(&seq).is_some() {
                        self.stats.dropped_failure += 1;
                    }
                }
                TransportEvent::Lost => {
                    self.on_link_lost(now_ns);
                    break;
                }
            }
        }
    }

    fn maybe_reconnect(&mut self, now_ns: u64) {
        if self.transport.state() != LinkState::Cold {
            return;
        }
        match self.reconnect_at_ns {
            Some(at) if now_ns >= at => {
                self.transport.connect(now_ns);
                self.reconnect_at_ns = None;
                self.reconnects += 1;
            }
            Some(_) => {}
            None => {
                // Cold with no reconnect scheduled: schedule one rather than
                // sitting dead forever.
                self.reconnect_at_ns = Some(now_ns + self.params.initial_backoff_ns);
            }
        }
    }
}

impl Stage for RemoteModelStage {
    fn name(&self) -> &'static str {
        "remote_model"
    }

    fn push(&mut self, frame: Frame, now_ns: u64) -> PushResult {
        self.stats.pushed += 1;

        if self.inject_failures > 0 {
            self.inject_failures -= 1;
            return record_drop(&mut self.stats, DropReason::Failure);
        }

        if self.transport.state() != LinkState::Ready {
            // Not an error worth retrying: audio has a deadline, and a frame
            // held until the link recovers would arrive long past it. Drop it
            // and let the scheduler bypass — the customer hears the agent.
            return record_drop(&mut self.stats, DropReason::Failure);
        }

        if self.inflight.len() >= self.params.max_inflight {
            return record_drop(&mut self.stats, DropReason::Backpressure);
        }

        let seq = frame.seq;
        match self.transport.send(frame, now_ns) {
            Ok(()) => {
                self.inflight.insert(seq, InFlight { sent_at_ns: now_ns });
                PushResult::Accepted
            }
            Err(_) => {
                self.on_link_lost(now_ns);
                record_drop(&mut self.stats, DropReason::Failure)
            }
        }
    }

    fn poll(&mut self, now_ns: u64) -> Option<Frame> {
        self.drive_transport(now_ns);
        self.sweep_timeouts(now_ns);
        self.maybe_reconnect(now_ns);
        self.ready.pop_front()
    }

    fn depth(&self) -> usize {
        self.inflight.len() + self.ready.len()
    }

    fn stats(&self) -> &StageStats {
        &self.stats
    }

    fn reset(&mut self) {
        self.inflight.clear();
        self.ready.clear();
    }

    fn processed(&self) -> u64 {
        self.processed
    }

    fn inject_failures(&mut self, n: u64) {
        self.inject_failures = n;
    }

    fn inject_disconnect(&mut self, now_ns: u64) {
        self.transport.disconnect(now_ns);
        self.on_link_lost(now_ns);
    }

    fn clear_injections(&mut self) {
        self.inject_failures = 0;
    }
}

// ---------------------------------------------------------------------------
// Mock transport
// ---------------------------------------------------------------------------

pub struct MockParams {
    /// Connection plus model load plus first-inference warm-up. The reason the
    /// session pool exists.
    pub warmup_ns: u64,
    /// One-way network time to the inference host.
    pub rtt_ns: u64,
    pub rtt_jitter_ns: u64,
    /// Server-side compute per frame.
    pub inference_ns: u64,
    pub inference_sigma_ns: u64,
    /// Responses that never come back at all — the case that makes silence
    /// ambiguous and timeouts necessary.
    pub response_loss_probability: f64,
    /// The link dies at this timestamp.
    pub die_at_ns: Option<u64>,
    /// Chance a response is duplicated. Real streams do this after a retry.
    pub duplicate_probability: f64,
}

impl Default for MockParams {
    fn default() -> Self {
        MockParams {
            warmup_ns: 600_000_000,
            rtt_ns: 2_000_000,
            rtt_jitter_ns: 500_000,
            inference_ns: 115_000_000,
            inference_sigma_ns: 6_000_000,
            response_loss_probability: 0.0,
            die_at_ns: None,
            duplicate_probability: 0.0,
        }
    }
}

impl MockParams {
    /// Same host or same rack: the deployment `docs/01` requires, with the GPU
    /// next to the media edge.
    pub fn colocated() -> Self {
        MockParams::default()
    }

    /// GPU in another region. Included because it is a configuration mistake
    /// somebody will make, and the bench should be able to price it.
    pub fn cross_region() -> Self {
        MockParams {
            rtt_ns: 70_000_000,
            rtt_jitter_ns: 8_000_000,
            ..MockParams::default()
        }
    }
}

struct Pending {
    due_at_ns: u64,
    frame: Frame,
    duplicate: bool,
}

pub struct MockTransport {
    params: MockParams,
    rng: Rng,
    state: LinkState,
    ready_at_ns: u64,
    pending: Vec<Pending>,
    events: VecDeque<TransportEvent>,
    announced_ready: bool,
    dead: bool,
}

impl MockTransport {
    pub fn new(params: MockParams, seed: u64) -> Self {
        MockTransport {
            params,
            rng: Rng::new(seed),
            state: LinkState::Cold,
            ready_at_ns: 0,
            pending: Vec::with_capacity(32),
            events: VecDeque::with_capacity(32),
            announced_ready: false,
            dead: false,
        }
    }

    fn kill(&mut self) {
        // Everything in flight is lost with the socket. Dropping the frames
        // here returns their buffers to the pool, which is what a real
        // transport's teardown does too.
        self.pending.clear();
        self.events.clear();
        self.state = LinkState::Cold;
        self.announced_ready = false;
        self.events.push_back(TransportEvent::Lost);
    }
}

impl Transport for MockTransport {
    fn state(&self) -> LinkState {
        self.state
    }

    fn connect(&mut self, now_ns: u64) {
        if self.dead || self.state != LinkState::Cold {
            return;
        }
        self.state = LinkState::Warming;
        self.ready_at_ns = now_ns + self.params.warmup_ns;
        self.announced_ready = false;
    }

    fn send(&mut self, frame: Frame, now_ns: u64) -> Result<(), SendError> {
        if self.state != LinkState::Ready {
            return Err(SendError::NotReady);
        }
        if let Some(die) = self.params.die_at_ns {
            if now_ns >= die {
                return Err(SendError::LinkDown);
            }
        }
        if self.rng.chance(self.params.response_loss_probability) {
            // Sent, never answered. The client must discover this by deadline,
            // not by waiting for a reply that will never come.
            return Ok(());
        }

        let trip = self.params.rtt_ns + self.rng.jitter_ns(self.params.rtt_jitter_ns);
        let compute = self.params.inference_ns + self.rng.jitter_ns(self.params.inference_sigma_ns);
        let duplicate = self.rng.chance(self.params.duplicate_probability);

        self.pending.push(Pending {
            due_at_ns: now_ns + trip * 2 + compute,
            frame,
            duplicate,
        });
        Ok(())
    }

    fn poll(&mut self, now_ns: u64) -> Option<TransportEvent> {
        if let Some(die) = self.params.die_at_ns {
            if now_ns >= die && !self.dead {
                self.dead = true;
                self.kill();
            }
        }

        if self.state == LinkState::Warming && now_ns >= self.ready_at_ns && !self.announced_ready {
            self.state = LinkState::Ready;
            self.announced_ready = true;
            return Some(TransportEvent::Ready {
                pipeline_delay_ns: self.params.inference_ns,
            });
        }

        if let Some(event) = self.events.pop_front() {
            return Some(event);
        }

        // `swap_remove` returns due frames in whatever order the vector holds
        // them, which is exactly the out-of-order delivery a real stream
        // produces. Sorting here would hide a case the client must handle.
        let mut i = 0;
        while i < self.pending.len() {
            if self.pending[i].due_at_ns <= now_ns {
                let p = self.pending.swap_remove(i);
                if p.duplicate {
                    self.events
                        .push_back(TransportEvent::Dropped { seq: p.frame.seq });
                }
                return Some(TransportEvent::Frame(p.frame));
            }
            i += 1;
        }
        None
    }

    fn disconnect(&mut self, _now_ns: u64) {
        self.pending.clear();
        self.state = LinkState::Cold;
        self.announced_ready = false;
    }
}

// ---------------------------------------------------------------------------
// Pre-warmed session pool
// ---------------------------------------------------------------------------

/// Keeps inference sessions warm ahead of demand.
///
/// From `docs/05`: opening a stream, loading the model and warming the first
/// inference costs 300-900 ms. Paying that when the customer has already said
/// "hello" means the agent's opening words go out raw or clipped — the single
/// most important moment of a sales call.
///
/// So sessions are warmed against the shift roster, not against the dialer.
/// The cost is idle GPU; the benefit is that the greeting always sounds right.
/// `docs/11` prices the idle GPU, and it is worth paying.
pub struct SessionPool {
    warm: Vec<Box<dyn Transport>>,
    target_warm: usize,
    factory: Box<dyn FnMut(u64) -> Box<dyn Transport>>,
    created: u64,
    served_warm: u64,
    served_cold: u64,
}

impl SessionPool {
    pub fn new(target_warm: usize, factory: Box<dyn FnMut(u64) -> Box<dyn Transport>>) -> Self {
        SessionPool {
            warm: Vec::with_capacity(target_warm + 1),
            target_warm,
            factory,
            created: 0,
            served_warm: 0,
            served_cold: 0,
        }
    }

    /// Tops the pool back up and advances warm-up. Call on the shift timer, not
    /// in the audio path.
    pub fn tick(&mut self, now_ns: u64) {
        while self.warm.len() < self.target_warm {
            let mut t = (self.factory)(now_ns);
            t.connect(now_ns);
            self.warm.push(t);
            self.created += 1;
        }
        for t in self.warm.iter_mut() {
            // Drain warm-up events so the transport reaches `Ready`.
            while t.poll(now_ns).is_some() {}
        }
    }

    /// Takes a session for a call. Returns a `Ready` one when the pool has kept
    /// up; otherwise a cold one, which the caller must warm — and which will
    /// cost the greeting.
    pub fn acquire(&mut self, now_ns: u64) -> Box<dyn Transport> {
        if let Some(idx) = self.warm.iter().position(|t| t.state() == LinkState::Ready) {
            self.served_warm += 1;
            let t = self.warm.swap_remove(idx);
            self.tick(now_ns);
            return t;
        }
        self.served_cold += 1;
        self.created += 1;
        (self.factory)(now_ns)
    }

    pub fn warm_available(&self) -> usize {
        self.warm
            .iter()
            .filter(|t| t.state() == LinkState::Ready)
            .count()
    }

    pub fn served_warm(&self) -> u64 {
        self.served_warm
    }

    /// Calls that had to wait for a cold start. Every one of these is a
    /// greeting that went out unconverted. It is an SLA metric, not a
    /// curiosity.
    pub fn served_cold(&self) -> u64 {
        self.served_cold
    }

    pub fn created(&self) -> u64 {
        self.created
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::frame::{FramePool, Speaker};

    fn stage(params: MockParams) -> (FramePool, RemoteModelStage) {
        let pool = FramePool::with_capacity(256);
        let transport = Box::new(MockTransport::new(params, 7));
        let s = RemoteModelStage::new(transport, RemoteModelParams::for_model(115_000_000, 12));
        (pool, s)
    }

    #[test]
    fn audio_sent_before_the_link_is_ready_is_refused_not_swallowed() {
        let (pool, mut s) = stage(MockParams::default());
        s.prewarm(0);
        let f = pool.acquire(0, 0, Speaker::Agent);
        assert!(
            !s.push(f, 0).is_accepted(),
            "sending into a warming link loses the audio silently"
        );
    }

    #[test]
    fn the_link_becomes_ready_after_warmup() {
        let (_pool, mut s) = stage(MockParams::default());
        assert_eq!(s.link_state(), LinkState::Cold);
        s.prewarm(0);
        // `prewarm` connects immediately — that is its whole job.
        assert_eq!(s.link_state(), LinkState::Warming);
        s.poll(100_000_000);
        assert_eq!(
            s.link_state(),
            LinkState::Warming,
            "still loading the model 100 ms in"
        );
        s.poll(700_000_000);
        assert_eq!(s.link_state(), LinkState::Ready);
    }

    #[test]
    fn frames_round_trip_once_warm() {
        let (pool, mut s) = stage(MockParams::default());
        s.prewarm(0);
        s.poll(700_000_000);

        let mut now = 700_000_000u64;
        let mut got = 0;
        for seq in 0..50u64 {
            let f = pool.acquire(seq, now, Speaker::Agent);
            assert!(s.push(f, now).is_accepted());
            now += 20_000_000;
            while s.poll(now).is_some() {
                got += 1;
            }
        }
        for _ in 0..20 {
            now += 20_000_000;
            while s.poll(now).is_some() {
                got += 1;
            }
        }
        assert!(got > 40, "expected most frames back, got {got}");
    }

    #[test]
    fn a_lost_response_is_written_off_by_deadline_not_waited_on_forever() {
        let params = MockParams {
            response_loss_probability: 1.0,
            ..MockParams::default()
        };
        let (pool, mut s) = stage(params);
        s.prewarm(0);
        s.poll(700_000_000);

        let mut now = 700_000_000u64;
        for seq in 0..5u64 {
            let f = pool.acquire(seq, now, Speaker::Agent);
            s.push(f, now);
            now += 20_000_000;
        }
        assert_eq!(s.inflight_count(), 5);

        // Past the timeout, the slots must free themselves.
        now += 1_000_000_000;
        s.poll(now);
        assert_eq!(s.inflight_count(), 0, "in-flight slots leaked on silence");
        assert!(s.timeouts() >= 5);
    }

    #[test]
    fn a_dead_link_is_declared_dead_and_reconnected() {
        let params = MockParams {
            die_at_ns: Some(800_000_000),
            ..MockParams::default()
        };
        let (pool, mut s) = stage(params);
        s.prewarm(0);
        s.poll(700_000_000);
        assert_eq!(s.link_state(), LinkState::Ready);

        let mut now = 700_000_000u64;
        for seq in 0..20u64 {
            let f = pool.acquire(seq, now, Speaker::Agent);
            s.push(f, now);
            now += 20_000_000;
            s.poll(now);
        }
        assert_eq!(s.link_state(), LinkState::Cold, "death must be noticed");

        // And a reconnect must be attempted rather than sitting dead.
        for _ in 0..50 {
            now += 100_000_000;
            s.poll(now);
        }
        assert!(s.reconnects() > 0, "no reconnect was attempted");
    }

    #[test]
    fn backpressure_caps_in_flight_frames() {
        let params = MockParams {
            inference_ns: 5_000_000_000, // never comes back in time
            ..MockParams::default()
        };
        let pool = FramePool::with_capacity(256);
        let transport = Box::new(MockTransport::new(params, 3));
        let mut s = RemoteModelStage::new(transport, RemoteModelParams::for_model(115_000_000, 6));
        s.prewarm(0);
        s.poll(700_000_000);

        let mut now = 700_000_000u64;
        let mut accepted = 0;
        for seq in 0..40u64 {
            let f = pool.acquire(seq, now, Speaker::Agent);
            if s.push(f, now).is_accepted() {
                accepted += 1;
            }
            now += 20_000_000;
        }
        assert!(
            accepted <= 12,
            "in-flight cap was not enforced: {accepted} accepted"
        );
    }

    #[test]
    fn responses_really_do_arrive_out_of_order_and_all_arrive() {
        // Guards the reordering path directly. If the transport ever started
        // delivering in order, the integration test above would keep passing
        // while silently no longer covering the case it names.
        let params = MockParams {
            rtt_jitter_ns: 10_000_000,
            ..MockParams::default()
        };
        let (pool, mut s) = stage(params);
        s.prewarm(0);
        s.poll(700_000_000);

        let mut now = 700_000_000u64;
        let mut order = Vec::new();
        for seq in 0..40u64 {
            let f = pool.acquire(seq, now, Speaker::Agent);
            s.push(f, now);
            now += 20_000_000;
            while let Some(f) = s.poll(now) {
                order.push(f.seq);
            }
        }
        for _ in 0..40 {
            now += 20_000_000;
            while let Some(f) = s.poll(now) {
                order.push(f.seq);
            }
        }

        assert_eq!(order.len(), 40, "every frame must come back exactly once");
        let mut sorted = order.clone();
        sorted.sort_unstable();
        sorted.dedup();
        assert_eq!(sorted.len(), 40, "duplicates or losses in delivery");
        assert!(
            order.windows(2).any(|w| w[0] > w[1]),
            "transport delivered strictly in order — the reordering case is not \
             actually being exercised"
        );
        assert!(
            s.out_of_order() > 0,
            "out-of-order arrivals must be counted"
        );
    }

    #[test]
    fn the_pool_serves_warm_sessions() {
        let mut pool = SessionPool::new(
            3,
            Box::new(|_now| Box::new(MockTransport::new(MockParams::default(), 11))),
        );
        pool.tick(0);
        assert_eq!(pool.warm_available(), 0, "not warm yet at t=0");

        pool.tick(700_000_000);
        assert_eq!(pool.warm_available(), 3);

        let t = pool.acquire(700_000_000);
        assert_eq!(t.state(), LinkState::Ready);
        assert_eq!(pool.served_warm(), 1);
        assert_eq!(pool.served_cold(), 0);
    }

    #[test]
    fn a_pool_that_cannot_keep_up_reports_cold_starts_instead_of_hiding_them() {
        let mut pool = SessionPool::new(
            1,
            Box::new(|_now| Box::new(MockTransport::new(MockParams::default(), 13))),
        );
        pool.tick(0);
        // Two calls arrive before anything has warmed.
        let a = pool.acquire(0);
        let b = pool.acquire(0);
        assert_ne!(a.state(), LinkState::Ready);
        assert_ne!(b.state(), LinkState::Ready);
        assert_eq!(
            pool.served_cold(),
            2,
            "cold starts must be counted; each one is a greeting sent unconverted"
        );
    }
}
