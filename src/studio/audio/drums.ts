import type { DrumVoice } from "@/studio/types";
import { midiToHz } from "@/studio/analysis/pitch";

/**
 * Bateria sintetizada con osciladores y ruido: cero samples que cargar, suena
 * igual en directo que en la mezcla final (misma funcion, distinto contexto).
 */

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const cached = noiseCache.get(ctx);
  if (cached) return cached;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 1.2), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  noiseCache.set(ctx, buffer);
  return buffer;
}

function envelope(ctx: BaseAudioContext, time: number, peak: number, decay: number): GainNode {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), time + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + decay);
  return gain;
}

function noiseSource(ctx: BaseAudioContext, time: number, duration: number): AudioBufferSourceNode {
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx);
  source.loop = true;
  source.playbackRate.value = 1;
  source.start(time, Math.random() * 0.5);
  source.stop(time + duration + 0.05);
  return source;
}

export interface TriggerOptions {
  velocity?: number;
  /** Nota MIDI para el 808 (por defecto, la tonica del tema). */
  subMidi?: number;
}

/** Dispara una voz de bateria en `time` (reloj del contexto de audio). */
export function triggerVoice(
  ctx: BaseAudioContext,
  destination: AudioNode,
  voice: DrumVoice,
  time: number,
  { velocity = 1, subMidi = 33 }: TriggerOptions = {}
): void {
  const v = Math.max(0.05, Math.min(1, velocity));

  switch (voice) {
    case "kick": {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(160, time);
      osc.frequency.exponentialRampToValueAtTime(44, time + 0.11);
      const gain = envelope(ctx, time, 0.95 * v, 0.34);
      osc.connect(gain).connect(destination);
      osc.start(time);
      osc.stop(time + 0.4);

      const click = noiseSource(ctx, time, 0.02);
      const clickFilter = ctx.createBiquadFilter();
      clickFilter.type = "highpass";
      clickFilter.frequency.value = 1200;
      const clickGain = envelope(ctx, time, 0.18 * v, 0.02);
      click.connect(clickFilter).connect(clickGain).connect(destination);
      break;
    }

    case "sub": {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      const hz = midiToHz(subMidi);
      osc.frequency.setValueAtTime(hz * 1.5, time);
      osc.frequency.exponentialRampToValueAtTime(hz, time + 0.05);
      const gain = envelope(ctx, time, 0.8 * v, 0.62);
      const shaper = ctx.createWaveShaper();
      shaper.curve = saturation();
      osc.connect(shaper).connect(gain).connect(destination);
      osc.start(time);
      osc.stop(time + 0.7);
      break;
    }

    case "snare": {
      const noise = noiseSource(ctx, time, 0.2);
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 1900;
      filter.Q.value = 0.8;
      const noiseGain = envelope(ctx, time, 0.55 * v, 0.19);
      noise.connect(filter).connect(noiseGain).connect(destination);

      const body = ctx.createOscillator();
      body.type = "triangle";
      body.frequency.setValueAtTime(210, time);
      body.frequency.exponentialRampToValueAtTime(150, time + 0.08);
      const bodyGain = envelope(ctx, time, 0.35 * v, 0.1);
      body.connect(bodyGain).connect(destination);
      body.start(time);
      body.stop(time + 0.2);
      break;
    }

    case "clap": {
      for (let i = 0; i < 3; i++) {
        const at = time + i * 0.009;
        const noise = noiseSource(ctx, at, 0.05);
        const filter = ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.value = 1150;
        filter.Q.value = 1.4;
        const gain = envelope(ctx, at, (i === 2 ? 0.5 : 0.3) * v, i === 2 ? 0.16 : 0.03);
        noise.connect(filter).connect(gain).connect(destination);
      }
      break;
    }

    case "hat":
    case "openhat": {
      const decay = voice === "hat" ? 0.045 : 0.3;
      const noise = noiseSource(ctx, time, decay);
      const filter = ctx.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.value = 7200;
      const gain = envelope(ctx, time, 0.3 * v, decay);
      noise.connect(filter).connect(gain).connect(destination);
      break;
    }
  }
}

let curve: Float32Array<ArrayBuffer> | null = null;
function saturation(): Float32Array<ArrayBuffer> {
  if (curve) return curve;
  const n = 1024;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    out[i] = Math.tanh(x * 1.8);
  }
  curve = out;
  return out;
}

/** Click del metronomo: agudo en el 1, mas apagado en el resto. */
export function triggerClick(
  ctx: BaseAudioContext,
  destination: AudioNode,
  time: number,
  accent: boolean
): void {
  const osc = ctx.createOscillator();
  osc.type = "square";
  osc.frequency.value = accent ? 1800 : 1200;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(accent ? 0.28 : 0.16, time + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);
  osc.connect(gain).connect(destination);
  osc.start(time);
  osc.stop(time + 0.06);
}

/** Blip de guia: marca donde deberia caer cada silaba al ensayar un flow. */
export function triggerGuide(ctx: BaseAudioContext, destination: AudioNode, time: number): void {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(920, time);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(0.22, time + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.06);
  osc.connect(gain).connect(destination);
  osc.start(time);
  osc.stop(time + 0.08);
}
