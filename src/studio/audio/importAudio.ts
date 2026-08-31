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

/**
 * Diagnostico del microfono.
 *
 * Cuando el permiso falla, el navegador da un nombre de error escueto y poco
 * mas. Esto reune de una vez todo lo que decide si el microfono puede abrirse
 * —contexto seguro, marco, estado del permiso, error exacto— para poder pegarlo
 * y saber que pasa sin ir adivinando.
 */
export async function micDiagnostics(error?: unknown): Promise<string> {
  const lines: string[] = [];
  const add = (label: string, value: unknown) => lines.push(`${label}: ${String(value)}`);

  add("direccion", typeof location !== "undefined" ? location.href : "?");
  add("contexto seguro", typeof isSecureContext !== "undefined" ? isSecureContext : "?");
  add("dentro de un marco", isFramed());
  add("mediaDevices", Boolean(navigator?.mediaDevices?.getUserMedia));

  try {
    const status = await navigator.permissions?.query({
      name: "microphone" as PermissionName,
    });
    add("permiso", status?.state ?? "sin dato");
  } catch {
    add("permiso", "no consultable");
  }

  try {
    const devices = await navigator.mediaDevices?.enumerateDevices();
    const inputs = devices?.filter((device) => device.kind === "audioinput") ?? [];
    add("entradas de audio", inputs.length);
    // Sin permiso concedido los nombres llegan vacios: eso ya es una pista.
    add("nombres visibles", inputs.filter((device) => device.label).length);
  } catch {
    add("entradas de audio", "no consultables");
  }

  if (error) {
    const name = (error as { name?: string } | null)?.name;
    add("error", `${name ?? "?"} — ${error instanceof Error ? error.message : String(error)}`);
  }
  add("navegador", navigator?.userAgent ?? "?");

  return lines.join("\n");
}
