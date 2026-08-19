import Link from "next/link";
import { AppShell } from "@/components/sign-flow/app-shell";

const links = [
  { href: "/admin/messages", label: "Messages & reminders" },
  { href: "/admin/templates", label: "DocuSeal templates" },
  { href: "/admin/firms", label: "Firms" },
  { href: "/admin/settings", label: "Environment" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <aside className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-3 shadow-sm">
          <nav className="flex flex-col gap-1">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="rounded-lg px-3 py-2 text-sm text-slate-800 hover:bg-slate-50">
                {l.label}
              </Link>
            ))}
          </nav>
        </aside>
        <div>{children}</div>
      </div>
    </AppShell>
  );
}
