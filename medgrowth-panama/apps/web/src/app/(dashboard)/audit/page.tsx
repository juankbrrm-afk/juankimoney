import { requirePermission } from "@/lib/rbac";
import { db } from "@/lib/db";

export default async function AuditPage() {
  const ctx = await requirePermission("audit:read");
  if (!ctx.organizationId) return null;

  const audits = await db.siteAudit.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Auditoría de presencia digital</h1>
          <p className="text-sm text-slate-500">
            Sitio web, velocidad, SEO, Google Business Profile, Instagram, Facebook y reputación
            online — resumido por IA en un PDF.
          </p>
        </div>
      </div>

      {audits.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          Sin auditorías todavía. Se dispara desde <code>POST /api/audit/run</code> (docs/API.md) —
          conecta las fuentes externas (PageSpeed, Google Business Profile) para producción.
        </div>
      ) : (
        <ul className="space-y-3">
          {audits.map((a) => (
            <li key={a.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs text-slate-400">{a.createdAt.toLocaleDateString("es-PA")}</p>
              <div className="mt-2 flex gap-6 text-sm">
                <span>Sitio: <strong>{a.websiteScore ?? "—"}</strong></span>
                <span>SEO: <strong>{a.seoScore ?? "—"}</strong></span>
                <span>GBP: <strong>{a.gbpScore ?? "—"}</strong></span>
                <span>Redes: <strong>{a.socialScore ?? "—"}</strong></span>
              </div>
              {a.summary && <p className="mt-3 text-sm text-slate-600">{a.summary}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
