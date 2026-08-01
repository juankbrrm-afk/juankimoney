import { requirePermission } from "@/lib/rbac";
import { db } from "@/lib/db";

export default async function ReportsPage() {
  const ctx = await requirePermission("reports:read");
  if (!ctx.organizationId) return null;

  const reports = await db.report.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: { periodStart: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Reportes</h1>
        <p className="text-sm text-slate-500">
          Se generan automáticamente el día 1 de cada mes (ver docs/AUTOMATIONS.md, workflow 4).
        </p>
      </div>

      {reports.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          Todavía no hay reportes generados para esta organización.
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-sm">
          {reports.map((r) => (
            <li key={r.id} className="px-5 py-4 text-sm">
              <p className="font-medium text-slate-800">
                {r.periodStart.toLocaleDateString("es-PA")} — {r.periodEnd.toLocaleDateString("es-PA")}
              </p>
              {r.insights && <p className="mt-1 text-xs text-slate-500">{r.insights}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
