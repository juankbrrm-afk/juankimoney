import { requirePermission } from "@/lib/rbac";
import { getDashboardKpis } from "@/server/dashboardService";
import { KpiCard } from "@/components/KpiCard";
import { FunnelChart } from "@/components/FunnelChart";
import { STAGE_LABELS, formatCurrency } from "@/lib/labels";

export default async function DashboardPage() {
  const ctx = await requirePermission("dashboard:read");

  if (!ctx.organizationId) {
    return <p className="text-sm text-slate-500">Selecciona una organización para ver su dashboard.</p>;
  }

  const kpis = await getDashboardKpis(ctx.organizationId);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Resumen</h1>
        <p className="text-sm text-slate-500">
          Últimos 30 días — {kpis.range.from.toLocaleDateString("es-PA")} al{" "}
          {kpis.range.to.toLocaleDateString("es-PA")}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <KpiCard label="Pacientes nuevos" value={String(kpis.newPatients)} />
        <KpiCard label="Leads" value={String(kpis.totalLeads)} />
        <KpiCard label="Costo por lead" value={formatCurrency(kpis.costPerLead)} />
        <KpiCard label="Costo por paciente" value={formatCurrency(kpis.costPerPatient)} />
        <KpiCard label="ROAS" value={`${kpis.roas.toFixed(2)}x`} />
        <KpiCard label="Ventas" value={formatCurrency(kpis.totalSales)} />
        <KpiCard label="Consultas agendadas" value={String(kpis.appointments.scheduled)} />
        <KpiCard label="Consultas realizadas" value={String(kpis.appointments.completed)} />
        <KpiCard label="Consultas canceladas" value={String(kpis.appointments.canceled)} />
        <KpiCard label="Inversión en ads" value={formatCurrency(kpis.totalAdSpend)} />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Embudo</h2>
        <FunnelChart data={kpis.funnel.map((f) => ({ stage: STAGE_LABELS[f.stage], count: f.count }))} />
      </div>
    </div>
  );
}
