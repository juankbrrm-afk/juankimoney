import { requirePermission } from "@/lib/rbac";
import { db } from "@/lib/db";

export default async function LandingBuilderPage() {
  const ctx = await requirePermission("landings:read");
  if (!ctx.organizationId) return null;

  const [templates, pages] = await Promise.all([
    db.landingTemplate.findMany({ where: { active: true } }),
    db.landingPage.findMany({ where: { organizationId: ctx.organizationId }, include: { template: true } }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Landing Builder</h1>
        <p className="text-sm text-slate-500">
          Plantillas optimizadas para conversión por especialidad. El editor visual drag-and-drop
          es la siguiente iteración (docs/ROADMAP.md Fase 2) — hoy cada landing se genera desde una
          plantilla con contenido editable.
        </p>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Tus landing pages</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pages.map((p) => (
            <div key={p.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-brand-600">
                {p.template.specialty.replaceAll("_", " ")}
              </p>
              <p className="mt-1 font-semibold text-slate-900">{p.title}</p>
              <p className="mt-1 text-xs text-slate-400">/{p.slug}</p>
              <span
                className={`mt-3 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                  p.published ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-500"
                }`}
              >
                {p.published ? "Publicada" : "Borrador"}
              </span>
            </div>
          ))}
          {pages.length === 0 && <p className="text-sm text-slate-400">Sin landing pages todavía.</p>}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Plantillas disponibles</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <div key={t.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                {t.specialty.replaceAll("_", " ")}
              </p>
              <p className="mt-1 font-semibold text-slate-900">{t.name}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
