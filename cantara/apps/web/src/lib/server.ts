import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { PublicUser } from '@cantara/shared';
import { api, ApiError } from './api';

/**
 * Utilidades para Server Components.
 *
 * La cookie de sesión es `HttpOnly`, así que el servidor de Next no la
 * recibe automáticamente al llamar a la API: hay que reenviarla a mano. Es lo
 * que permite que el panel se renderice ya con datos en lugar de pintar un
 * esqueleto y pedirlos después.
 */
export async function forwardedCookie(): Promise<string> {
  const store = await cookies();
  return store
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
}

/** Usuario actual, o `null` si no hay sesión. */
export async function getCurrentUser(): Promise<PublicUser | null> {
  try {
    const { user } = await api.me(await forwardedCookie());
    return user;
  } catch (error) {
    // Un 401 es el caso normal de visitante anónimo, no un fallo.
    if (error instanceof ApiError && error.isAuthError) return null;
    return null;
  }
}

/** Exige sesión; si no la hay, envía al login conservando el destino. */
export async function requireUser(returnTo?: string): Promise<PublicUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(returnTo ? `/login?next=${encodeURIComponent(returnTo)}` : '/login');
  }
  return user;
}
