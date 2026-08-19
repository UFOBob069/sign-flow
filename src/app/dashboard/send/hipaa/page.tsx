"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, startTransition, type ReactNode } from "react";
import { filterHipaaTemplates } from "@/lib/docuseal-prefill";
import type { DocuSealTemplateSummary, HipaaFormPrefill, OutboundDeliverySettings } from "@/types/models";
import { DEFAULT_OUTBOUND_DELIVERY } from "@/lib/outbound-delivery";

function emptyOptional(value: string): string | null {
  const v = value.trim();
  return v ? v : null;
}

function FieldLabel({
  children,
  required,
  optional,
}: {
  children: ReactNode;
  required?: boolean;
  optional?: boolean;
}) {
  return (
    <span className="text-sm font-medium text-slate-900">
      {children}
      {required ? <span className="text-rose-600"> *</span> : null}
      {optional ? <span className="ml-1.5 text-xs font-normal text-slate-500">(optional)</span> : null}
    </span>
  );
}

function SectionHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="border-t border-slate-200 pt-5 first:border-t-0 first:pt-0">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      {description ? <p className="mt-1 text-xs text-slate-500">{description}</p> : null}
    </div>
  );
}

export default function SendHipaaPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<DocuSealTemplateSummary[]>([]);
  const [templateId, setTemplateId] = useState<string>("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [otherName, setOtherName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [altPhone, setAltPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [legalAcknowledged, setLegalAcknowledged] = useState(false);
  const [allHealthAcknowledged, setAllHealthAcknowledged] = useState(false);
  const [isMinor, setIsMinor] = useState(false);
  const [nameAuthorizedRepForMinor, setNameAuthorizedRepForMinor] = useState("");
  const [minorRepParent, setMinorRepParent] = useState(false);
  const [minorRepGuardian, setMinorRepGuardian] = useState(false);
  const [minorRepOther, setMinorRepOther] = useState(false);
  const [deliveryPhone, setDeliveryPhone] = useState("");
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [quoReady, setQuoReady] = useState<boolean | null>(null);
  const [smsEnabled, setSmsEnabled] = useState(DEFAULT_OUTBOUND_DELIVERY.signingSmsEnabled);

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
      const list = filterHipaaTemplates(j.items);
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
        setSmsEnabled(od.signingSmsEnabled);
      });
    })();
  }, []);

  function buildHipaaPrefill(): HipaaFormPrefill {
    return {
      lastName: lastName.trim(),
      firstName: firstName.trim(),
      middleName: emptyOptional(middleName),
      otherName: emptyOptional(otherName),
      dateOfBirth: emptyOptional(dateOfBirth),
      address: emptyOptional(address),
      city: emptyOptional(city),
      state: emptyOptional(state),
      zipCode: emptyOptional(zipCode),
      phone: emptyOptional(formPhone),
      altPhone: emptyOptional(altPhone),
      email: emptyOptional(formEmail),
      legalAcknowledged,
      allHealthAcknowledged,
      isMinor,
      nameAuthorizedRepForMinor: isMinor ? emptyOptional(nameAuthorizedRepForMinor) : null,
      minorRepParent: isMinor ? minorRepParent : false,
      minorRepGuardian: isMinor ? minorRepGuardian : false,
      minorRepOther: isMinor ? minorRepOther : false,
    };
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <p className="text-sm text-[color:var(--muted)]">
          <Link href="/dashboard/send" className="font-medium text-[color:var(--brand-navy)] underline underline-offset-2">
            ← All send types
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Send HIPAA form</h1>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          English only. Pre-fills client information and today&apos;s date (US Central). The signing link is sent by
          text message. The client completes the signature on the document.
        </p>
      </div>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{error}</div> : null}

      {!smsEnabled ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <strong>SMS delivery is disabled.</strong> An admin must enable SMS under{" "}
          <strong>Admin → Messages → Signing request delivery</strong>.
        </div>
      ) : null}

      {quoReady === false && smsEnabled ? (
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
            setError("Select a HIPAA template.");
            setBusy(false);
            return;
          }
          if (!smsEnabled) {
            setError("SMS for signing requests is disabled in admin settings.");
            setBusy(false);
            return;
          }
          if (!deliveryPhone.trim()) {
            setError("Phone number is required to send the signing link.");
            setBusy(false);
            return;
          }
          if (!lastName.trim()) {
            setError("Last name is required.");
            setBusy(false);
            return;
          }
          if (!firstName.trim()) {
            setError("First name is required.");
            setBusy(false);
            return;
          }
          if (!legalAcknowledged) {
            setError("Confirm the legal authorization before sending.");
            setBusy(false);
            return;
          }
          if (!allHealthAcknowledged) {
            setError("Confirm the all-health authorization before sending.");
            setBusy(false);
            return;
          }

          const hipaaPrefill = buildHipaaPrefill();
          const res = await fetch("/api/signing-requests", {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              clientName: "",
              dateOfLoss: null,
              hipaaPrefill,
              phone: deliveryPhone.trim(),
              email: null,
              language: "en",
              templateId: tid,
              sendSms: true,
              sendEmail: false,
              reminderEnabled,
            }),
          });
          setBusy(false);
          if (!res.ok) {
            const j = (await res.json().catch(() => null)) as { error?: string } | null;
            setError(typeof j?.error === "string" ? j.error : "Request failed");
            return;
          }
          const j = (await res.json()) as { item: { id: string }; warning?: string };
          router.push(j.warning ? `/dashboard/requests/${j.item.id}?sms=failed` : `/dashboard/requests/${j.item.id}`);
        }}
      >
        <div>
          <FieldLabel required>HIPAA template</FieldLabel>
          <select
            required
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={templateId}
            disabled={loadingTemplates}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            {loadingTemplates ? <option>Loading…</option> : null}
            {!loadingTemplates && templates.length === 0 ? (
              <option value="">No HIPAA templates — name must include &quot;HIPAA&quot; in DocuSeal</option>
            ) : null}
            {templates.map((t) => (
              <option key={t.id} value={String(t.id)}>
                {t.name}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-slate-500">
            Only templates whose name includes &quot;HIPAA&quot; appear here.{" "}
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

        <SectionHeading
          title="Required"
          description="First name and last name are required. Fields marked optional are pre-filled only when you enter a value."
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block">
              <FieldLabel required>First name</FieldLabel>
              <input
                required
                aria-required="true"
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </label>
          </div>
          <div>
            <label className="block">
              <FieldLabel required>Last name</FieldLabel>
              <input
                required
                aria-required="true"
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-3">
          <FieldLabel required>Authorizations</FieldLabel>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              required
              className="mt-0.5"
              checked={legalAcknowledged}
              onChange={(e) => setLegalAcknowledged(e.target.checked)}
            />
            <span>Legal authorization confirmed for this client</span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              required
              className="mt-0.5"
              checked={allHealthAcknowledged}
              onChange={(e) => setAllHealthAcknowledged(e.target.checked)}
            />
            <span>All-health authorization confirmed for this client</span>
          </label>
        </div>

        <SectionHeading
          title="Optional — client details"
          description="Pre-filled on the HIPAA document when provided. Leave blank to skip."
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block">
              <FieldLabel optional>Middle name</FieldLabel>
              <input
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={middleName}
                onChange={(e) => setMiddleName(e.target.value)}
              />
            </label>
          </div>
          <div>
            <label className="block">
              <FieldLabel optional>Other name</FieldLabel>
              <input
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={otherName}
                onChange={(e) => setOtherName(e.target.value)}
              />
            </label>
          </div>
        </div>

        <div>
          <label className="block">
            <FieldLabel optional>Date of birth</FieldLabel>
            <p className="mt-0.5 text-xs text-slate-500">Pre-fills month, day, and year on the form.</p>
            <input
              type="date"
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
            />
          </label>
        </div>

        <div>
          <label className="block">
            <FieldLabel optional>Address</FieldLabel>
            <input
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="block">
              <FieldLabel optional>City</FieldLabel>
              <input
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </label>
          </div>
          <div>
            <label className="block">
              <FieldLabel optional>State</FieldLabel>
              <input
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={state}
                onChange={(e) => setState(e.target.value)}
              />
            </label>
          </div>
        </div>

        <div>
          <label className="block">
            <FieldLabel optional>ZIP code</FieldLabel>
            <input
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={zipCode}
              onChange={(e) => setZipCode(e.target.value)}
            />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block">
              <FieldLabel optional>Phone</FieldLabel>
              <p className="mt-0.5 text-xs text-slate-500">Pre-filled on the document — not used for the text message.</p>
              <input
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
              />
            </label>
          </div>
          <div>
            <label className="block">
              <FieldLabel optional>Alt phone</FieldLabel>
              <input
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={altPhone}
                onChange={(e) => setAltPhone(e.target.value)}
              />
            </label>
          </div>
        </div>

        <div>
          <label className="block">
            <FieldLabel optional>Email</FieldLabel>
            <p className="mt-0.5 text-xs text-slate-500">Pre-filled on the document only.</p>
            <input
              type="email"
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={formEmail}
              onChange={(e) => setFormEmail(e.target.value)}
            />
          </label>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-4">
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <input type="checkbox" checked={isMinor} onChange={(e) => setIsMinor(e.target.checked)} />
              <FieldLabel optional>This is for a minor</FieldLabel>
            </label>
            <p className="mt-1 text-xs text-slate-500">
              When checked, optional minor fields can be pre-filled. The client still completes signatures.
            </p>
          </div>
          {isMinor ? (
            <>
              <div>
                <label className="block">
                  <FieldLabel optional>Authorized representative for minor</FieldLabel>
                  <input
                    className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    value={nameAuthorizedRepForMinor}
                    onChange={(e) => setNameAuthorizedRepForMinor(e.target.value)}
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={minorRepParent} onChange={(e) => setMinorRepParent(e.target.checked)} />
                  <FieldLabel optional>Parent</FieldLabel>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={minorRepGuardian}
                    onChange={(e) => setMinorRepGuardian(e.target.checked)}
                  />
                  <FieldLabel optional>Guardian</FieldLabel>
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={minorRepOther} onChange={(e) => setMinorRepOther(e.target.checked)} />
                  <FieldLabel optional>Other</FieldLabel>
                </label>
              </div>
            </>
          ) : null}
        </div>

        <SectionHeading title="Delivery" description="Signing link is sent by text message (SMS) only." />

        <div>
          <label className="block">
            <FieldLabel required>Phone for text message</FieldLabel>
            <p className="mt-0.5 text-xs text-slate-500">Include country code (e.g. +1 for US).</p>
            <input
              required
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={deliveryPhone}
              onChange={(e) => setDeliveryPhone(e.target.value)}
              placeholder="+1…"
            />
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm font-medium text-slate-900">
          <input type="checkbox" checked={reminderEnabled} onChange={(e) => setReminderEnabled(e.target.checked)} />
          Send reminders if they have not signed yet
        </label>

        <button
          disabled={busy || !smsEnabled || (!loadingTemplates && templates.length === 0)}
          type="submit"
          className="w-full rounded-xl bg-[color:var(--accent)] px-4 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-50"
        >
          {busy ? "Sending…" : "Send HIPAA form"}
        </button>
      </form>
    </div>
  );
}
