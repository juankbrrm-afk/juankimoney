import { requirePermission } from "@/lib/rbac";
import { db } from "@/lib/db";

export default async function UsersSettingsPage() {
  const ctx = await requirePermission("users:read");
  if (!ctx.organizationId) return null;

  const users = await db.user.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Usuarios y roles</h1>
        <p className="text-sm text-slate-500">
          Administrador, Manager, Recepción, Doctor, Marketing, Ventas, Cliente.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Rol</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3 font-medium text-slate-800">{u.name}</td>
                <td className="px-4 py-3 text-slate-500">{u.email}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700">
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500">{u.active ? "Activo" : "Inactivo"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
