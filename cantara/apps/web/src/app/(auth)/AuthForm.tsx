'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { loginSchema, registerSchema } from '@cantara/shared';
import { api, ApiError } from '@/lib/api';
import { Alert, Button, Field, Input } from '@/components/ui';

/**
 * Formulario de acceso y registro.
 *
 * Valida en el cliente con el mismo esquema Zod que usa el servidor: el
 * usuario ve el error al instante y el servidor no confía en el cliente. Un
 * único archivo para ambos modos porque solo difieren en un campo y en la
 * llamada final; duplicarlo garantizaría que uno de los dos se quedara atrás.
 */
export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter();
  const isRegister = mode === 'register';

  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const data = Object.fromEntries(new FormData(event.currentTarget));

    const parsed = isRegister
      ? registerSchema.safeParse({ ...data, acceptedTerms: data.acceptedTerms === 'on' })
      : loginSchema.safeParse(data);

    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.') || 'form';
        errors[key] ??= issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    setPending(true);

    try {
      if (isRegister) {
        await api.register(parsed.data as never);
      } else {
        await api.login(parsed.data as never);
      }

      // `refresh` revalida los Server Components para que el layout ya lea la
      // sesión recién creada; sin él, el panel se pintaría como anónimo.
      router.push('/app');
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError(error.message);
        if (error.fields) setFieldErrors(error.fields);
      } else {
        setFormError('Algo salió mal. Inténtalo de nuevo.');
      }
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-12">
      <Link href="/" className="mb-8 text-center text-lg font-semibold tracking-tight">
        <span className="text-gradient">Cantara</span>
      </Link>

      <div className="surface p-7">
        <h1 className="text-2xl font-semibold">
          {isRegister ? 'Crea tu cuenta' : 'Bienvenido de vuelta'}
        </h1>
        <p className="mt-2 text-sm text-ink-400">
          {isRegister
            ? 'Empiezas con créditos suficientes para entrenar tu voz y crear tu primera canción.'
            : 'Entra para seguir con tus canciones.'}
        </p>

        <form onSubmit={handleSubmit} className="mt-7 space-y-5" noValidate>
          {formError && <Alert>{formError}</Alert>}

          {isRegister && (
            <Field label="Nombre" htmlFor="displayName" error={fieldErrors.displayName} required>
              <Input
                id="displayName"
                name="displayName"
                autoComplete="name"
                placeholder="Cómo quieres que te llamemos"
                invalid={Boolean(fieldErrors.displayName)}
                required
              />
            </Field>
          )}

          <Field label="Email" htmlFor="email" error={fieldErrors.email} required>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="tu@email.com"
              invalid={Boolean(fieldErrors.email)}
              required
            />
          </Field>

          <Field
            label="Contraseña"
            htmlFor="password"
            error={fieldErrors.password}
            hint={isRegister ? 'Mínimo 10 caracteres' : undefined}
            required
          >
            <Input
              id="password"
              name="password"
              type="password"
              // `new-password` en registro hace que el gestor de contraseñas
              // ofrezca generar una, en lugar de autocompletar la existente.
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              invalid={Boolean(fieldErrors.password)}
              required
            />
          </Field>

          {isRegister && (
            <label className="flex items-start gap-3 text-sm text-ink-400">
              <input
                type="checkbox"
                name="acceptedTerms"
                className="mt-0.5 size-4 shrink-0 rounded border-ink-700 bg-ink-900 accent-accent-500"
                required
              />
              <span>
                Acepto los términos del servicio y confirmo que solo entrenaré modelos con mi
                propia voz o con permiso de su titular.
              </span>
            </label>
          )}
          {fieldErrors.acceptedTerms && (
            <p role="alert" className="text-sm text-danger">
              {fieldErrors.acceptedTerms}
            </p>
          )}

          <Button type="submit" size="lg" fullWidth loading={pending}>
            {isRegister ? 'Crear cuenta' : 'Entrar'}
          </Button>
        </form>
      </div>

      <p className="mt-6 text-center text-sm text-ink-400">
        {isRegister ? (
          <>
            ¿Ya tienes cuenta?{' '}
            <Link href="/login" className="text-accent-300 hover:underline">
              Entra
            </Link>
          </>
        ) : (
          <>
            ¿Aún no tienes cuenta?{' '}
            <Link href="/register" className="text-accent-300 hover:underline">
              Créala gratis
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
