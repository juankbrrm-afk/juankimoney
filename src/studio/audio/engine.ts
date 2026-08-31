import type { DrumVoice, Pattern, Take } from "@/studio/types";
import { DRUM_VOICES } from "@/studio/types";
import { triggerClick, triggerGuide, triggerVoice } from "./drums";

export interface EngineSettings {
  bpm: number;
  stepsPerBar: number;
  bars: number;
  swing: number;
  subMidi: number;
  metronome: boolean;
  beatEnabled: boolean;
  countInBars: number;
  /** Pasos del bucle donde suena el blip de guia al ensayar un flow. */
  guideSteps: number[];
}

export interface EngineTick {
  playing: boolean;
  /** Paso absoluto desde el compas 1 (negativo durante la cuenta de entrada). */
  step: number;
  /** Segundos desde el compas 1 (negativo durante la cuenta de entrada). */
  position: number;
}

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.12;

/**
 * Transporte del estudio. El reloj es el del AudioContext, no el de la UI: un
 * planificador mira 120 ms hacia delante y va colocando bateria, click y tomas
 * en su instante exacto, asi el ritmo no baila aunque la pestaña se atasque.
 */
export class StudioEngine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  beatBus: GainNode | null = null;
  clickBus: GainNode | null = null;
  takeBus: GainNode | null = null;

  settings: EngineSettings = {
    bpm: 90,
    stepsPerBar: 16,
    bars: 2,
    swing: 0,
    subMidi: 33,
    metronome: true,
    beatEnabled: true,
    countInBars: 1,
    guideSteps: [],
  };

  private pattern: Pattern | null = null;
  private takes: Take[] = [];
  private timer: number | null = null;
  private nextStep = 0;
  private startTime = 0;
  private playing = false;
  private sources: AudioBufferSourceNode[] = [];
  private listeners = new Set<(tick: EngineTick) => void>();

  /** Crea (o reanuda) el contexto de audio. Debe llamarse desde un gesto real. */
  async ensureContext(): Promise<AudioContext> {
    if (!this.ctx) {
      const ctx = new AudioContext({ latencyHint: "interactive" });
      const master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
      const beatBus = ctx.createGain();
      beatBus.gain.value = 0.85;
      beatBus.connect(master);
      const clickBus = ctx.createGain();
      clickBus.gain.value = 0.7;
      clickBus.connect(master);
      const takeBus = ctx.createGain();
      takeBus.gain.value = 1;
      takeBus.connect(master);
      this.ctx = ctx;
      this.master = master;
      this.beatBus = beatBus;
      this.clickBus = clickBus;
      this.takeBus = takeBus;
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
    return this.ctx;
  }

  subscribe(listener: (tick: EngineTick) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  update(settings: Partial<EngineSettings>): void {
    this.settings = { ...this.settings, ...settings };
  }

  setPattern(pattern: Pattern): void {
    this.pattern = pattern;
  }

  setTakes(takes: Take[]): void {
    this.takes = takes;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  get stepSeconds(): number {
    return ((60 / this.settings.bpm) * 4) / this.settings.stepsPerBar;
  }

  /** Segundos transcurridos desde el compas 1 (negativo en la cuenta atras). */
  get position(): number {
    if (!this.ctx || !this.playing) return 0;
    return this.ctx.currentTime - this.startTime;
  }

  /** Latencia de salida que conviene compensar al alinear una toma. */
  get outputLatencyMs(): number {
    if (!this.ctx) return 0;
    const ctx = this.ctx as AudioContext & { outputLatency?: number };
    return ((ctx.outputLatency ?? 0) + ctx.baseLatency) * 1000;
  }

  /** Instante absoluto (reloj de audio) del compas 1 de esta reproduccion. */
  get anchorTime(): number {
    return this.startTime;
  }

  async play(): Promise<void> {
    const ctx = await this.ensureContext();
    if (this.playing) this.stop();
    const countIn = this.settings.countInBars * this.settings.stepsPerBar * this.stepSeconds;
    this.startTime = ctx.currentTime + 0.15 + countIn;
    this.nextStep = -this.settings.countInBars * this.settings.stepsPerBar;
    this.playing = true;
    this.scheduleTakes();
    this.timer = window.setInterval(() => this.tick(), LOOKAHEAD_MS);
    this.tick();
  }

  stop(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // Ya habia terminado por su cuenta.
      }
    }
    this.sources = [];
    this.playing = false;
    this.emit();
  }

  private emit(): void {
    const tick: EngineTick = {
      playing: this.playing,
      step: this.playing ? Math.floor(this.position / this.stepSeconds) : 0,
      position: this.position,
    };
    for (const listener of this.listeners) listener(tick);
  }

  private timeOfStep(step: number): number {
    const swingOffset = step % 2 === 1 ? this.settings.swing * 0.5 * this.stepSeconds : 0;
    return this.startTime + step * this.stepSeconds + swingOffset;
  }

  private tick(): void {
    const ctx = this.ctx;
    if (!ctx || !this.playing) return;
    const { stepsPerBar, bars, metronome, beatEnabled, subMidi } = this.settings;
    const totalSteps = stepsPerBar * bars;

    while (this.timeOfStep(this.nextStep) < ctx.currentTime + SCHEDULE_AHEAD) {
      const step = this.nextStep;
      const time = this.timeOfStep(step);

      if (metronome && step % (stepsPerBar / 4) === 0) {
        triggerClick(ctx, this.clickBus!, time, ((step / (stepsPerBar / 4)) % 4 + 4) % 4 === 0);
      }

      if (step >= 0 && this.settings.guideSteps.length) {
        const index = ((step % totalSteps) + totalSteps) % totalSteps;
        if (this.settings.guideSteps.includes(index)) {
          triggerGuide(ctx, this.clickBus!, time);
        }
      }

      if (beatEnabled && step >= 0 && this.pattern) {
        const index = ((step % totalSteps) + totalSteps) % totalSteps;
        for (const voice of DRUM_VOICES) {
          const velocity = this.pattern[voice]?.[index] ?? 0;
          if (velocity > 0) {
            triggerVoice(ctx, this.beatBus!, voice as DrumVoice, time, { velocity, subMidi });
          }
        }
      }

      this.nextStep++;
    }

    this.emit();
  }

  /** Coloca cada toma en su sitio del tema, recortando lo que ya haya pasado. */
  private scheduleTakes(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const anySolo = this.takes.some((t) => t.soloed);
    for (const take of this.takes) {
      const audible = anySolo ? take.soloed : !take.muted;
      if (!audible) continue;
      const source = ctx.createBufferSource();
      source.buffer = take.buffer;
      const gain = ctx.createGain();
      gain.gain.value = take.gain;
      source.connect(gain).connect(this.takeBus!);
      const when = this.startTime + take.offset;
      if (when >= ctx.currentTime) source.start(when);
      else source.start(ctx.currentTime, Math.min(take.buffer.duration, ctx.currentTime - when));
      this.sources.push(source);
    }
  }

  setBusGain(bus: "master" | "beat" | "click" | "take", value: number): void {
    const node =
      bus === "master"
        ? this.master
        : bus === "beat"
          ? this.beatBus
          : bus === "click"
            ? this.clickBus
            : this.takeBus;
    if (node) node.gain.value = value;
  }

  /** Escucha suelta de una voz, para el editor de patron. */
  async audition(voice: DrumVoice): Promise<void> {
    const ctx = await this.ensureContext();
    triggerVoice(ctx, this.beatBus!, voice, ctx.currentTime + 0.01, {
      velocity: 1,
      subMidi: this.settings.subMidi,
    });
  }
}

export const engine = new StudioEngine();
