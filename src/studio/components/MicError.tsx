import { useEffect, useState } from "react";
import { micDiagnostics } from "@/studio/audio/importAudio";
import { Button } from "./ui";

/**
 * El aviso de que el microfono no ha abierto, con el diagnostico detras.
 * Un "no se pudo abrir el microfono" a secas no sirve para arreglar nada: aqui
 * se puede desplegar y copiar todo lo que decide el permiso.
 */
export function MicError({ message, error }: { message: string; error?: unknown }) {
  const [report, setReport] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    void micDiagnostics(error).then((text) => {
      if (alive) setReport(text);
    });
    return () => {
      alive = false;
    };
  }, [error]);

  const copy = async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="rounded-lg border border-red-900 bg-red-950/50 px-3 py-3 text-sm text-red-300">
      <p>{message}</p>
      {report && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-red-400/80">
            Ver por que (diagnostico)
          </summary>
          <pre className="mt-2 overflow-x-auto rounded bg-neutral-950/70 p-2 text-[11px] leading-5 text-neutral-400">
            {report}
          </pre>
          <Button onClick={copy} className="mt-2 px-2 py-1 text-xs">
            {copied ? "Copiado" : "Copiar diagnostico"}
          </Button>
        </details>
      )}
    </div>
  );
}
