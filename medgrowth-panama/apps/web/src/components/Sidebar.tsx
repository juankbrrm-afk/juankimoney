import Link from "next/link";
import { hasPermission, type Permission, type RoleName } from "@medgrowth/config";

const NAV_ITEMS: { href: string; label: string; permission: Permission }[] = [
  { href: "/dashboard", label: "Resumen", permission: "dashboard:read" },
  { href: "/crm", label: "CRM", permission: "leads:read" },
  { href: "/campaigns", label: "Campañas", permission: "campaigns:read" },
  { href: "/whatsapp", label: "WhatsApp", permission: "conversations:read" },
  { href: "/calendar", label: "Calendario", permission: "appointments:read" },
  { href: "/landing-builder", label: "Landing Builder", permission: "landings:read" },
  { href: "/audit", label: "Auditoría", permission: "audit:read" },
  { href: "/reports", label: "Reportes", permission: "reports:read" },
  { href: "/billing", label: "Facturación", permission: "billing:read" },
  { href: "/settings/users", label: "Configuración", permission: "users:read" },
];

export function Sidebar({ role }: { role: RoleName }) {
  const visibleItems = NAV_ITEMS.filter((item) => hasPermission(role, item.permission));

  return (
    <aside className="flex h-screen w-60 flex-shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-5">
        <p className="text-sm font-bold text-brand-700">MedGrowth Panama</p>
        <p className="text-xs text-slate-400">Dashboard de clínica</p>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {visibleItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="block rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-brand-50 hover:text-brand-700"
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="border-t border-slate-200 px-5 py-4">
        <Link href="/api/auth/signout" className="text-xs text-slate-400 hover:text-slate-600">
          Cerrar sesión
        </Link>
      </div>
    </aside>
  );
}
