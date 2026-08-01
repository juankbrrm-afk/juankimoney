import { requirePermission } from "@/lib/rbac";
import { db } from "@/lib/db";

export default async function WhatsappPage() {
  const ctx = await requirePermission("conversations:read");
  if (!ctx.organizationId) return null;

  const conversations = await db.conversation.findMany({
    where: { organizationId: ctx.organizationId, channel: "WHATSAPP" },
    include: { lead: { select: { name: true } }, messages: { orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: { lastMessageAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">WhatsApp</h1>
        <p className="text-sm text-slate-500">
          Bandeja unificada. Requiere conectar WhatsApp Business Cloud API en Configuración →
          Integraciones (docs/ROADMAP.md Fase 1).
        </p>
      </div>

      {conversations.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm text-slate-500">
            Todavía no hay conversaciones de WhatsApp. Cuando conectes tu número de WhatsApp
            Business, los mensajes entrantes aparecerán aquí y el asistente de IA podrá responder
            automáticamente según la configuración en Configuración → IA.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-sm">
          {conversations.map((c) => (
            <li key={c.id} className="flex items-center justify-between px-5 py-4">
              <div>
                <p className="text-sm font-medium text-slate-800">{c.lead.name}</p>
                <p className="text-xs text-slate-400">{c.messages[0]?.body ?? "Sin mensajes"}</p>
              </div>
              {c.needsHumanAttention && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                  Requiere atención
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
