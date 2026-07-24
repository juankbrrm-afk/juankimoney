import { loginAction } from "@/app/login/actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next = "/negocios", error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4">
      <form action={loginAction} className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-6">
        <p className="text-sm font-semibold text-ink">Panama AI · Admin</p>
        <h1 className="mt-1 text-lg font-semibold text-ink">Acceso al panel</h1>
        <p className="mt-1 text-sm text-stone-600">
          Panel interno — no compartir esta contraseña fuera del equipo.
        </p>

        {error && (
          <p className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            Contraseña incorrecta.
          </p>
        )}

        <input type="hidden" name="next" value={next} />
        <label className="mt-4 flex flex-col gap-1 text-sm text-ink">
          <span className="text-xs font-medium text-stone-600">Contraseña</span>
          <input
            type="password"
            name="password"
            required
            autoFocus
            className="rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:outline-accent"
          />
        </label>

        <button
          type="submit"
          className="mt-5 w-full rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-white"
        >
          Entrar
        </button>
      </form>
    </div>
  );
}
