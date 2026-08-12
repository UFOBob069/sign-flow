"use client";

import Link from "next/link";
import { useEffect, useState, startTransition } from "react";
import { signOutFirebaseClient } from "@/lib/firebase/client";

const nav = [
  { href: "/dashboard", label: "Requests" },
  { href: "/dashboard/send/contract", label: "Contract" },
  { href: "/dashboard/send/onetime", label: "One-time" },
  { href: "/dashboard/send/hipaa", label: "HIPAA" },
  { href: "/dashboard/signed", label: "Signed documents" },
  { href: "/dashboard/faq", label: "FAQ" },
  { href: "/admin", label: "Admin" },
];

type SessionUser = { name: string; email?: string };

export function AppShell({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (cancelled) return;
      if (res.ok) {
        const j = (await res.json()) as { user?: SessionUser | null };
        startTransition(() => setUser(j.user ?? null));
      } else {
        startTransition(() => setUser(null));
      }
      startTransition(() => setAuthChecked(true));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-[color:var(--background)]">
      <header className="border-b border-white/10 bg-[color:var(--brand-navy)] text-white shadow-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <Link
            href="/dashboard"
            className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-0.5 outline-none transition hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/40"
            aria-label="Sign Flow — go to dashboard"
          >
            <div className="flex h-10 shrink-0 items-center">
              {logoFailed ? (
                <span className="text-xs font-bold text-white">RJ</span>
              ) : (
                <img
                  src="/ramosjames-new-logo-white-revised-f.webp"
                  alt="Ramos James Law"
                  width={200}
                  height={40}
                  className="h-10 w-auto max-w-[min(220px,42vw)] object-contain object-left"
                  onError={() => setLogoFailed(true)}
                />
              )}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold tracking-tight">Sign Flow</div>
              <div className="truncate text-xs text-white/70">Ramos James Law · Lead signing</div>
            </div>
          </Link>
          <nav className="hidden flex-wrap items-center justify-end gap-1 lg:flex">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="rounded-lg px-3 py-2 text-sm text-white/90 hover:bg-white/10"
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            {authChecked && user ? (
              <>
                <span
                  className="hidden max-w-[200px] truncate text-sm text-white/90 sm:inline"
                  title={user.email ?? user.name}
                >
                  {user.name}
                </span>
                <button
                  className="rounded-lg px-3 py-2 text-sm text-white/90 hover:bg-white/10"
                  type="button"
                  onClick={async () => {
                    await signOutFirebaseClient();
                    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
                    window.location.href = "/login";
                  }}
                >
                  Sign out
                </button>
              </>
            ) : null}
            {authChecked && !user ? (
              <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-medium text-white hover:bg-white/10">
                Sign in
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  );
}
