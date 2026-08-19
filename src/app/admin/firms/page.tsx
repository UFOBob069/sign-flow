"use client";

import { useEffect, useState, startTransition } from "react";
import { DEFAULT_FIRM_ID } from "@/lib/firm-scope";

type FirmPublic = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  memberEmails: string[];
  docusealConfigured: boolean;
  quoConfigured: boolean;
  usesEnvDocuseal: boolean;
  usesEnvQuo: boolean;
};

const emptyForm = {
  name: "",
  logoUrl: "",
  memberEmails: "",
  docusealApiUrl: "",
  docusealApiKey: "",
  docusealAdminBaseUrl: "",
  docusealWebhookSecret: "",
  quoApiKey: "",
  quoFromNumber: "",
  quoPhoneNumberId: "",
};

export default function AdminFirmsPage() {
  const [items, setItems] = useState<FirmPublic[]>([]);
  const [selectedId, setSelectedId] = useState<string | "new">(DEFAULT_FIRM_ID);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [origin, setOrigin] = useState("");

  async function load() {
    const res = await fetch("/api/admin/firms", { credentials: "include" });
    if (res.status === 403) {
      startTransition(() => setForbidden(true));
      return;
    }
    if (!res.ok) {
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      startTransition(() => setError(j?.error ?? "Could not load firms"));
      return;
    }
    const j = (await res.json()) as { items: FirmPublic[] };
    startTransition(() => {
      setItems(j.items);
      setForbidden(false);
    });
  }

  useEffect(() => {
    setOrigin(window.location.origin);
    void load();
  }, []);

  useEffect(() => {
    if (selectedId === "new") {
      setForm(emptyForm);
      return;
    }
    const f = items.find((x) => x.id === selectedId);
    if (!f) return;
    setForm({
      name: f.name,
      logoUrl: f.logoUrl ?? "",
      memberEmails: f.memberEmails.join("\n"),
      docusealApiUrl: "",
      docusealApiKey: "",
      docusealAdminBaseUrl: "",
      docusealWebhookSecret: "",
      quoApiKey: "",
      quoFromNumber: "",
      quoPhoneNumberId: "",
    });
  }, [selectedId, items]);

  const selected = items.find((x) => x.id === selectedId);
  const webhookPath =
    selectedId === "new"
      ? ""
      : selectedId === DEFAULT_FIRM_ID
        ? `${origin}/api/webhooks/docuseal`
        : `${origin}/api/webhooks/docuseal/${selectedId}`;

  if (forbidden) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
        Only global admins can manage firms. Add your Google email to{" "}
        <code className="text-xs">SIGNFLOW_ADMIN_EMAILS</code>.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Firms</h1>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          Each firm has its own DocuSeal instance, requests, and message templates. Staff only see firms you grant
          them. Ramos James is the default — everyone who can sign in can use it unless you restrict the list.
        </p>
      </div>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{error}</div> : null}
      {ok ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{ok}</div> : null}

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <div className="space-y-2">
          {items.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`w-full rounded-xl px-3 py-2 text-left text-sm ${
                selectedId === f.id ? "bg-[color:var(--brand-navy)] text-white" : "bg-white text-slate-800 hover:bg-slate-50 border border-slate-200"
              }`}
              onClick={() => setSelectedId(f.id)}
            >
              <div className="font-medium">{f.name}</div>
              <div className={selectedId === f.id ? "text-xs text-white/70" : "text-xs text-slate-500"}>
                {f.memberEmails.length ? `${f.memberEmails.length} people` : f.id === DEFAULT_FIRM_ID ? "All staff" : "Admins only"}
              </div>
            </button>
          ))}
          <button
            type="button"
            className={`w-full rounded-xl border border-dashed px-3 py-2 text-left text-sm ${
              selectedId === "new" ? "border-[color:var(--brand-navy)] bg-slate-50 font-medium" : "border-slate-300 text-slate-700 hover:bg-slate-50"
            }`}
            onClick={() => setSelectedId("new")}
          >
            + Add firm
          </button>
        </div>

        <form
          className="space-y-4 rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-5 shadow-sm"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            setOk(null);
            const body = {
              name: form.name.trim(),
              logoUrl: form.logoUrl.trim() || null,
              memberEmails: form.memberEmails,
              docusealApiUrl: form.docusealApiUrl.trim() || null,
              docusealApiKey: form.docusealApiKey.trim() || null,
              docusealAdminBaseUrl: form.docusealAdminBaseUrl.trim() || null,
              docusealWebhookSecret: form.docusealWebhookSecret.trim() || null,
              quoApiKey: form.quoApiKey.trim() || null,
              quoFromNumber: form.quoFromNumber.trim() || null,
              quoPhoneNumberId: form.quoPhoneNumberId.trim() || null,
            };
            const res =
              selectedId === "new"
                ? await fetch("/api/admin/firms", {
                    method: "POST",
                    credentials: "include",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify(body),
                  })
                : await fetch(`/api/admin/firms/${selectedId}`, {
                    method: "PATCH",
                    credentials: "include",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify(body),
                  });
            setBusy(false);
            if (!res.ok) {
              const j = (await res.json().catch(() => null)) as { error?: string } | null;
              setError(typeof j?.error === "string" ? j.error : "Save failed");
              return;
            }
            const j = (await res.json()) as { item: FirmPublic };
            setOk(selectedId === "new" ? "Firm created." : "Firm saved.");
            await load();
            setSelectedId(j.item.id);
          }}
        >
          <div>
            <label className="text-sm font-medium text-slate-900">Firm name</label>
            <input
              required
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Acme Injury Law"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-900">Logo URL</label>
            <input
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={form.logoUrl}
              onChange={(e) => setForm((f) => ({ ...f, logoUrl: e.target.value }))}
              placeholder="https://…/logo.png"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-900">Who can switch to this firm</label>
            <p className="mt-0.5 text-xs text-slate-500">
              One email or domain per line. Leave blank on Ramos James for all staff. On other firms, blank means
              admins only.
            </p>
            <textarea
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              rows={4}
              value={form.memberEmails}
              onChange={(e) => setForm((f) => ({ ...f, memberEmails: e.target.value }))}
              placeholder={"lawyer@otherfirm.com\notherfirm.com"}
            />
          </div>

          <div className="border-t border-slate-100 pt-4">
            <div className="text-sm font-semibold text-slate-900">DocuSeal</div>
            <p className="mt-1 text-xs text-slate-500">
              {selected?.usesEnvDocuseal
                ? "Currently using the shared DOCUSEAL_* environment variables. Paste this firm’s own API URL and key to connect a separate DocuSeal."
                : selected?.docusealConfigured
                  ? "This firm has its own DocuSeal credentials. Leave key fields blank to keep the stored secret."
                  : "Add this firm’s DocuSeal API URL and key."}
            </p>
            <label className="mt-3 block text-sm font-medium text-slate-900">API URL</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={form.docusealApiUrl}
              onChange={(e) => setForm((f) => ({ ...f, docusealApiUrl: e.target.value }))}
              placeholder="https://docuseal.otherfirm.com"
            />
            <label className="mt-3 block text-sm font-medium text-slate-900">API key</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              type="password"
              autoComplete="off"
              value={form.docusealApiKey}
              onChange={(e) => setForm((f) => ({ ...f, docusealApiKey: e.target.value }))}
              placeholder={selected?.docusealConfigured ? "•••••••• (leave blank to keep)" : ""}
            />
            <label className="mt-3 block text-sm font-medium text-slate-900">Admin / signing URL</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={form.docusealAdminBaseUrl}
              onChange={(e) => setForm((f) => ({ ...f, docusealAdminBaseUrl: e.target.value }))}
              placeholder="https://docuseal.otherfirm.com"
            />
            <label className="mt-3 block text-sm font-medium text-slate-900">Webhook secret</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              type="password"
              autoComplete="off"
              value={form.docusealWebhookSecret}
              onChange={(e) => setForm((f) => ({ ...f, docusealWebhookSecret: e.target.value }))}
              placeholder={selected?.docusealConfigured ? "•••••••• (leave blank to keep)" : ""}
            />
            {webhookPath ? (
              <p className="mt-3 text-xs text-slate-600">
                Point this firm’s DocuSeal webhook to{" "}
                <code className="break-all rounded bg-slate-100 px-1 text-[11px]">{webhookPath}</code>
              </p>
            ) : null}
          </div>

          <div className="border-t border-slate-100 pt-4">
            <div className="text-sm font-semibold text-slate-900">SMS (optional)</div>
            <p className="mt-1 text-xs text-slate-500">
              {selected?.usesEnvQuo
                ? "Using the shared Quo number until you add this firm’s own API key and from-number."
                : "Leave blank to keep the stored number, or to fall back to env."}
            </p>
            <label className="mt-3 block text-sm font-medium text-slate-900">Quo API key</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              type="password"
              autoComplete="off"
              value={form.quoApiKey}
              onChange={(e) => setForm((f) => ({ ...f, quoApiKey: e.target.value }))}
            />
            <label className="mt-3 block text-sm font-medium text-slate-900">From number (E.164)</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={form.quoFromNumber}
              onChange={(e) => setForm((f) => ({ ...f, quoFromNumber: e.target.value }))}
              placeholder="+1…"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              disabled={busy}
              type="submit"
              className="rounded-xl bg-[color:var(--accent)] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-50"
            >
              {busy ? "Saving…" : selectedId === "new" ? "Create firm" : "Save firm"}
            </button>
            {selectedId !== "new" && selectedId !== DEFAULT_FIRM_ID ? (
              <button
                type="button"
                disabled={busy}
                className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-900 hover:bg-rose-100 disabled:opacity-50"
                onClick={async () => {
                  if (!confirm(`Delete ${selected?.name ?? "this firm"}? Existing requests stay in the database but will be hidden.`)) {
                    return;
                  }
                  setBusy(true);
                  const res = await fetch(`/api/admin/firms/${selectedId}`, {
                    method: "DELETE",
                    credentials: "include",
                  });
                  setBusy(false);
                  if (!res.ok) {
                    const j = (await res.json().catch(() => null)) as { error?: string } | null;
                    setError(typeof j?.error === "string" ? j.error : "Delete failed");
                    return;
                  }
                  setOk("Firm deleted.");
                  setSelectedId(DEFAULT_FIRM_ID);
                  await load();
                }}
              >
                Delete
              </button>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  );
}
