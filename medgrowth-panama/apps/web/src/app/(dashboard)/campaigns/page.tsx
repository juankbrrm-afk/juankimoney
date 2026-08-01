import { requirePermission } from "@/lib/rbac";
import { db } from "@/lib/db";
import { formatCurrency } from "@/lib/labels";

export default async function CampaignsPage() {
  const ctx = await requirePermission("campaigns:read");
  if (!ctx.organizationId) return null;

  const campaigns = await db.campaign.findMany({
    where: { organizationId: ctx.organizationId },
    include: { _count: { select: { leads: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Campañas</h1>
        <p className="text-sm text-slate-500">
          Google Ads, Meta Ads y TikTok Ads. El MVP registra gasto manualmente; la sincronización
          automática por API está en el roadmap (docs/ROADMAP.md Fase 2).
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Campaña</th>
              <th className="px-4 py-3">Canal</th>
              <th className="px-4 py-3">Gasto</th>
              <th className="px-4 py-3">Leads</th>
              <th className="px-4 py-3">CPL</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {campaigns.map((c) => {
              const cpl = c._count.leads > 0 ? Number(c.costTotal) / c._count.leads : 0;
              return (
                <tr key={c.id}>
                  <td className="px-4 py-3 font-medium text-slate-800">{c.name}</td>
                  <td className="px-4 py-3 text-slate-500">{c.channel}</td>
                  <td className="px-4 py-3 text-slate-500">{formatCurrency(Number(c.costTotal))}</td>
                  <td className="px-4 py-3 text-slate-500">{c._count.leads}</td>
                  <td className="px-4 py-3 text-slate-500">{formatCurrency(cpl)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        c.active ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {c.active ? "Activa" : "Pausada"}
                    </span>
                  </td>
                </tr>
              );
            })}
            {campaigns.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  Sin campañas todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
