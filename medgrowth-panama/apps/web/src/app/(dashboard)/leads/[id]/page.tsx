import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/rbac";
import { getLead } from "@/server/leadService";
import { STAGE_LABELS } from "@/lib/labels";
import { NoteForm } from "@/components/NoteForm";

export default async function LeadDetailPage({ params }: { params: { id: string } }) {
  const ctx = await requirePermission("leads:read");
  if (!ctx.organizationId) return null;

  const lead = await getLead(ctx.organizationId, params.id);
  if (!lead) notFound();

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-6">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-slate-900">{lead.name}</h1>
              <p className="text-sm text-slate-500">{lead.phone}{lead.email ? ` · ${lead.email}` : ""}</p>
            </div>
            <span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-700">
              {STAGE_LABELS[lead.stage]}
            </span>
          </div>
          {lead.interestNote && <p className="mt-3 text-sm text-slate-600">Interés: {lead.interestNote}</p>}
          {lead.score !== null && (
            <p className="mt-1 text-sm text-slate-600">
              Score IA: <span className="font-semibold">{lead.score}</span>
              {lead.scoreReasoning ? ` — ${lead.scoreReasoning}` : ""}
            </p>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Notas</h2>
          <NoteForm leadId={lead.id} />
          <ul className="mt-4 space-y-3">
            {lead.notes.map((note) => (
              <li key={note.id} className="rounded-md bg-slate-50 p-3 text-sm">
                <p className="text-slate-700">{note.body}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {note.author.name} · {note.createdAt.toLocaleString("es-PA")}
                </p>
              </li>
            ))}
            {lead.notes.length === 0 && <p className="text-sm text-slate-400">Sin notas todavía.</p>}
          </ul>
        </div>
      </div>

      <div className="space-y-6">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Historial</h2>
          <ul className="space-y-3">
            {lead.activities.map((activity) => (
              <li key={activity.id} className="text-xs text-slate-500">
                <span className="font-medium text-slate-700">{activity.type}</span>
                <span className="block text-slate-400">{activity.createdAt.toLocaleString("es-PA")}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Citas</h2>
          {lead.appointments.length === 0 && <p className="text-sm text-slate-400">Sin citas agendadas.</p>}
          <ul className="space-y-2">
            {lead.appointments.map((apt) => (
              <li key={apt.id} className="text-sm text-slate-600">
                {apt.scheduledAt.toLocaleString("es-PA")} — {apt.status}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
