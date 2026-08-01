import { requirePermission } from "@/lib/rbac";
import { listLeads } from "@/server/leadService";
import { KanbanBoard } from "@/components/KanbanBoard";

export default async function CrmPage() {
  const ctx = await requirePermission("leads:read");
  if (!ctx.organizationId) return null;

  const leads = await listLeads(ctx.organizationId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">CRM</h1>
        <p className="text-sm text-slate-500">Arrastra un lead para cambiar su etapa.</p>
      </div>
      <KanbanBoard
        leads={leads.map((l) => ({
          id: l.id,
          name: l.name,
          phone: l.phone,
          stage: l.stage,
          score: l.score,
          assignedTo: l.assignedTo,
        }))}
      />
    </div>
  );
}
