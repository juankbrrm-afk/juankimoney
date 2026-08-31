/**
 * Importar audio desde un archivo. Es la via alternativa cuando el navegador no
 * deja abrir el microfono —dentro de un marco, por ejemplo— y tambien la comoda
 * en el movil: grabas con la app de notas de voz y traes el archivo aqui.
 */

export interface ImportedAudio {
  buffer: AudioBuffer;
  name: string;
}

export async function importAudioFile(
  ctx: BaseAudioContext,
  file: File
): Promise<ImportedAudio> {
  const bytes = await file.arrayBuffer();
  const buffer = await ctx.decodeAudioData(bytes);
  return { buffer, name: file.name.replace(/\.[^.]+$/, "") };
}

/** Mensaje util cuando el navegador no puede abrir el microfono. */
export function micErrorMessage(error: unknown): string {
  const framed = typeof window !== "undefined" && window.self !== window.top;
  const inFrame = framed
    ? " Estas viendo el estudio dentro de un marco y ahi el navegador suele bloquear el microfono: abrelo en su propia pestaña, o importa un archivo de audio con el boton de al lado."
    : "";

  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return `Este navegador no ofrece acceso al microfono. Hace falta una direccion https.${inFrame}`;
  }

  const name = (error as { name?: string } | null)?.name;
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return `El navegador ha bloqueado el microfono.${inFrame || " Dale permiso al sitio y vuelve a intentarlo."}`;
    case "NotFoundError":
    case "OverconstrainedError":
      return "No se encuentra ningun microfono conectado.";
    case "NotReadableError":
      return "El microfono lo esta usando otra aplicacion. Cierrala y vuelve a intentarlo.";
    default:
      return `${error instanceof Error ? error.message : "No se pudo abrir el microfono"}.${inFrame}`;
  }
}

/** true cuando la pagina corre dentro de un iframe. */
export function isFramed(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}
