import { midiToHz } from "@/studio/analysis/pitch";

/**
 * Los instrumentos con nota: bajo y acordes.
 *
 * Sin ellos un beat es una caja de ritmos, y suena a metrónomo por muy bien
 * repartidos que estén los golpes. La armonía es lo que hace que una base
 * parezca una canción: el bajo marca la fundamental de cada compás y el acorde
 * la rellena por encima.
 */

/** Bajo: un sub que sostiene y un diente de sierra filtrado que lo hace audible. */
export function triggerBajo(
  ctx: BaseAudioContext,
  destino: AudioNode,
  midi: number,
  tiempo: number,
  duracion: number,
  velocidad = 1
): void {
  const hz = midiToHz(midi);
  const ganancia = ctx.createGain();
  ganancia.gain.setValueAtTime(0.0001, tiempo);
  ganancia.gain.exponentialRampToValueAtTime(0.55 * velocidad, tiempo + 0.012);
  ganancia.gain.setValueAtTime(0.55 * velocidad, tiempo + duracion * 0.7);
  ganancia.gain.exponentialRampToValueAtTime(0.0001, tiempo + duracion);
  ganancia.connect(destino);

  const sub = ctx.createOscillator();
  sub.type = "sine";
  sub.frequency.value = hz;
  sub.connect(ganancia);
  sub.start(tiempo);
  sub.stop(tiempo + duracion + 0.05);

  // El diente de sierra una octava arriba: en un móvil el sub solo no se oye.
  const cuerpo = ctx.createOscillator();
  cuerpo.type = "sawtooth";
  cuerpo.frequency.value = hz * 2;
  const filtro = ctx.createBiquadFilter();
  filtro.type = "lowpass";
  filtro.frequency.setValueAtTime(hz * 10, tiempo);
  filtro.frequency.exponentialRampToValueAtTime(hz * 4, tiempo + duracion * 0.5);
  filtro.Q.value = 4;
  const mezcla = ctx.createGain();
  mezcla.gain.value = 0.3;
  cuerpo.connect(filtro).connect(mezcla).connect(ganancia);
  cuerpo.start(tiempo);
  cuerpo.stop(tiempo + duracion + 0.05);
}

/**
 * Acorde: tres o cuatro notas con las voces ligeramente desafinadas entre sí y
 * un filtro que se abre en el ataque. Suena a teclado de tema urbano, que es de
 * lo que se trata.
 */
export function triggerAcorde(
  ctx: BaseAudioContext,
  destino: AudioNode,
  midis: number[],
  tiempo: number,
  duracion: number,
  velocidad = 1
): void {
  const ganancia = ctx.createGain();
  ganancia.gain.setValueAtTime(0.0001, tiempo);
  ganancia.gain.exponentialRampToValueAtTime(0.17 * velocidad, tiempo + 0.03);
  ganancia.gain.exponentialRampToValueAtTime(0.0001, tiempo + duracion);

  const filtro = ctx.createBiquadFilter();
  filtro.type = "lowpass";
  filtro.frequency.setValueAtTime(600, tiempo);
  filtro.frequency.exponentialRampToValueAtTime(2600, tiempo + 0.08);
  filtro.frequency.exponentialRampToValueAtTime(900, tiempo + duracion);
  filtro.Q.value = 1.2;
  filtro.connect(ganancia).connect(destino);

  for (const midi of midis) {
    for (const desafine of [-4, 4]) {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = midiToHz(midi) * 2 ** (desafine / 1200);
      const voz = ctx.createGain();
      voz.gain.value = 1 / (midis.length * 2);
      osc.connect(voz).connect(filtro);
      osc.start(tiempo);
      osc.stop(tiempo + duracion + 0.05);
    }
  }
}

/** Notas del acorde a partir de su fundamental. */
export function notasAcorde(fundamental: number, modo: "menor" | "mayor"): number[] {
  const tercera = modo === "menor" ? 3 : 4;
  return [fundamental, fundamental + tercera, fundamental + 7, fundamental + 12];
}
