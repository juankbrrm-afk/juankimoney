import clsx from "clsx";
import { useState } from "react";
import { ESTILOS, patronDeEstilo } from "@/studio/data/estilos";
import { useStudio } from "@/studio/state/useStudio";
import { engine } from "@/studio/audio/engine";
import { Panel } from "./ui";

/**
 * Elegir el estilo del tema. Un toque deja el tempo, el swing, la bateria, la
 * nota del 808 y el patron de flow del genero, que es el que se le impone a la
 * voz al cuadrarla. A partir de ahi se puede tocar todo a mano.
 */
export function EstiloPicker() {
  const { settings, patch, setPattern } = useStudio();
  const [elegido, setElegido] = useState<string | null>(null);

  const aplicar = async (id: string) => {
    const estilo = ESTILOS.find((e) => e.id === id);
    if (!estilo) return;
    setElegido(id);
    patch({
      bpm: estilo.bpm,
      swing: estilo.swing,
      subMidi: estilo.subMidi,
      flowTemplateId: estilo.flowTemplateId,
    });
    setPattern(patronDeEstilo(estilo, settings.stepsPerBar, settings.bars));
    // Suena en cuanto lo eliges: es la unica forma de decidir si te vale.
    engine.update({ bpm: estilo.bpm, swing: estilo.swing, subMidi: estilo.subMidi });
    if (!engine.isPlaying) await engine.play();
  };

  const actual = ESTILOS.find((e) => e.id === elegido);

  return (
    <Panel
      title="Estilo"
      hint="Elige cómo quieres que suene. Deja el ritmo, el tempo y el flow del género montados; luego lo cambias a tu gusto."
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {ESTILOS.map((estilo) => (
          <button
            key={estilo.id}
            type="button"
            onClick={() => void aplicar(estilo.id)}
            className={clsx(
              "rounded-lg border px-3 py-3 text-left transition-colors",
              elegido === estilo.id
                ? "border-lime-300 bg-lime-400 text-neutral-950"
                : "border-neutral-700 bg-neutral-950/50 text-neutral-200 hover:border-neutral-500"
            )}
          >
            <span className="block text-base font-semibold">{estilo.nombre}</span>
            <span
              className={clsx(
                "block text-xs tabular-nums",
                elegido === estilo.id ? "text-neutral-800" : "text-neutral-500"
              )}
            >
              {estilo.bpm} BPM
            </span>
          </button>
        ))}
      </div>

      {actual && <p className="mt-3 text-sm text-neutral-400">{actual.descripcion}</p>}

      <p className="mt-3 text-xs text-neutral-600">
        Son ritmos de género, no imitaciones de ningún artista: un dembow es un dembow lo toque
        quien lo toque. La voz que suena es la tuya, siempre.
      </p>
    </Panel>
  );
}
