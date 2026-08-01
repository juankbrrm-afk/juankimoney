import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Sidebar } from "@/components/Sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar role={session.user.role} />
      <div className="flex-1 overflow-y-auto">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-8 py-4">
          <div />
          <div className="text-right">
            <p className="text-sm font-semibold text-slate-800">{session.user.name}</p>
            <p className="text-xs text-slate-400">{session.user.role}</p>
          </div>
        </header>
        <main className="p-8">{children}</main>
      </div>
    </div>
  );
}
