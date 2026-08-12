import Link from "next/link";

const SEND_TYPES = [
  {
    href: "/dashboard/send/contract",
    title: "Contract",
    description: "English or Spanish intake contracts. Pre-fills client name, date of loss, and today’s date.",
  },
  {
    href: "/dashboard/send/onetime",
    title: "One-time form",
    description: "SAR releases, disbursement agreements, and other per-person templates. Archived in DocuSeal after send.",
  },
  {
    href: "/dashboard/send/hipaa",
    title: "HIPAA form",
    description: "RJL HIPAA Form (English only). Pre-fills client details; client completes signature.",
  },
] as const;

export default function SendHubPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Send signing request</h1>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          Choose the type of document to send. Each form collects the fields needed for that template.
        </p>
      </div>

      <ul className="grid gap-4">
        {SEND_TYPES.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="block rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-5 shadow-sm transition hover:border-[color:var(--brand-navy)]/30 hover:shadow-md"
            >
              <div className="text-lg font-semibold text-slate-900">{item.title}</div>
              <p className="mt-1 text-sm text-[color:var(--muted)]">{item.description}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
