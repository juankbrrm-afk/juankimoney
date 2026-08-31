/**
 * Superficie minima del runtime de Claude que usa el estudio cuando se publica
 * como artifact. Fuera de ese entorno `window.claude` no existe, por eso todo
 * el acceso pasa por comprobaciones: la aplicacion tiene que funcionar igual
 * alojada en cualquier otro sitio.
 */
interface ClaudeDownloads {
  save(request: { filename: string; data: Blob | ArrayBuffer | string }): Promise<{ status: string }>;
}

interface ClaudeRuntime {
  use(name: "downloads"): Promise<ClaudeDownloads | null>;
}

interface Window {
  claude?: ClaudeRuntime;
}
