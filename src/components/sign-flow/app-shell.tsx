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
type FirmOption = { id: string; name: string; logoUrl: string | null };

export function AppShell({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const [firm, setFirm] = useState<FirmOption | null>(null);
  const [firms, setFirms] = useState<FirmOption[]>([]);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (cancelled) return;
      if (res.ok) {
        const j = (await res.json()) as {
          user?: SessionUser | null;
          firm?: FirmOption | null;
          firms?: FirmOption[];
        };
        startTransition(() => {
          setUser(j.user ?? null);
          setFirm(j.firm ?? null);
          setFirms(j.firms ?? []);
          setLogoFailed(false);
        });
      } else {
        startTransition(() => setUser(null));
      }
      startTransition(() => setAuthChecked(true));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const logoSrc = firm?.logoUrl?.trim() || "/ramosjames-new-logo-white-revised-f.webp";
  const firmName = firm?.name || "Ramos James Law";
  const initials = firmName
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="min-h-screen bg-[color:var(--background)]">
      <header className="border-b border-white/10 bg-[color:var(--brand-navy)] text-white shadow-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Link
              href="/dashboard"
              className="flex min-w-0 items-center gap-3 rounded-lg px-1 py-0.5 outline-none transition hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/40"
              aria-label="Sign Flow — go to dashboard"
            >
              <div className="flex h-10 shrink-0 items-center">
                {logoFailed ? (
                  <span className="text-xs font-bold text-white">{initials || "SF"}</span>
                ) : (
                  <img
                    src={logoSrc}
                    alt={firmName}
                    width={200}
                    height={40}
                    className="h-10 w-auto max-w-[min(220px,42vw)] object-contain object-left"
                    onError={() => setLogoFailed(true)}
                  />
                )}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold tracking-tight">Sign Flow</div>
                {firms.length <= 1 ? (
                  <div className="truncate text-xs text-white/70">{firmName} · Lead signing</div>
                ) : (
                  <div className="truncate text-xs text-white/70">Lead signing</div>
                )}
              </div>
            </Link>
            {firms.length > 1 ? (
              <label className="min-w-0">
                <span className="sr-only">Firm</span>
                <select
                  className="max-w-[200px] truncate rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 text-xs text-white"
                  value={firm?.id ?? ""}
                  disabled={switching}
                  onChange={async (e) => {
                    const next = e.target.value;
                    if (!next || next === firm?.id) return;
                    setSwitching(true);
                    const res = await fetch("/api/auth/firm", {
                      method: "POST",
                      credentials: "include",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ firmId: next }),
                    });
                    if (res.ok) window.location.reload();
                    else setSwitching(false);
                  }}
                >
                  {firms.map((f) => (
                    <option key={f.id} value={f.id} className="text-slate-900">
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
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
