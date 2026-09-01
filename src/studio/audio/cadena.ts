/**
 * La cadena de sonido del beat.
 *
 * Dos cosas separan una base que suena a caja de ritmos de una que suena a
 * producción, y ninguna tiene que ver con qué golpes suenan:
 *
 * - El *sidechain*: la música baja de volumen un instante cada vez que entra el
 *   bombo. Es lo que hace que el bombo se oiga en el pecho sin subirlo, y lo que
 *   le da a lo urbano ese bombeo característico.
 * - La *reverb*: sin algo de cola, la caja y los acordes suenan pegados a la
 *   cara. Un poco de sala los coloca detrás del bombo y de la voz.
 */

export interface CadenaBeat {
  /** Percusión: va seca y al frente. */
  drums: GainNode;
  /** Bajo y acordes: van por detrás y se agachan con cada bombo. */
  music: GainNode;
  /** Agacha la música un instante. Se llama en cada golpe de bombo. */
  duck: (tiempo: number) => void;
}

/** Impulso de sala: ruido que decae. Suficiente para colocar las cosas. */
function impulso(ctx: BaseAudioContext, segundos = 1.1): AudioBuffer {
  const largo = Math.floor(ctx.sampleRate * segundos);
  const buffer = ctx.createBuffer(2, largo, ctx.sampleRate);
  for (let canal = 0; canal < 2; canal++) {
    const datos = buffer.getChannelData(canal);
    for (let i = 0; i < largo; i++) {
      const caida = (1 - i / largo) ** 2.6;
      datos[i] = (Math.random() * 2 - 1) * caida;
    }
  }
  return buffer;
}

export function crearCadenaBeat(ctx: BaseAudioContext, destino: AudioNode): CadenaBeat {
  const reverb = ctx.createConvolver();
  reverb.buffer = impulso(ctx);
  const retornoReverb = ctx.createGain();
  retornoReverb.gain.value = 0.5;
  reverb.connect(retornoReverb).connect(destino);

  const drums = ctx.createGain();
  drums.gain.value = 1;
  drums.connect(destino);
  const envioDrums = ctx.createGain();
  envioDrums.gain.value = 0.12;
  drums.connect(envioDrums).connect(reverb);

  const music = ctx.createGain();
  music.gain.value = 1;
  music.connect(destino);
  const envioMusic = ctx.createGain();
  envioMusic.gain.value = 0.22;
  music.connect(envioMusic).connect(reverb);

  const duck = (tiempo: number) => {
    const g = music.gain;
    g.cancelScheduledValues(tiempo);
    g.setValueAtTime(1, tiempo);
    // Bajada casi instantánea y subida lenta: así se nota el bombeo.
    g.linearRampToValueAtTime(0.32, tiempo + 0.012);
    g.linearRampToValueAtTime(1, tiempo + 0.22);
  };

  return { drums, music, duck };
}
