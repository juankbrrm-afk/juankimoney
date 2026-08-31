import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { engine } from "@/studio/audio/engine";
import { recorder } from "@/studio/audio/recorder";
import { importAudioFile, isFramed, micErrorMessage } from "@/studio/audio/importAudio";
import { detectOnsets } from "@/studio/analysis/onsets";
import { quantizeVocal } from "@/studio/audio/quantizeVocal";
import { entonar } from "@/studio/audio/entonar";
import type { Armonia } from "@/studio/audio/melodia";
import { armoniaDe } from "@/studio/audio/melodia";
import {
  canShareAudio,
  downloadBlob,
  encodeCompressed,
  encodeWav,
  renderMix,
  shareAudio,
} from "@/studio/audio/mixdown";
import type { Estilo } from "@/studio/data/estilos";
import { patronDeEstilo } from "@/studio/data/estilos";
import { EJEMPLOS, interpretar } from "@/studio/data/interpretar";
import { useStudio, useTransport } from "@/studio/state/useStudio";
import { useMicLevel } from "@/studio/state/useMicLevel";
import { Button, Meter } from "./ui";
import { MicError } from "./MicError";

/**
 * Hacer una canción, de principio a fin, en una pantalla.
 *
 * Pegas la letra, eliges el estilo, grabas tu voz y sale la canción. Todo lo de
 * en medio —cuadrar la voz al flow del estilo, mezclarla con el beat, codificar
 * el archivo— pasa solo al soltar el botón de grabar. Lo que hay debajo es el
 * mismo motor que el modo avanzado; aquí solo está escondido.
 */

type Fase = "listo" | "cuenta" | "grabando" | "montando" | "hecha";

interface Resultado {
  blob: Blob;
  nombre: string;
  url: string;
}

function limpio(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function HacerCancion() {
  const { settings, patch, setPattern, pattern, barSeconds } = useStudio();
  const { playing, position } = useTransport();

  const [letra, setLetra] = useState("");
  const [comoSuena, setComoSuena] = useState("");
  const [estilo, setEstilo] = useState<Estilo | null>(null);
  const [entendido, setEntendido] = useState<string[]>([]);
  const [armonia, setArmonia] = useState<Armonia>(armoniaDe("perreo"));
  const [fase, setFase] = useState<Fase>("listo");
  const [paso, setPaso] = useState("");
  const [error, setError] = useState<{ message: string; raw?: unknown } | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [progreso, setProgreso] = useState(0);
  const desfase = useRef(0);
  const archivo = useRef<HTMLInputElement>(null);
  const nivel = useMicLevel(fase === "grabando" || fase === "cuenta");

  const versos = useMemo(
    () => letra.split("\n").map((l) => l.trim()).filter(Boolean),
    [letra]
  );
  const sePuedeCompartir = canShareAudio();

  useEffect(() => {
    const url = resultado?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [resultado?.url]);

  /** Lee lo que has escrito, monta ese ritmo y lo pone a sonar. */
  const aplicar = useCallback(
    async (texto: string) => {
      if (!texto.trim()) return;
      const lectura = interpretar(texto);
      setEstilo(lectura.estilo);
      setEntendido(lectura.entendido);
      setArmonia(lectura.armonia);
      patch({
        acordes: lectura.armonia.acordes,
        modo: lectura.armonia.modo,
        estiloId: lectura.estilo.id,
        bpm: lectura.estilo.bpm,
        swing: lectura.estilo.swing,
        subMidi: lectura.estilo.subMidi,
        flowSteps: lectura.estilo.flow.pasos,
        aireMs: lectura.estilo.flow.aire,
      });
      setPattern(patronDeEstilo(lectura.estilo, settings.stepsPerBar, settings.bars));
      engine.update({
        bpm: lectura.estilo.bpm,
        swing: lectura.estilo.swing,
        subMidi: lectura.estilo.subMidi,
        acordes: lectura.armonia.acordes,
        modo: lectura.armonia.modo,
      });
      // Suena en cuanto lo escribes: se decide de oído, no leyendo.
      engine.unlock();
      if (engine.isPlaying) engine.stop();
      await engine.play();
    },
    [patch, setPattern, settings.stepsPerBar, settings.bars]
  );

  const pararPrueba = () => engine.stop();

  const grabar = useCallback(async () => {
    setError(null);
    setResultado(null);
    // El micrófono se pide lo primero: Safari solo lo concede dentro del gesto.
    const peticion = recorder.requestStream();
    const ctx = engine.unlock();
    try {
      await peticion;
      await engine.ensureContext();
      await recorder.arm(ctx, engine.master!);
      if (settings.latencyMs === 0) patch({ latencyMs: Math.round(engine.outputLatencyMs) });
      setFase("cuenta");
      await engine.play();
      const inicio = recorder.start();
      desfase.current = inicio - engine.anchorTime - settings.latencyMs / 1000;
      setFase("grabando");
    } catch (err) {
      setFase("listo");
      setError({ message: micErrorMessage(err), raw: err });
    }
  }, [patch, settings.latencyMs]);

  /**
   * Al parar se hace todo de una: se cuadra la voz al flow del estilo, se mezcla
   * con el beat y se codifica. El usuario no toca nada de esto.
   */
  const montar = useCallback(
    async (voz: AudioBuffer, offset: number) => {
      const avisar = async (texto: string) => {
        setPaso(texto);
        // Cede un frame para que el aviso se pinte antes de bloquear el hilo.
        await new Promise((listo) => setTimeout(listo, 30));
      };
      setFase("montando");
      try {
        const ctx = await engine.ensureContext();

        await avisar("Cuadrando tu voz al flow…");
        const onsets = detectOnsets(voz, { minGap: 0.07 });
        const cuadrada =
          onsets.length >= 3
            ? quantizeVocal(ctx, voz, onsets, {
                bpm: settings.bpm,
                stepsPerBar: settings.stepsPerBar,
                takeOffset: offset,
                strength: 1,
                mode: "flow",
                template: {
                  id: settings.estiloId ?? "flow",
                  name: "flow",
                  description: "",
                  steps: settings.flowSteps,
                },
                aireMs: settings.aireMs,
              })
            : null;

        await avisar("Poniéndole entonación…");
        // Cuadrar arregla cuándo dices cada sílaba; esto arregla en qué nota.
        const base = cuadrada?.buffer ?? voz;
        const paraEntonar = cuadrada ? detectOnsets(base, { minGap: 0.07 }) : onsets;
        const cantada = entonar(ctx, base, paraEntonar, {
          bpm: settings.bpm,
          stepsPerBar: settings.stepsPerBar,
          takeOffset: offset,
          tonica: settings.subMidi,
          armonia,
          fuerza: 1,
        });

        await avisar("Montando la mezcla…");
        const mezcla = await renderMix({
          pattern,
          settings,
          includeBeat: true,
          takes: [
            {
              id: "voz",
              name: "voz",
              buffer: cantada?.buffer ?? cuadrada?.buffer ?? voz,
              offset,
              baseOffset: offset,
              gain: 1,
              muted: false,
              soloed: false,
              createdAt: Date.now(),
            },
          ],
        });

        await avisar("Preparando el archivo…");
        const nombre =
          limpio(versos[0] ?? "mi tema")
            .slice(0, 28)
            .replace(/-+$/, "") || "mi-tema";
        const codificada = await encodeCompressed(ctx, mezcla, setProgreso);
        const blob = codificada?.blob ?? encodeWav(mezcla);
        const extension = codificada?.audioExtension ?? "wav";
        setResultado({
          blob,
          nombre: `${nombre}.${extension}`,
          url: URL.createObjectURL(blob),
        });
        setFase("hecha");
      } catch (err) {
        setFase("listo");
        setError({
          message: err instanceof Error ? err.message : "No se pudo montar la canción",
        });
      } finally {
        setPaso("");
        setProgreso(0);
      }
    },
    [pattern, settings, versos, armonia]
  );

  const parar = useCallback(() => {
    const grabado = recorder.stop();
    engine.stop();
    if (!grabado) {
      setFase("listo");
      setError({ message: "No llegó audio del micrófono." });
      return;
    }
    void montar(grabado.buffer, desfase.current);
  }, [montar]);

  const importar = useCallback(
    async (file: File) => {
      setError(null);
      try {
        const ctx = await engine.ensureContext();
        const { buffer } = await importAudioFile(ctx, file);
        await montar(buffer, 0);
      } catch {
        setError({ message: "No se pudo leer ese audio. Prueba con un m4a, mp3 o wav." });
      }
    },
    [montar]
  );

  const compartir = async () => {
    if (!resultado) return;
    try {
      const ok = await shareAudio(resultado.blob, resultado.nombre, "Mi canción");
      if (!ok) downloadBlob(resultado.blob, resultado.nombre);
    } catch {
      downloadBlob(resultado.blob, resultado.nombre);
    }
  };

  // Verso que toca cantar ahora mismo: un verso por compás.
  const compasActual = playing && position >= 0 ? Math.floor(position / barSeconds) : -1;
  const cuentaAtras = playing && position < 0 ? Math.ceil(-position / (barSeconds / 4)) : 0;

  const paso1 = versos.length > 0;
  const paso2 = paso1 && estilo !== null;

  return (
    <div className="space-y-4">
      {/* 1 — LA LETRA */}
      <Bloque numero={1} titulo="Tu letra" hecho={paso1}>
        <textarea
          value={letra}
          onChange={(e) => setLetra(e.target.value)}
          rows={6}
          placeholder={"Pega aquí tu letra.\nUna frase por línea."}
          className="w-full resize-y rounded-lg border border-neutral-800 bg-neutral-900 p-3 text-base leading-7 text-neutral-100 focus:border-neutral-600 focus:outline-none"
        />
        {paso1 && (
          <p className="mt-2 text-sm text-neutral-500">
            {versos.length} frases · {versos.length} compases
          </p>
        )}
      </Bloque>

      {/* 2 — EL ESTILO */}
      <Bloque numero={2} titulo="Cómo quieres que suene" hecho={paso2} apagado={!paso1}>
        <p className="mb-2 text-sm text-neutral-400">
          Escríbelo tú, con tus palabras. El género, el tempo, cómo va la voz.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={comoSuena}
            onChange={(e) => setComoSuena(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void aplicar(comoSuena);
            }}
            placeholder="reggaeton lento y oscuro, voz arrastrada"
            className="flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-3 text-base text-neutral-100 focus:border-neutral-500 focus:outline-none"
          />
          <Button
            variant="primary"
            onClick={() => void aplicar(comoSuena)}
            disabled={!comoSuena.trim()}
            className="px-5 py-3 text-base"
          >
            Escuchar
          </Button>
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {EJEMPLOS.map((ejemplo) => (
            <button
              key={ejemplo}
              type="button"
              onClick={() => {
                setComoSuena(ejemplo);
                void aplicar(ejemplo);
              }}
              className="rounded-full border border-neutral-700 px-2.5 py-1 text-xs text-neutral-400 hover:border-neutral-500 hover:text-neutral-200"
            >
              {ejemplo}
            </button>
          ))}
        </div>

        {estilo && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-sm text-neutral-500">Lo he montado así:</span>
            {entendido.map((cosa) => (
              <span
                key={cosa}
                className="rounded-full border border-lime-700 px-2.5 py-1 text-xs text-lime-300"
              >
                {cosa}
              </span>
            ))}
            {playing && fase === "listo" && (
              <Button onClick={pararPrueba} className="ml-auto px-3 py-1.5 text-sm">
                Parar
              </Button>
            )}
          </div>
        )}

        {estilo && (
          <p className="mt-2 text-xs text-neutral-600">
            ¿No es eso? Cambia lo que has escrito y vuelve a darle a Escuchar.
          </p>
        )}
      </Bloque>

      {/* 3 — TU VOZ */}
      <Bloque numero={3} titulo="Cántala tú" hecho={fase === "hecha"} apagado={!paso2}>
        {fase === "listo" && (
          <>
            <p className="mb-3 text-sm text-neutral-400">
              Suena el beat con una cuenta de entrada y te va marcando la frase que toca. Cuando
              pares, la canción se monta sola.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="record" onClick={grabar} className="px-6 py-3 text-base">
                Grabar mi voz
              </Button>
              <Button onClick={() => archivo.current?.click()}>Subir un audio</Button>
              <input
                ref={archivo}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void importar(file);
                }}
              />
            </div>
            {isFramed() && (
              <p className="mt-3 text-xs text-amber-500">
                Estás dentro de un marco y aquí el navegador suele cerrar el micrófono. Ábrelo en
                Safari, o graba con la app de notas de voz y súbelo.
              </p>
            )}
          </>
        )}

        {(fase === "cuenta" || fase === "grabando") && (
          <div className="space-y-4">
            <div className="min-h-28 rounded-lg bg-neutral-950 p-4 text-center">
              {cuentaAtras > 0 ? (
                <p className="text-5xl font-bold text-amber-400 tabular-nums">{cuentaAtras}</p>
              ) : (
                <>
                  <p className="text-xl leading-8 font-semibold text-lime-300">
                    {versos[compasActual] ?? "…"}
                  </p>
                  <p className="mt-2 text-sm text-neutral-600">
                    {versos[compasActual + 1] ?? ""}
                  </p>
                </>
              )}
            </div>
            <Meter value={nivel} />
            <Button variant="danger" onClick={parar} className="w-full px-6 py-3 text-base">
              Ya está — hacer la canción
            </Button>
          </div>
        )}

        {fase === "montando" && (
          <div className="space-y-2">
            <p className="text-base font-semibold text-lime-300">{paso}</p>
            {progreso > 0 && (
              <>
                <Meter value={progreso} />
                <p className="text-xs text-neutral-500">
                  El archivo se prepara a tiempo real: tarda lo que dura la canción.
                </p>
              </>
            )}
          </div>
        )}

        {fase === "hecha" && (
          <Button onClick={() => { setResultado(null); setFase("listo"); }}>
            Grabar otra vez
          </Button>
        )}
      </Bloque>

      {/* 4 — LA CANCIÓN */}
      {resultado && (
        <Bloque numero={4} titulo="Tu canción" hecho>
          <audio controls autoPlay src={resultado.url} className="w-full" />
          <div className="mt-3 flex flex-wrap gap-2">
            {sePuedeCompartir && (
              <Button variant="primary" onClick={compartir} className="px-6 py-3 text-base">
                Compartir
              </Button>
            )}
            <Button onClick={() => downloadBlob(resultado.blob, resultado.nombre)}>Guardar</Button>
          </div>
          <p className="mt-2 text-xs text-neutral-600">{resultado.nombre}</p>
        </Bloque>
      )}

      {error && <MicError message={error.message} error={error.raw} />}
    </div>
  );
}

function Bloque({
  numero,
  titulo,
  hecho,
  apagado,
  children,
}: {
  numero: number;
  titulo: string;
  hecho?: boolean;
  apagado?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={clsx(
        "rounded-xl border p-4 transition-opacity",
        hecho ? "border-lime-900/60 bg-neutral-900/60" : "border-neutral-800 bg-neutral-900/60",
        apagado && "pointer-events-none opacity-40"
      )}
    >
      <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-neutral-100">
        <span
          className={clsx(
            "grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold",
            hecho ? "bg-lime-400 text-neutral-950" : "bg-neutral-800 text-neutral-400"
          )}
        >
          {hecho ? "✓" : numero}
        </span>
        {titulo}
      </h2>
      {children}
    </section>
  );
}
