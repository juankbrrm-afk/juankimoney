export default function SetupRequiredPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="max-w-md rounded-2xl border border-stone-200 bg-white p-6 text-sm text-ink">
        <h1 className="text-lg font-semibold text-ink">Falta configurar ADMIN_PASSWORD</h1>
        <p className="mt-2 text-stone-600">
          Este panel administra negocios reales y no se abre sin una contraseña configurada. Crea
          un archivo <code className="rounded bg-stone-100 px-1">.env.local</code> en{" "}
          <code className="rounded bg-stone-100 px-1">apps/admin</code> con:
        </p>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-stone-800 p-3 text-xs text-white">
          ADMIN_PASSWORD=elige-una-contraseña-fuerte
        </pre>
        <p className="mt-3 text-stone-600">
          Y reinicia <code className="rounded bg-stone-100 px-1">npm run dev</code>. Esto es un
          stopgap — la versión real conecta Supabase Auth y el rol staff/admin (ver
          apps/admin/README.md).
        </p>
      </div>
    </div>
  );
}
