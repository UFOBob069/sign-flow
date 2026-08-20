"use client";

import { useEffect, useState, startTransition } from "react";

type SettingsResponse = {
  item: {
    id: string;
    docusealConfigured: boolean;
    smsConfigured: boolean;
    dropboxConfigured: boolean;
    slackWebhookConfigured: boolean;
    emailConfigured: boolean;
    updatedAt: string;
  } | null;
  env: Record<string, boolean>;
};

export default function AdminSettingsPage() {
  const [data, setData] = useState<SettingsResponse | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/app-settings", { credentials: "include" });
      if (res.ok) {
        const json = (await res.json()) as SettingsResponse;
        startTransition(() => setData(json));
      }
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Environment</h1>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          Secrets stay in environment variables (Vercel, Railway, etc.). Firestore only stores integration flags you toggle
          from this screen.
        </p>
      </div>

      <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-6 shadow-sm">
        <div className="text-sm font-semibold text-slate-900">Environment checklist</div>
        <ul className="mt-4 space-y-2 text-sm text-slate-700">
          {data ? (
            Object.entries(data.env).map(([k, v]) => (
              <li key={k} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
                <code className="text-xs">{k}</code>
                <span className={v ? "text-emerald-700" : "text-slate-500"}>{v ? "present" : "missing"}</span>
              </li>
            ))
          ) : (
            <li className="text-sm text-slate-600">Loading…</li>
          )}
        </ul>
        <div className="mt-4 text-xs text-slate-600">
          Staff auth: <code>NEXT_PUBLIC_FIREBASE_*</code>, <code>SIGNFLOW_SESSION_SECRET</code>, Firebase Admin env vars,
          optional <code>SIGNFLOW_ALLOWED_GOOGLE_EMAILS</code> (emails or domains like{" "}
          <code className="text-xs">ramosjames.com</code>), admin deletes via <code>SIGNFLOW_ADMIN_EMAILS</code>.
          DocuSeal: <code>DOCUSEAL_API_URL</code>,{" "}
          <code>DOCUSEAL_API_KEY</code>, optional <code>DOCUSEAL_WEBHOOK_SECRET</code>, <code>DOCUSEAL_ADMIN_BASE_URL</code>.
          Quo SMS: <code>QUO_API_KEY</code>, <code>QUO_FROM_NUMBER</code> or <code>QUO_PHONE_NUMBER_ID</code> (optional{" "}
          <code>QUO_USER_ID</code>). Email:
          Workspace delegation (<code>GMAIL_SERVICE_ACCOUNT_*</code>, <code>GMAIL_SEND_AS_EMAIL</code>), or SendGrid, or
          Gmail user OAuth. Dropbox: <code>DROPBOX_ACCESS_TOKEN</code>. Cron:{" "}
          <code>CRON_SECRET</code>.
        </div>
      </div>

      <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-6 shadow-sm">
        <div className="text-sm font-semibold text-slate-900">Firebase Authentication (staff)</div>
        <p className="mt-2 text-sm text-slate-700">
          Sign-in uses the Firebase JS SDK in the browser (Google provider), then the server verifies the Firebase ID token
          and sets the Sign Flow session cookie. Enable Google in Firebase Console → Authentication, and add{" "}
          <code className="text-xs">NEXT_PUBLIC_FIREBASE_*</code> from Project settings → Your apps.
        </p>
        <p className="mt-2 text-xs text-slate-600">
          Authorized domains must include this app&apos;s host (and <code>localhost</code> for local dev).
        </p>
      </div>

      <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-6 shadow-sm">
        <div className="text-sm font-semibold text-slate-900">Reminder cron</div>
        <p className="mt-2 text-sm text-slate-700">
          Vercel Cron calls <code className="rounded bg-slate-100 px-1 text-xs">/api/cron/reminders</code> every 15
          minutes and sends any due reminders (first reminder defaults to 30 minutes after send). Client reminders only
          go out between <strong>7:00 AM and 8:00 PM US Central</strong>; overnight due items wait until 7:00 AM.
          Opening the <strong>Signing requests</strong> dashboard also triggers a backup sweep. To run the endpoint
          manually, GET that URL with header <code className="text-xs">x-cron-secret</code> if{" "}
          <code>CRON_SECRET</code> is set.
        </p>
      </div>

      <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-6 shadow-sm">
        <div className="text-sm font-semibold text-slate-900">Quo SMS webhooks (STOP)</div>
        <p className="mt-2 text-sm text-slate-700">
          Shared Quo workspace: point <code className="rounded bg-slate-100 px-1 text-xs">message.received</code> to{" "}
          <code className="rounded bg-slate-100 px-1 text-xs">https://your-host/api/webhooks/quo</code> and set{" "}
          <code className="rounded bg-slate-100 px-1 text-xs">QUO_WEBHOOK_SECRET</code> in env.
        </p>
        <p className="mt-2 text-sm text-slate-700">
          Separate Quo account per firm: use the firm-specific URL shown under Admin → Firms (e.g.{" "}
          <code className="rounded bg-slate-100 px-1 text-xs">/api/webhooks/quo/&#123;firmId&#125;</code>) and store that
          account’s signing secret on the firm.
        </p>
        <p className="mt-2 text-xs text-slate-600">
          When a client replies <strong>STOP</strong> (or Spanish <strong>ALTO</strong>), Sign Flow turns off automated
          reminders only — the signing link stays active.
        </p>
      </div>

      <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-6 shadow-sm">
        <div className="text-sm font-semibold text-slate-900">DocuSeal webhooks</div>
        <p className="mt-2 text-sm text-slate-700">
          Point DocuSeal webhooks to:{" "}
          <code className="rounded bg-slate-100 px-1 text-xs">https://your-host/api/webhooks/docuseal</code>
        </p>
        <p className="mt-2 text-xs text-slate-600">
          Optional: set matching secret in <code>DOCUSEAL_WEBHOOK_SECRET</code> and configure the same value in DocuSeal
          webhook settings if your deployment supports a shared secret header.
        </p>
      </div>

      <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-6 shadow-sm">
        <div className="text-sm font-semibold text-slate-900">Firebase (Firestore)</div>
        <p className="mt-2 text-sm text-slate-700">
          Collections: <code className="text-xs">leads</code>, <code className="text-xs">signingRequests</code>,{" "}
          <code className="text-xs">signingEvents</code>, <code className="text-xs">appSettings/default</code> (flags plus
          optional <code className="text-xs">communicationTemplates</code> and <code className="text-xs">reminderSchedule</code>{" "}
          from Messages & reminders).
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li>
            <code className="text-xs">FIREBASE_PROJECT_ID</code>
          </li>
          <li>
            <code className="text-xs">FIREBASE_CLIENT_EMAIL</code>
          </li>
          <li>
            <code className="text-xs">FIREBASE_PRIVATE_KEY</code>
          </li>
        </ul>
      </div>
    </div>
  );
}
