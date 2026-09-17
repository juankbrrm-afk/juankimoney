import type { Onset } from "@/studio/analysis/onsets";
import { analyzePitch, midiToHz } from "@/studio/analysis/pitch";
import { toMono } from "./buffers";
import { pitchShiftSegment } from "./pitchShift";
import type { Armonia } from "./melodia";
import { componerMelodia } from "./melodia";

/**
 * Entonar la voz: hacerla cantar.
 *
 * Cuadrar la voz arregla *cuándo* dices cada sílaba. Esto arregla *en qué nota*
 * la dices. Se parte la toma por sílabas, se mide a qué altura va cada una y se
 * desplaza a la nota que le toca de la melodía. La voz sigue siendo la tuya
 * —mismo timbre, misma forma de decir las cosas— pero pasa de hablada a cantada.
 *
 * Es lo mismo que hace el afinador duro de cualquier tema urbano, solo que en
 * vez de pegarse a la nota más cercana se pega a una melodía escrita a medida.
 */

export interface EntonarOpciones {
  bpm: number;
  stepsPerBar: number;
  /** Desfase de la toma respecto al compás 1. */
  takeOffset: number;
  /** Tónica del tema en MIDI (la del bajo; se sube sola al registro de la voz). */
  tonica: number;
  armonia: Armonia;
  /**
   * Cuánto se pega a la nota, de 0 a 1. En 1 queda clavada (el sonido de
   * afinador duro que se busca en lo urbano); por debajo conserva parte de tu
   * entonación natural.
   */
  fuerza: number;
}

export interface EntonarResultado {
  buffer: AudioBuffer;
  /** Cuántas sílabas se han podido entonar. */
  entonadas: number;
  /** Cuántas había en total, para saber si de verdad ha cantado. */
  total: number;
  /** Semitonos que se ha movido cada sílaba, de media. */
  movimientoMedio: number;
}

export function entonar(
  ctx: BaseAudioContext,
  voz: AudioBuffer,
  onsets: Onset[],
  { bpm, stepsPerBar, takeOffset, tonica, armonia, fuerza }: EntonarOpciones
): EntonarResultado | null {
  if (onsets.length < 2) return null;

  const sampleRate = voz.sampleRate;
  const muestras = toMono(voz);
  const analisis = analyzePitch(voz);
  if (!analisis.points.length || analisis.medianMidi === null) return null;

  const segundosPorCompas = (60 / bpm) * 4;
  void stepsPerBar;

  // En qué compás del tema cae cada sílaba: decide qué acorde le toca.
  const compasPorSilaba = onsets.map((onset) =>
    Math.max(0, Math.floor((takeOffset + onset.time) / segundosPorCompas))
  );

  const melodia = componerMelodia({
    tonica,
    armonia,
    compasPorSilaba,
    centroCantante: analisis.medianMidi,
  });

  const salida = ctx.createBuffer(1, voz.length, sampleRate);
  const destino = salida.getChannelData(0);
  let entonadas = 0;
  let movimiento = 0;

  for (let i = 0; i < onsets.length; i++) {
    const desde = Math.max(0, Math.floor(onsets[i].time * sampleRate));
    const hasta =
      i + 1 < onsets.length
        ? Math.min(muestras.length, Math.floor(onsets[i + 1].time * sampleRate))
        : muestras.length;
    if (hasta <= desde) continue;
    const trozo = muestras.subarray(desde, hasta);

    // Tono real del trozo: la mediana de lo medido dentro de él aguanta mejor
    // los golpes de consonante que un solo valor suelto.
    const dentro = analisis.points
      .filter((punto) => punto.time * sampleRate >= desde && punto.time * sampleRate < hasta)
      .map((punto) => punto.midi)
      .sort((a, b) => a - b);

    // Cuando no se le mide el tono a una sílaba —una consonante, una palabra
    // soplada, ruido de la habitación— se tira del tono central de la toma en
    // vez de dejarla como estaba. Saltársela en silencio era lo que hacía que
    // media canción saliera hablada: cuantas más sílabas se escapan, más suena
    // a grabación cruda y menos a alguien cantando.
    const actual = dentro.length ? dentro[dentro.length >> 1] : analisis.medianMidi;
    const objetivo = melodia[i]?.midi ?? actual;

    // El salto se recorta a una octava en vez de descartar la sílaba: aunque la
    // medida se haya ido, moverla acerca más al tono que no tocarla.
    const semitonos = Math.max(-12, Math.min(12, (objetivo - actual) * fuerza));

    const ratio = 2 ** (semitonos / 12);
    const periodo = sampleRate / midiToHz(actual);
    const desplazado = pitchShiftSegment(trozo, ratio, periodo);
    destino.set(desplazado.subarray(0, hasta - desde), desde);
    entonadas++;
    movimiento += Math.abs(semitonos);
  }

  // Lo que hay antes del primer ataque se copia tal cual.
  const primero = Math.max(0, Math.floor(onsets[0].time * sampleRate));
  for (let i = 0; i < primero; i++) destino[i] = muestras[i];

  return {
    buffer: salida,
    total: onsets.length,
    entonadas,
    movimientoMedio: entonadas ? movimiento / entonadas : 0,
  };
}
