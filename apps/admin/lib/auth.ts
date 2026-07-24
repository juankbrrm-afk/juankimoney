/**
 * Gate de contraseña única para el panel — stopgap explícito hasta que este dashboard
 * se conecte a Supabase Auth + el rol staff/admin de `profiles`
 * (docs/panama-ai/03-base-de-datos.md, política "staff gestiona todos los lugares").
 * No es multiusuario, no tiene auditoría por persona: solo prueba que quien tiene la
 * cookie conoce ADMIN_PASSWORD. Suficiente para dejar de estar completamente abierto,
 * no suficiente para producción real con varios miembros de equipo.
 *
 * Implementado con Web Crypto (`crypto.subtle`) en vez de el módulo `node:crypto` porque
 * Next.js Middleware corre en Edge runtime por defecto, donde `node:crypto` no está
 * disponible — Web Crypto sí, en ambos runtimes.
 */

export const ADMIN_COOKIE_NAME = "panama_ai_admin_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 días

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function createSessionToken(password: string): Promise<string> {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const signature = await hmac(password, String(expiresAt));
  return `${expiresAt}.${signature}`;
}

export async function verifySessionToken(token: string | undefined, password: string): Promise<boolean> {
  if (!token) return false;
  const [expiresAtRaw, signature] = token.split(".");
  if (!expiresAtRaw || !signature) return false;
  if (Date.now() > Number(expiresAtRaw)) return false;
  const expected = await hmac(password, expiresAtRaw);
  return expected === signature;
}
