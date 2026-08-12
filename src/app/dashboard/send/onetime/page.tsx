"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, startTransition } from "react";
import {
  detectSigningFormKind,
  filterOneTimeTemplates,
  isDisbursementTemplate,
  isSarReleaseTemplate,
} from "@/lib/docuseal-prefill";
import type { DocuSealTemplateSummary, OutboundDeliverySettings } from "@/types/models";
import { DEFAULT_OUTBOUND_DELIVERY } from "@/lib/outbound-delivery";

export default function SendOneTimeFormPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<DocuSealTemplateSummary[]>([]);
  const [templateId, setTemplateId] = useState<string>("");
  const [clientName, setClientName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [sendSms, setSendSms] = useState(true);
  const [sendEmail, setSendEmail] = useState(false);
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [quoReady, setQuoReady] = useState<boolean | null>(null);
  const [outbound, setOutbound] = useState<OutboundDeliverySettings>(DEFAULT_OUTBOUND_DELIVERY);

  async function loadTemplates() {
    setLoadingTemplates(true);
    const res = await fetch("/api/docuseal/templates", { credentials: "include" });
    setLoadingTemplates(false);
    if (!res.ok) {
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      startTransition(() => setError(j?.error ?? "Could not load DocuSeal templates"));
      return;
    }
    const j = (await res.json()) as { items: DocuSealTemplateSummary[] };
    startTransition(() => {
      const list = filterOneTimeTemplates(j.items);
      setTemplates(list);
      setTemplateId((prev) => {
        if (prev && list.some((t) => String(t.id) === prev)) return prev;
        return list[0] ? String(list[0].id) : "";
      });
    });
  }

  useEffect(() => {
    void loadTemplates();
  }, []);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/app-settings", { credentials: "include" });
      if (!res.ok) return;
      const j = (await res.json()) as {
        item?: { outboundDelivery?: OutboundDeliverySettings } | null;
        env?: { hasQuoApiKey?: boolean; hasQuoFromNumber?: boolean };
      };
      const e = j.env;
      const od = { ...DEFAULT_OUTBOUND_DELIVERY, ...(j.item?.outboundDelivery ?? {}) };
      startTransition(() => {
        if (e) setQuoReady(Boolean(e.hasQuoApiKey && e.hasQuoFromNumber));
        setOutbound(od);
        if (!od.signingSmsEnabled) setSendSms(false);
        if (!od.signingEmailEnabled) setSendEmail(false);
        if (od.signingSmsEnabled && !od.signingEmailEnabled) setSendSms(true);
        if (od.signingEmailEnabled && !od.signingSmsEnabled) setSendEmail(true);
      });
    })();
  }, []);

  const canDeliver = outbound.signingSmsEnabled || outbound.signingEmailEnabled;
  const selected = useMemo(
    () => templates.find((t) => String(t.id) === templateId),
    [templates, templateId],
  );
  const kind = selected ? detectSigningFormKind(selected.name) : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <p className="text-sm text-[color:var(--muted)]">
          <Link href="/dashboard/send" className="font-medium text-[color:var(--brand-navy)] underline underline-offset-2">
            ← All send types
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Send one-time form</h1>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          SAR releases, disbursement agreements, and other per-person DocuSeal templates. After a successful send, the
          template is archived so it won&apos;t clutter future lists.
        </p>
      </div>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{error}</div> : null}

      {!canDeliver ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <strong>Signing delivery is disabled.</strong> An admin must enable SMS and/or email under{" "}
          <strong>Admin → Messages → Signing request delivery</strong>.
        </div>
      ) : null}

      {quoReady === false && sendSms && outbound.signingSmsEnabled ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <strong>SMS will not send</strong> until Quo is configured. Include <code className="text-xs">+1</code> on the
          phone number.
        </div>
      ) : null}

      <form
        className="space-y-5 rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-6 shadow-sm"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          const tid = Number(templateId);
          if (!Number.isFinite(tid) || tid <= 0) {
            setError("Select a one-time template.");
            setBusy(false);
            return;
          }
          if (!canDeliver) {
            setError("SMS and email for signing requests are both disabled in admin settings.");
            setBusy(false);
            return;
          }
          if (!sendSms && !sendEmail) {
            setError("Select at least one delivery method.");
            setBusy(false);
            return;
          }
          if (!clientName.trim()) {
            setError("Client name is required so SMS and the dashboard use the correct name.");
            setBusy(false);
            return;
          }
          const res = await fetch("/api/signing-requests", {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              clientName: clientName.trim(),
              dateOfLoss: null,
              phone: phone.trim() || null,
              email: email.trim() || null,
              language: "en",
              templateId: tid,
              sendSms,
              sendEmail,
              reminderEnabled,
            }),
          });
          setBusy(false);
          if (!res.ok) {
            const j = (await res.json().catch(() => null)) as { error?: string } | null;
            setError(j?.error ?? "Request failed");
            return;
          }
          const j = (await res.json()) as { item: { id: string } };
          router.push(`/dashboard/requests/${j.item.id}`);
        }}
      >
        <div>
          <label className="text-sm font-medium text-slate-900">Template (this person)</label>
          <select
            required
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={templateId}
            disabled={loadingTemplates}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            {loadingTemplates ? <option>Loading…</option> : null}
            {!loadingTemplates && templates.length === 0 ? (
              <option value="">No active one-time templates — create one in DocuSeal</option>
            ) : null}
            {templates.map((t) => (
              <option key={t.id} value={String(t.id)}>
                {t.name}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-slate-500">
            Templates whose name includes &quot;SAR&quot; or &quot;Disbursement&quot; appear here. After a successful
            send, the template is archived in DocuSeal.{" "}
            <button
              type="button"
              className="font-medium text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
              onClick={() => void loadTemplates()}
              disabled={loadingTemplates}
            >
              Reload list
            </button>
          </p>
          {selected && isSarReleaseTemplate(selected.name) ? (
            <p className="mt-2 text-xs text-slate-600">
              SAR: today&apos;s day/month are pre-filled when those fields exist. The client completes the signature.
            </p>
          ) : null}
          {selected && isDisbursementTemplate(selected.name) ? (
            <p className="mt-2 text-xs text-slate-600">
              Disbursement: the client completes signature and date on the document (two fields).
            </p>
          ) : null}
        </div>

        <div>
          <label className="text-sm font-medium text-slate-900">Client name</label>
          <p className="mt-0.5 text-xs text-slate-500">
            Used in the text message and on the dashboard
            {kind === "disbursement" ? " — not printed as a separate field on this document." : " — not always printed on the document."}
          </p>
          <input
            required
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            placeholder="Jane Doe"
          />
        </div>

        {(outbound.signingSmsEnabled || outbound.signingEmailEnabled) && (
          <div
            className={
              outbound.signingSmsEnabled && outbound.signingEmailEnabled
                ? "grid gap-4 sm:grid-cols-2"
                : "space-y-4"
            }
          >
            {outbound.signingSmsEnabled ? (
              <div>
                <label className="text-sm font-medium text-slate-900">Phone</label>
                <p className="mt-0.5 text-xs text-slate-500">Include country code (e.g. +1 for US).</p>
                <input
                  required={sendSms && !sendEmail}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1…"
                />
              </div>
            ) : null}
            {outbound.signingEmailEnabled ? (
              <div>
                <label className="text-sm font-medium text-slate-900">Email</label>
                <input
                  required={sendEmail && !sendSms}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="client@email.com"
                />
              </div>
            ) : null}
          </div>
        )}

        {outbound.signingSmsEnabled && outbound.signingEmailEnabled ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
            <div className="text-sm font-semibold text-slate-900">Delivery</div>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={sendSms} onChange={(e) => setSendSms(e.target.checked)} />
              SMS
            </label>
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
              Email
            </label>
          </div>
        ) : null}

        <label className="flex items-center gap-2 text-sm font-medium text-slate-900">
          <input type="checkbox" checked={reminderEnabled} onChange={(e) => setReminderEnabled(e.target.checked)} />
          Send reminders if they have not signed yet
        </label>

        <button
          disabled={busy || !canDeliver || (!loadingTemplates && templates.length === 0)}
          type="submit"
          className="w-full rounded-xl bg-[color:var(--accent)] px-4 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-50"
        >
          {busy ? "Sending…" : "Send one-time form"}
        </button>
      </form>
    </div>
  );
}
