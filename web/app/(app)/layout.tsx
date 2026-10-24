import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { LogoutButton } from "@/components/forms";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const links = [
    ...(user.role === "admin" ? [{ href: "/", label: "Dashboard" }] : []),
    { href: "/leads", label: "Leads" },
    { href: "/follow-ups", label: "Follow-ups" },
    ...(user.role === "admin" ? [{ href: "/users", label: "Team" }] : []),
  ];
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/" className="font-semibold text-teal-800">Call CRM</Link>
          <nav className="flex flex-1 flex-wrap gap-4 text-sm">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="text-slate-600 hover:text-slate-900">{l.label}</Link>
            ))}
          </nav>
          <span className="text-sm text-slate-500">{user.name}</span>
          <LogoutButton />
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-4">{children}</main>
    </div>
  );
}
