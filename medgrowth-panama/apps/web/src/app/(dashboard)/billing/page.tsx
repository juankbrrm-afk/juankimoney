import { requirePermission } from "@/lib/rbac";
import { db } from "@/lib/db";
import { formatCurrency } from "@/lib/labels";

export default async function BillingPage() {
  const ctx = await requirePermission("billing:read");
  if (!ctx.organizationId) return null;

  const subscription = await db.subscription.findUnique({ where: { organizationId: ctx.organizationId } });
  const invoices = await db.invoice.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: { issuedAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Facturación</h1>
        <p className="text-sm text-slate-500">Plan y facturas — vía Stripe Customer Portal.</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        {subscription ? (
          <>
            <p className="text-sm text-slate-500">Plan actual</p>
            <p className="text-lg font-semibold text-slate-900">{subscription.plan}</p>
            <p className="mt-1 text-xs text-slate-400">
              Próxima renovación: {subscription.currentPeriodEnd.toLocaleDateString("es-PA")}
            </p>
          </>
        ) : (
          <p className="text-sm text-slate-500">
            Sin suscripción activa. Conecta Stripe en Configuración → Facturación para habilitar
            el cobro automático (docs/ROADMAP.md Fase 1).
          </p>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Monto</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {invoices.map((inv) => (
              <tr key={inv.id}>
                <td className="px-4 py-3">{inv.issuedAt.toLocaleDateString("es-PA")}</td>
                <td className="px-4 py-3">{formatCurrency(Number(inv.amount))}</td>
                <td className="px-4 py-3">{inv.status}</td>
              </tr>
            ))}
            {invoices.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-slate-400">
                  Sin facturas todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
