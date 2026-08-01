import { requirePermission } from "@/lib/rbac";
import { db } from "@/lib/db";

export default async function CalendarPage() {
  const ctx = await requirePermission("appointments:read");
  if (!ctx.organizationId) return null;

  const appointments = await db.appointment.findMany({
    where: { organizationId: ctx.organizationId, scheduledAt: { gte: new Date() } },
    include: { lead: { select: { name: true } }, patient: { select: { name: true } } },
    orderBy: { scheduledAt: "asc" },
    take: 20,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Calendario</h1>
        <p className="text-sm text-slate-500">Próximas citas.</p>
      </div>

      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-sm">
        {appointments.map((apt) => (
          <li key={apt.id} className="flex items-center justify-between px-5 py-4 text-sm">
            <div>
              <p className="font-medium text-slate-800">{apt.lead?.name ?? apt.patient?.name ?? "Sin nombre"}</p>
              <p className="text-xs text-slate-400">{apt.scheduledAt.toLocaleString("es-PA")}</p>
            </div>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {apt.status}
            </span>
          </li>
        ))}
        {appointments.length === 0 && (
          <li className="px-5 py-8 text-center text-sm text-slate-400">No hay citas próximas.</li>
        )}
      </ul>
    </div>
  );
}
