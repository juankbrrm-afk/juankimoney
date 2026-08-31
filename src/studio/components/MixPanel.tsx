import { useEffect, useRef, useState } from "react";
import { engine } from "@/studio/audio/engine";
import {
  canShareAudio,
  downloadBlob,
  encodeCompressed,
  encodeWav,
  renderMix,
  shareAudio,
  viewerDownloads,
} from "@/studio/audio/mixdown";
import { useStudio } from "@/studio/state/useStudio";
import { Button, Panel, Stat } from "./ui";

function slug(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function tamaño(bytes: number): string {
  return bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} kB`;
}

interface Cancion {
  blob: Blob;
  nombre: string;
  url: string;
  comprimida: boolean;
}

/**
 * Donde recoges la cancion.
 *
 * Se prepara en un paso y se entrega en otro a proposito: iOS solo abre su menu
 * de compartir si la llamada nace del toque, y renderizar la mezcla lleva su
 * tiempo. Preparando antes, el boton de compartir esta libre de esperas.
 */
export function MixPanel() {
  const { settings, pattern, takes } = useStudio();
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [title, setTitle] = useState("mi tema");
  const [error, setError] = useState<string | null>(null);
  const [cancion, setCancion] = useState<Cancion | null>(null);
  const [compartido, setCompartido] = useState(false);
  const anterior = useRef<string | null>(null);

  const sePuedeCompartir = canShareAudio();
  const barSeconds = (60 / settings.bpm) * 4;
  const longest = takes.reduce(
    (max, take) => Math.max(max, Math.max(0, take.offset) + take.buffer.duration),
    0
  );
  // Lo que se va a renderizar de verdad: el bucle, estirado hasta cubrir la toma
  // mas larga. Los compases de la letra son un plan, no lo que suena todavia.
  const compasesRender = Math.max(settings.bars, Math.ceil(longest / barSeconds) || settings.bars);
  const duracion = Math.max(compasesRender * barSeconds, longest);

  // Una cancion nueva invalida la anterior; su URL se suelta al reemplazarla.
  useEffect(() => {
    if (anterior.current && anterior.current !== cancion?.url) {
      URL.revokeObjectURL(anterior.current);
    }
    anterior.current = cancion?.url ?? null;
  }, [cancion]);

  const render = async (soloBeat: boolean) => {
    await engine.ensureContext();
    return renderMix({
      pattern,
      takes: soloBeat ? [] : takes,
      settings,
      includeBeat: true,
    });
  };

  /** Prepara la cancion comprimida, que es la que se puede compartir y enviar. */
  const preparar = async (soloBeat: boolean) => {
    setError(null);
    setCompartido(false);
    setProgress(0);
    setBusy("preparar");
    const nombreBase = `${slug(title) || "tema"}${soloBeat ? "-beat" : ""}`;
    try {
      const buffer = await render(soloBeat);
      setBusy("codificar");
      const encoded = await encodeCompressed(await engine.ensureContext(), buffer, setProgress);
      if (!encoded) {
        // Sin codificador queda el WAV, que pesa mas pero sale al instante.
        const blob = encodeWav(buffer);
        setCancion({
          blob,
          nombre: `${nombreBase}.wav`,
          url: URL.createObjectURL(blob),
          comprimida: false,
        });
        return;
      }
      setCancion({
        blob: encoded.blob,
        nombre: `${nombreBase}.${encoded.audioExtension}`,
        url: URL.createObjectURL(encoded.blob),
        comprimida: true,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo montar la cancion");
    } finally {
      setBusy(null);
      setProgress(0);
    }
  };

  /** Descarga directa del WAV sin comprimir: inmediata y a maxima calidad. */
  const descargarWav = async (soloBeat: boolean) => {
    setError(null);
    setBusy("wav");
    const nombre = `${slug(title) || "tema"}${soloBeat ? "-beat" : ""}.wav`;
    try {
      const buffer = await render(soloBeat);
      const blob = encodeWav(buffer);

      // Dentro de un visor incrustado el enlace de descarga no hace nada: ahi la
      // entrega pasa por su puente, que ademas no admite WAV.
      const downloads = await viewerDownloads();
      if (downloads) {
        setBusy("codificar");
        const encoded = await encodeCompressed(await engine.ensureContext(), buffer, setProgress);
        if (!encoded) {
          setError("Este navegador no sabe codificar audio.");
          return;
        }
        await downloads.save({
          filename: nombre.replace(/\.wav$/, `.${encoded.extension}`),
          data: encoded.blob,
        });
        return;
      }

      downloadBlob(blob, nombre);
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      if (code === "declined") return;
      setError(
        code ? `No se pudo guardar (${code}).` : err instanceof Error ? err.message : "Fallo al exportar"
      );
    } finally {
      setBusy(null);
      setProgress(0);
    }
  };

  const compartir = async () => {
    if (!cancion) return;
    setError(null);
    try {
      const ok = await shareAudio(cancion.blob, cancion.nombre, title);
      if (ok) setCompartido(true);
      else downloadBlob(cancion.blob, cancion.nombre);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo abrir el menu de compartir");
    }
  };

  return (
    <div className="space-y-4">
      <Panel
        title="Tu canción"
        hint="Aquí se junta todo: el beat y tus tomas en un solo archivo."
      >
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Tempo" value={`${settings.bpm} BPM`} />
          <Stat label="Compases" value={String(compasesRender)} />
          <Stat label="Tomas" value={String(takes.length)} />
          <Stat
            label="Duración"
            value={`${Math.floor(duracion / 60)}:${String(Math.round(duracion % 60)).padStart(2, "0")}`}
          />
        </div>

        <label className="mb-4 flex flex-col gap-1">
          <span className="text-[10px] tracking-[0.16em] text-neutral-500 uppercase">
            Nombre del tema
          </span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-base sm:w-72"
          />
        </label>

        {!cancion ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" disabled={busy !== null} onClick={() => preparar(false)}>
              {busy === "preparar"
                ? "Montando la mezcla…"
                : busy === "codificar"
                  ? `Codificando ${Math.round(progress * 100)}%`
                  : "Montar la canción"}
            </Button>
            <Button disabled={busy !== null} onClick={() => void descargarWav(false)}>
              {busy === "wav" ? "Exportando…" : "Bajar WAV directo"}
            </Button>
            <Button disabled={busy !== null} onClick={() => void descargarWav(true)}>
              Solo el beat
            </Button>
          </div>
        ) : (
          <div className="space-y-3 rounded-lg border border-lime-900/60 bg-lime-950/20 p-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="font-semibold text-lime-300">Lista: {cancion.nombre}</p>
              <span className="text-sm text-neutral-500">
                {tamaño(cancion.blob.size)}
                {cancion.comprimida ? "" : " · sin comprimir"}
              </span>
            </div>

            {/* Escúchala antes de mandarla a nadie. */}
            <audio controls src={cancion.url} className="w-full" />

            <div className="flex flex-wrap gap-2">
              {sePuedeCompartir && (
                <Button variant="primary" onClick={compartir}>
                  {compartido ? "Compartir otra vez" : "Compartir"}
                </Button>
              )}
              <Button onClick={() => downloadBlob(cancion.blob, cancion.nombre)}>Guardar</Button>
              <Button onClick={() => setCancion(null)}>Montar otra</Button>
            </div>

            <p className="text-xs text-neutral-500">
              {sePuedeCompartir
                ? "Compartir abre el menú del móvil: puedes mandarla por WhatsApp, guardarla en Archivos o pasarla al ordenador."
                : "Guardar la baja a la carpeta de descargas de este navegador."}
            </p>
          </div>
        )}

        {busy === "codificar" && (
          <p className="mt-3 text-sm text-neutral-400">
            Codificando a tiempo real: {Math.round(progress * 100)}%. Tarda lo que dura el tema.
          </p>
        )}

        {takes.length === 0 && !cancion && (
          <p className="mt-3 text-sm text-neutral-600">
            Todavía no has grabado ninguna toma, así que solo saldría el beat.
          </p>
        )}

        {error && (
          <p className="mt-3 rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}
      </Panel>

      <Panel title="Niveles" hint="Ajuste rápido de los tres buses antes de montar la canción.">
        <div className="grid gap-4 sm:grid-cols-3">
          {(
            [
              ["beat", "Beat"],
              ["take", "Voces"],
              ["master", "Master"],
            ] as const
          ).map(([bus, label]) => (
            <label key={bus} className="flex flex-col gap-1">
              <span className="text-[10px] tracking-[0.16em] text-neutral-500 uppercase">
                {label}
              </span>
              <input
                type="range"
                min={0}
                max={1.4}
                step={0.01}
                defaultValue={bus === "master" ? 0.9 : bus === "beat" ? 0.85 : 1}
                onChange={(e) => engine.setBusGain(bus, Number(e.target.value))}
                className="accent-lime-400"
              />
            </label>
          ))}
        </div>
        <p className="mt-3 text-xs text-neutral-600">
          Estos niveles afectan a la escucha; la canción usa los volúmenes de cada toma.
        </p>
      </Panel>

      <Panel title="Aviso" hint="">
        <p className="text-sm text-neutral-400">
          Las tomas viven en memoria mientras la pestaña esté abierta. El tempo, el patrón y la
          letra sí se guardan solos en este navegador. Monta y guarda la canción antes de cerrar
          si quieres conservar la voz.
        </p>
      </Panel>
    </div>
  );
}
