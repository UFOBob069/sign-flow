"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, startTransition } from "react";
import { filterContractTemplates, languageFromContractTemplate, templateRequiresDateOfLoss } from "@/lib/docuseal-prefill";
import type { DocuSealTemplateSummary, OutboundDeliverySettings } from "@/types/models";
import { DEFAULT_OUTBOUND_DELIVERY } from "@/lib/outbound-delivery";

export default function SendContractPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<DocuSealTemplateSummary[]>([]);
  const [templateId, setTemplateId] = useState<string>("");
  const [clientName, setClientName] = useState("");
  const [dateOfLoss, setDateOfLoss] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [language, setLanguage] = useState<"en" | "es">("en");
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
      const list = filterContractTemplates(j.items);
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

  const selectedTemplate = useMemo(
    () => templates.find((t) => String(t.id) === templateId),
    [templates, templateId],
  );
  const needsDateOfLoss = selectedTemplate ? templateRequiresDateOfLoss(selectedTemplate.name) : false;

  useEffect(() => {
    if (!selectedTemplate) return;
    const fromContract = languageFromContractTemplate(selectedTemplate.name);
    if (fromContract) setLanguage(fromContract);
  }, [selectedTemplate?.id, selectedTemplate?.name]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <p className="text-sm text-[color:var(--muted)]">
          <Link href="/dashboard/send" className="font-medium text-[color:var(--brand-navy)] underline underline-offset-2">
            ← All send types
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Send contract</h1>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          English or Spanish intake contracts. Pre-fills client name, date of loss, and today&apos;s date (US Central).
        </p>
      </div>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{error}</div> : null}

      {!canDeliver ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <strong>Signing delivery is disabled.</strong> An admin must enable SMS and/or email under{" "}
          <strong>Admin → Messages → Signing request delivery</strong> before you can send requests.
        </div>
      ) : null}

      {quoReady === false && sendSms && outbound.signingSmsEnabled ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <strong>SMS will not send</strong> until <code className="text-xs">QUO_API_KEY</code> and{" "}
          <code className="text-xs">QUO_FROM_NUMBER</code> (or <code className="text-xs">QUO_PHONE_NUMBER_ID</code>) are
          set — use a number from your Quo workspace, not another provider. US numbers require Quo carrier (A2P)
          registration. For local testing without Quo, set{" "}
          <code className="text-xs">QUO_SMS_MOCK=true</code>
          {outbound.signingEmailEnabled ? " or uncheck SMS and use email only." : "."}
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
            setError("Select a template.");
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
          if (needsDateOfLoss && !dateOfLoss.trim()) {
            setError("Date of loss is required for this contract template.");
            setBusy(false);
            return;
          }
          if (!clientName.trim()) {
            setError("Client name is required.");
            setBusy(false);
            return;
          }
          const res = await fetch("/api/signing-requests", {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              clientName: clientName.trim(),
              dateOfLoss: needsDateOfLoss ? dateOfLoss.trim() : null,
              phone: phone.trim() || null,
              email: email.trim() || null,
              language,
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
          const j = (await res.json()) as { item: { id: string }; warning?: string };
          router.push(j.warning ? `/dashboard/requests/${j.item.id}?sms=failed` : `/dashboard/requests/${j.item.id}`);
        }}
      >
        <div>
          <label className="text-sm font-medium text-slate-900">Template</label>
          <select
            required
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={templateId}
            disabled={loadingTemplates}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            {loadingTemplates ? <option>Loading…</option> : null}
            {!loadingTemplates && templates.length === 0 ? <option value="">No templates</option> : null}
            {templates.map((t) => (
              <option key={t.id} value={String(t.id)}>
                {t.name}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-slate-500">
            Added or renamed a template in DocuSeal?{" "}
            <button
              type="button"
              className="font-medium text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
              onClick={() => void loadTemplates()}
              disabled={loadingTemplates}
            >
              Reload list
            </button>
          </p>
        </div>

        <div>
          <label className="text-sm font-medium text-slate-900">Client name</label>
          <input
            required
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            placeholder="Jane Doe"
          />
        </div>
        {needsDateOfLoss ? (
          <div>
            <label className="text-sm font-medium text-slate-900">Date of loss</label>
            <p className="mt-0.5 text-xs text-slate-500">
              Pre-fills date-of-loss fields on the contract. Today&apos;s date is filled automatically when you send (US
              Central).
            </p>
            <input
              required
              type="date"
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={dateOfLoss}
              onChange={(e) => setDateOfLoss(e.target.value)}
            />
          </div>
        ) : null}

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

        <div>
          <label className="text-sm font-medium text-slate-900">SMS language</label>
          <p className="mt-0.5 text-xs text-slate-500">
            Defaults to match the selected contract. Also used for email. You can change it if needed.
          </p>
          <div className="mt-2 flex gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="lang" checked={language === "en"} onChange={() => setLanguage("en")} />
              English
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="lang" checked={language === "es"} onChange={() => setLanguage("es")} />
              Spanish
            </label>
          </div>
        </div>
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
          disabled={busy || !canDeliver}
          type="submit"
          className="w-full rounded-xl bg-[color:var(--accent)] px-4 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-50"
        >
          {busy ? "Sending…" : "Send contract"}
        </button>
      </form>
    </div>
  );
}
