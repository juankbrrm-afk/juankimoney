import clsx from "clsx";
import { ESTILOS, patronDeEstilo } from "@/studio/data/estilos";
import { useStudio } from "@/studio/state/useStudio";
import { engine } from "@/studio/audio/engine";
import { Panel } from "./ui";

/**
 * Elegir el estilo. Un toque deja montado el tempo, la bateria y —lo que de
 * verdad cambia como suena el tema— el flow: donde caen las silabas y cuanto se
 * recuestan sobre el beat. Ese flow es el que se le aplica a tu voz al
 * cuadrarla, asi que elegir aqui no es solo elegir bateria.
 */
export function EstiloPicker() {
  const { settings, patch, setPattern } = useStudio();

  const aplicar = async (id: string) => {
    const estilo = ESTILOS.find((e) => e.id === id);
    if (!estilo) return;
    patch({
      estiloId: estilo.id,
      bpm: estilo.bpm,
      swing: estilo.swing,
      subMidi: estilo.subMidi,
      flowSteps: estilo.flow.pasos,
      aireMs: estilo.flow.aire,
    });
    setPattern(patronDeEstilo(estilo, settings.stepsPerBar, settings.bars));
    // Suena en cuanto lo eliges: es la unica forma de decidir si te vale.
    engine.update({ bpm: estilo.bpm, swing: estilo.swing, subMidi: estilo.subMidi });
    if (!engine.isPlaying) await engine.play();
  };

  const actual = ESTILOS.find((e) => e.id === settings.estiloId);

  return (
    <Panel
      title="Estilo y flow"
      hint="Elige cómo quieres que suene. No solo cambia la batería: cambia dónde caen tus sílabas y cuánto se recuesta tu voz sobre el beat."
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {ESTILOS.map((estilo) => {
          const activo = settings.estiloId === estilo.id;
          return (
            <button
              key={estilo.id}
              type="button"
              onClick={() => void aplicar(estilo.id)}
              className={clsx(
                "rounded-lg border px-3 py-3 text-left transition-colors",
                activo
                  ? "border-lime-300 bg-lime-400 text-neutral-950"
                  : "border-neutral-700 bg-neutral-950/50 text-neutral-200 hover:border-neutral-500"
              )}
            >
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-base font-semibold">{estilo.nombre}</span>
                <span
                  className={clsx("text-sm", activo ? "text-neutral-800" : "text-neutral-400")}
                >
                  {estilo.referencia}
                </span>
              </span>
              <span
                className={clsx(
                  "mt-0.5 block text-xs tabular-nums",
                  activo ? "text-neutral-800" : "text-neutral-500"
                )}
              >
                {estilo.bpm} BPM ·{" "}
                {estilo.flow.aire > 0
                  ? `${estilo.flow.aire} ms por detrás`
                  : estilo.flow.aire < 0
                    ? `${Math.abs(estilo.flow.aire)} ms por delante`
                    : "clavado al beat"}
              </span>
            </button>
          );
        })}
      </div>

      {actual && (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-neutral-400">{actual.descripcion}</p>
          {/* Donde va a caer cada silaba de tu voz con este flow. */}
          <div className="flex items-end gap-0.5">
            {Array.from({ length: 16 }, (_, paso) => (
              <div
                key={paso}
                className={clsx(
                  "h-7 flex-1 rounded-sm",
                  actual.flow.pasos.includes(paso)
                    ? "bg-lime-400"
                    : paso % 4 === 0
                      ? "bg-neutral-700"
                      : "bg-neutral-800"
                )}
              />
            ))}
          </div>
          <p className="text-xs text-neutral-600">
            En verde, dónde cae cada sílaba tuya en el compás. Eso es el flow que te aplica
            «Cuadrar» en la pestaña Grabar.
          </p>
        </div>
      )}

      <p className="mt-3 text-xs text-neutral-600">
        Los nombres de artista son la referencia de la cadencia, para que sepas a qué suena. La
        voz es siempre la tuya: aquí no canta nadie más.
      </p>
    </Panel>
  );
}
