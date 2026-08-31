/**
 * Cambio de tono sin cambiar la duración (TD-PSOLA).
 *
 * La idea: la voz es una sucesión de pulsos de las cuerdas vocales, uno cada
 * periodo. Si se recortan granos centrados en cada pulso y se vuelven a pegar
 * más juntos, la voz sube de tono; más separados, baja. La duración se mantiene
 * porque los granos se reutilizan o se saltan según haga falta, y el timbre no
 * se estropea porque cada grano conserva su forma.
 *
 * Es lo que hace que una frase hablada pueda cantar una melodía sin sonar a
 * ardilla, que es justo lo que pasaría si se acelerara el audio.
 */

/**
 * Desplaza el tono de un trozo de voz.
 *
 * @param input   El trozo, mono.
 * @param ratio   Cuánto se multiplica la frecuencia. 2 = una octava arriba.
 * @param period  Periodo de la voz en muestras. Si no se conoce, no se toca.
 */
export function pitchShiftSegment(
  input: Float32Array,
  ratio: number,
  period: number
): Float32Array {
  const salida = new Float32Array(input.length);
  // Sin periodo fiable (una consonante, un silencio) no hay nada que desplazar.
  if (!Number.isFinite(period) || period < 16 || period > input.length / 2 || ratio <= 0) {
    salida.set(input);
    return salida;
  }
  if (Math.abs(ratio - 1) < 0.001) {
    salida.set(input);
    return salida;
  }

  const periodo = Math.round(period);
  const grano = periodo * 2;
  const ventana = new Float32Array(grano);
  for (let i = 0; i < grano; i++) ventana[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / grano);

  // Marcas de sintesis: separadas por el periodo nuevo.
  const nuevoPeriodo = Math.max(2, periodo / ratio);
  const pesos = new Float32Array(input.length);

  for (let centro = periodo; centro < input.length; centro += nuevoPeriodo) {
    // El grano se toma del pulso original mas cercano a esta posicion.
    const origen = Math.round(centro / periodo) * periodo;
    const desde = Math.round(centro) - periodo;
    for (let i = 0; i < grano; i++) {
      const destino = desde + i;
      const fuente = origen - periodo + i;
      if (destino < 0 || destino >= salida.length) continue;
      if (fuente < 0 || fuente >= input.length) continue;
      salida[destino] += input[fuente] * ventana[i];
      pesos[destino] += ventana[i];
    }
  }

  // Al solapar granos la amplitud sube; se divide por el peso acumulado.
  for (let i = 0; i < salida.length; i++) {
    if (pesos[i] > 0.001) salida[i] /= pesos[i];
    else salida[i] = input[i];
  }
  return salida;
}
