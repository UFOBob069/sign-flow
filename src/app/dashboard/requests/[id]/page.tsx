"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, startTransition } from "react";
import type { Lead, OutboundDeliverySettings, SigningEvent, SigningRequest, SigningStatus } from "@/types/models";
import {
  formatSignflowDateTime,
  formatSignflowShortDateTime,
  formatSignflowTimestamp,
} from "@/lib/signflow-timezone";
import { DEFAULT_OUTBOUND_DELIVERY } from "@/lib/outbound-delivery";
import { postSigningResend } from "@/lib/post-signing-resend";
import { StatusChip } from "@/components/sign-flow/status-chip";

// Turn a raw signing event into a plain-English line for the Activity feed:
// a short title, an optional detail sentence, and a tone that colors the dot.
type EventTone = "info" | "success" | "warn" | "error";
function describeEvent(ev: SigningEvent): { title: string; detail?: string; tone: EventTone } {
  const m = ev.metadata ?? {};
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  const num = (v: unknown) => (typeof v === "number" ? v : undefined);
  const isReminder = str(m.kind) === "reminder";

  switch (ev.type) {
    case "created": {
      const via = str(m.actor) === "intake-engine" ? "from the intake form" : "by staff";
      const tpl = num(m.templateId);
      return { title: "Request created", detail: `Created ${via}${tpl ? ` · template #${tpl}` : ""}.`, tone: "info" };
    }
    case "sms_sent":
      return {
        title: isReminder ? "Reminder sent by text" : "Text message sent",
        detail: isReminder ? "A follow-up text nudged the client to sign." : "The signing link was texted to the client.",
        tone: "info",
      };
    case "email_sent":
      return {
        title: isReminder ? "Reminder sent by email" : "Email sent",
        detail: isReminder ? "A follow-up email nudged the client to sign." : "The signing link was emailed to the client.",
        tone: "info",
      };
    case "reminder_sent": {
      const count = num(m.count);
      const channels = [m.sms ? "text" : null, m.email ? "email" : null].filter(Boolean).join(" & ");
      return {
        title: count ? `Reminder #${count} sent` : "Reminder sent",
        detail: channels ? `Sent via ${channels}.` : undefined,
        tone: "info",
      };
    }
    case "viewed":
      return { title: "Client opened the document", detail: "The client viewed the agreement.", tone: "info" };
    case "signed":
      return { title: "Client signed", detail: "The agreement was signed.", tone: "success" };
    case "downloaded":
      return { title: "Signed PDF downloaded", tone: "success" };
    case "dropbox_saved":
      return { title: "Saved to Dropbox", detail: str(m.path), tone: "success" };
    case "slack_posted":
      return { title: "Posted to Slack", tone: "success" };
    case "synced": {
      const action = str(m.action)?.replace(/_/g, " ");
      return { title: "Synced", detail: action ? `${action}.` : undefined, tone: "info" };
    }
    case "cancelled":
      return { title: "Request cancelled", tone: "warn" };
    case "reminders_stopped": {
      const source = str(m.source);
      if (source === "client_sms_stop") {
        return {
          title: "Reminders stopped (client texted STOP)",
          detail: "Automated reminder texts are off. The signing link is still active.",
          tone: "warn",
        };
      }
      return {
        title: "Reminders stopped by staff",
        detail: "Automated reminders are off. The signing link is still active.",
        tone: "warn",
      };
    }
    case "deleted":
      return { title: "Request deleted", tone: "warn" };
    case "failed": {
      const step = str(m.step)?.replace(/_/g, " ");
      const error = str(m.error);
      return {
        title: step ? `Failed: ${step}` : "Something failed",
        detail: error,
        tone: "error",
      };
    }
    default:
      return { title: String(ev.type).replace(/_/g, " "), tone: "info" };
  }
}

const EVENT_DOT: Record<EventTone, string> = {
  info: "bg-slate-300",
  success: "bg-emerald-500",
  warn: "bg-amber-500",
  error: "bg-red-500",
};

export default function SigningRequestDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = String(params.id);
  const [item, setItem] = useState<SigningRequest | null>(null);
  const [lead, setLead] = useState<Lead | null>(null);
  const [events, setEvents] = useState<SigningEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; ok: boolean } | null>(null);
  const [smsFailedBanner, setSmsFailedBanner] = useState(false);
  const [resendBusy, setResendBusy] = useState<"sms" | "email" | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [stopRemindersBusy, setStopRemindersBusy] = useState(false);
  const [purgeBusy, setPurgeBusy] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [outbound, setOutbound] = useState<OutboundDeliverySettings>(DEFAULT_OUTBOUND_DELIVERY);

  const isCancelled = item?.status === "cancelled";

  const [loading, setLoading] = useState(true);

  const applyDetail = useCallback((j: { item: SigningRequest; lead: Lead | null; events?: SigningEvent[] }) => {
    setItem(j.item);
    setLead(j.lead);
    setEvents(j.events ?? []);
  }, []);

  const fetchDetail = useCallback(async (): Promise<boolean> => {
    const res = await fetch(`/api/signing-requests/${id}`, { credentials: "include" });
    if (!res.ok) return false;
    const j = (await res.json()) as {
      item: SigningRequest;
      lead: Lead | null;
      events?: SigningEvent[];
    };
    startTransition(() => {
      setError(null);
      applyDetail(j);
    });
    return true;
  }, [id, applyDetail]);

  const refresh = useCallback(async () => {
    const ok = await fetchDetail();
    if (!ok) startTransition(() => setError("Not found"));
  }, [fetchDetail]);

  useEffect(() => {
    void (async () => {
      startTransition(() => {
        setLoading(true);
        setError(null);
      });
      const [detailOk, meRes, settingsRes] = await Promise.all([
        fetchDetail(),
        fetch("/api/auth/me", { credentials: "include" }),
        fetch("/api/app-settings", { credentials: "include" }),
      ]);

      if (meRes.ok) {
        const me = (await meRes.json()) as { isAdmin?: boolean };
        startTransition(() => setIsAdmin(Boolean(me.isAdmin)));
      }

      if (settingsRes.ok) {
        const settings = (await settingsRes.json()) as {
          item?: { outboundDelivery?: OutboundDeliverySettings } | null;
        };
        startTransition(() =>
          setOutbound({ ...DEFAULT_OUTBOUND_DELIVERY, ...(settings.item?.outboundDelivery ?? {}) }),
        );
      }

      startTransition(() => {
        setLoading(false);
        if (!detailOk) setError("Not found");
      });
    })();
  }, [fetchDetail]);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("sms") !== "failed") return;
    setSmsFailedBanner(true);
    window.history.replaceState(null, "", `/dashboard/requests/${id}`);
  }, [id]);

  if (loading && !item) {
    return null;
  }

  if (error || !item) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-900">
        {error ?? "Loading…"}{" "}
        <Link href="/dashboard" className="font-medium text-rose-950 underline">
          Back
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href="/dashboard" className="text-xs font-medium text-[color:var(--accent)] hover:underline">
            ← All requests
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{item.clientName}</h1>
          <p className="text-sm text-[color:var(--muted)]">
            {item.templateName} · DocuSeal submission {item.docusealSubmissionId ?? "—"}
          </p>
        </div>
        <StatusChip status={item.status as SigningStatus} />
      </div>

      {smsFailedBanner ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          The signing link was created, but SMS did not send. Use <strong>Retry SMS</strong> below — do not send the
          contract again.
        </div>
      ) : null}
      {feedback ? (
        <div
          className={`rounded-xl border p-3 text-sm ${
            feedback.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-rose-200 bg-rose-50 text-rose-900 whitespace-pre-wrap"
          }`}
        >
          {feedback.text}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-5 shadow-sm lg:col-span-2">
          <h2 className="text-sm font-semibold text-slate-900">Details</h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase text-slate-500">Phone</dt>
              <dd className="text-slate-800">{item.phone ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase text-slate-500">Email</dt>
              <dd className="text-slate-800">{item.email ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase text-slate-500">Language</dt>
              <dd className="text-slate-800">{item.language}</dd>
            </div>
            {item.dateOfLoss ? (
              <div>
                <dt className="text-xs font-medium uppercase text-slate-500">Date of loss</dt>
                <dd className="text-slate-800">{item.dateOfLoss}</dd>
              </div>
            ) : null}
            {item.formKind === "hipaa" && item.hipaaPrefill ? (
              <>
                <div>
                  <dt className="text-xs font-medium uppercase text-slate-500">Form type</dt>
                  <dd className="text-slate-800">HIPAA</dd>
                </div>
                {item.hipaaPrefill.dateOfBirth ? (
                  <div>
                    <dt className="text-xs font-medium uppercase text-slate-500">Date of birth</dt>
                    <dd className="text-slate-800">{item.hipaaPrefill.dateOfBirth}</dd>
                  </div>
                ) : null}
                {item.hipaaPrefill.isMinor ? (
                  <div>
                    <dt className="text-xs font-medium uppercase text-slate-500">Minor</dt>
                    <dd className="text-slate-800">Yes</dd>
                  </div>
                ) : null}
              </>
            ) : null}
            <div>
              <dt className="text-xs font-medium uppercase text-slate-500">Lead source</dt>
              <dd className="text-slate-800">{lead?.source ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase text-slate-500">Sent</dt>
              <dd className="text-slate-800">{item.sentAt ? formatSignflowDateTime(item.sentAt) : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase text-slate-500">Reminders</dt>
              <dd className="text-slate-800">
                {isCancelled || item.status === "completed" || item.status === "signed"
                  ? "—"
                  : item.reminderEnabled
                    ? "On"
                    : "Stopped — signing link still active"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase text-slate-500">Next reminder</dt>
              <dd className="text-slate-800">
                {item.reminderEnabled && item.nextReminderAt
                  ? formatSignflowShortDateTime(item.nextReminderAt)
                  : item.reminderEnabled
                    ? "—"
                    : "None (reminders stopped)"}
              </dd>
            </div>
          </dl>
          {item.signingUrl ? (
            <a
              href={item.signingUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex rounded-xl bg-[color:var(--brand-navy)] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-95"
            >
              Open signing link
            </a>
          ) : null}
        </div>

        <div className="space-y-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Actions</h2>
          <button
            type="button"
            disabled={
              isCancelled || !item.signingUrl || !item.phone?.trim() || !outbound.signingSmsEnabled || resendBusy !== null
            }
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={async () => {
              setFeedback(null);
              setResendBusy("sms");
              const out = await postSigningResend(id, { sms: true, email: false });
              setResendBusy(null);
              setFeedback(out.ok ? { ok: true, text: "SMS resent." } : { ok: false, text: out.error });
              if (out.ok) {
                setSmsFailedBanner(false);
                void refresh();
              }
            }}
          >
            {resendBusy === "sms" ? "Sending SMS…" : "Retry SMS"}
          </button>
          <button
            type="button"
            disabled={
              isCancelled ||
              !item.signingUrl ||
              !item.email?.trim() ||
              !outbound.signingEmailEnabled ||
              resendBusy !== null
            }
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={async () => {
              setFeedback(null);
              setResendBusy("email");
              const out = await postSigningResend(id, { sms: false, email: true });
              setResendBusy(null);
              setFeedback(out.ok ? { ok: true, text: "Email resent." } : { ok: false, text: out.error });
              if (out.ok) void refresh();
            }}
          >
            {resendBusy === "email" ? "Sending email…" : "Retry email"}
          </button>
          <button
            type="button"
            disabled={!item.docusealSubmissionId || syncBusy}
            className="w-full rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-950 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={async () => {
              setFeedback(null);
              setSyncBusy(true);
              const res = await fetch(`/api/signing-requests/${id}/sync-docuseal`, {
                method: "POST",
                credentials: "include",
              });
              setSyncBusy(false);
              if (!res.ok) {
                const j = (await res.json().catch(() => null)) as { error?: string } | null;
                setFeedback({ ok: false, text: j?.error ?? "Could not sync from DocuSeal." });
                return;
              }
              setFeedback({
                ok: true,
                text: "Synced from DocuSeal. Status, thank-you SMS, and team emails run if configured.",
              });
              void refresh();
            }}
          >
            {syncBusy ? "Syncing from DocuSeal…" : "Refresh from DocuSeal"}
          </button>
          <button
            type="button"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
            onClick={async () => {
              setFeedback(null);
              const res = await fetch(`/api/signing-requests/${id}/sync-dropbox`, { method: "POST", credentials: "include" });
              setFeedback(res.ok ? { ok: true, text: "Dropbox sync complete." } : { ok: false, text: "Dropbox sync failed." });
              void refresh();
            }}
          >
            Re-sync to Dropbox
          </button>
          {!isCancelled && item.status !== "completed" && item.status !== "signed" && item.reminderEnabled ? (
            <button
              type="button"
              disabled={stopRemindersBusy}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-40"
              onClick={async () => {
                if (
                  !window.confirm(
                    `Stop automated reminders for ${item.clientName}? The signing link will stay active so they can still sign.`,
                  )
                ) {
                  return;
                }
                setFeedback(null);
                setStopRemindersBusy(true);
                const res = await fetch(`/api/signing-requests/${id}/stop-reminders`, {
                  method: "POST",
                  credentials: "include",
                });
                setStopRemindersBusy(false);
                if (!res.ok) {
                  const j = (await res.json().catch(() => null)) as { error?: string } | null;
                  setFeedback({ ok: false, text: j?.error ?? "Could not stop reminders." });
                  return;
                }
                setFeedback({
                  ok: true,
                  text: "Reminders stopped. Signing link remains active.",
                });
                void refresh();
              }}
            >
              {stopRemindersBusy ? "Stopping reminders…" : "Stop reminders"}
            </button>
          ) : null}
          {!isCancelled && item.status !== "completed" && item.status !== "signed" && !item.reminderEnabled ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
              Reminders are stopped (client STOP text and/or staff). The signing link is still active.
            </p>
          ) : null}
          {!isCancelled && item.status !== "completed" ? (
            <button
              type="button"
              disabled={cancelBusy}
              className="w-full rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950 hover:bg-amber-100 disabled:opacity-40"
              onClick={async () => {
                if (
                  !window.confirm(
                    `Cancel this signing request for ${item.clientName}? It will stay on the list as cancelled and reminders will stop.`,
                  )
                ) {
                  return;
                }
                setFeedback(null);
                setCancelBusy(true);
                const res = await fetch(`/api/signing-requests/${id}/cancel`, {
                  method: "POST",
                  credentials: "include",
                });
                setCancelBusy(false);
                if (!res.ok) {
                  const j = (await res.json().catch(() => null)) as { error?: string } | null;
                  setFeedback({ ok: false, text: j?.error ?? "Could not cancel request." });
                  return;
                }
                setFeedback({ ok: true, text: "Request cancelled." });
                void refresh();
              }}
            >
              {cancelBusy ? "Cancelling…" : "Cancel request"}
            </button>
          ) : null}
          {isAdmin ? (
            <button
              type="button"
              disabled={purgeBusy}
              className="w-full rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-950 hover:bg-rose-100 disabled:opacity-40"
              onClick={async () => {
                if (
                  !window.confirm(
                    `Permanently delete this signing request for ${item.clientName}? It will be removed completely from Sign Flow. This cannot be undone.`,
                  )
                ) {
                  return;
                }
                setFeedback(null);
                setPurgeBusy(true);
                const res = await fetch(`/api/signing-requests/${id}`, {
                  method: "DELETE",
                  credentials: "include",
                });
                setPurgeBusy(false);
                if (!res.ok) {
                  const j = (await res.json().catch(() => null)) as { error?: string } | null;
                  setFeedback({ ok: false, text: j?.error ?? "Could not delete request." });
                  return;
                }
                router.push("/dashboard");
              }}
            >
              {purgeBusy ? "Deleting…" : "Delete permanently (admin)"}
            </button>
          ) : null}
          {isCancelled ? (
            <p className="text-xs text-slate-500">Cancelled — no further reminders or resends.</p>
          ) : item.status === "completed" ? (
            <p className="text-xs text-slate-500">Completed requests cannot be cancelled.</p>
          ) : (
            <p className="text-xs text-slate-500">
              Cancel keeps the request on the dashboard. Admins can delete permanently.
            </p>
          )}
        </div>
      </div>

      {(item.signedPdfUrl || item.auditCertificateUrl) && (
        <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Signed files (DocuSeal)</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-sky-800">
            {item.signedPdfUrl ? (
              <li>
                <a href={item.signedPdfUrl} target="_blank" rel="noreferrer" className="hover:underline">
                  Signed PDF
                </a>
              </li>
            ) : null}
            {item.auditCertificateUrl ? (
              <li>
                <a href={item.auditCertificateUrl} target="_blank" rel="noreferrer" className="hover:underline">
                  Audit certificate
                </a>
              </li>
            ) : null}
          </ul>
        </div>
      )}

      <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Activity</h2>
        {events.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No activity yet.</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {events.map((ev) => {
              const { title, detail, tone } = describeEvent(ev);
              return (
                <li key={ev.id} className="flex gap-3 text-sm">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${EVENT_DOT[tone]}`} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                      <span className="font-medium text-slate-900">{title}</span>
                      <span className="text-xs text-slate-500">{formatSignflowTimestamp(ev.timestamp)}</span>
                    </div>
                    {detail ? (
                      <p className={`mt-0.5 break-words ${tone === "error" ? "text-red-600" : "text-slate-500"}`}>
                        {detail}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
