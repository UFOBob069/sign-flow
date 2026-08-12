import Link from "next/link";
import type { ReactNode } from "react";

const DEMO_VIDEO_ID = "cBWzlRRbJ6s";

type FaqItem = {
  question: string;
  answer: ReactNode;
};

type FaqSection = {
  title: string;
  items: FaqItem[];
};

const SECTIONS: FaqSection[] = [
  {
    title: "Getting Started",
    items: [
      {
        question: "What is Sign Flow?",
        answer:
          "A tool for sending intake contracts to clients via text message for electronic signature.",
      },
      {
        question: "How do I log in?",
        answer: "Use your Ramos James account credentials.",
      },
    ],
  },
  {
    title: "Sending a Contract",
    items: [
      {
        question: "How do I send a contract?",
        answer: (
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>
              Click{" "}
              <Link href="/dashboard/send/contract" className="font-medium text-[color:var(--brand-navy)] underline underline-offset-2">
                Send contract
              </Link>{" "}
              (from the{" "}
              <Link href="/dashboard/send" className="font-medium text-[color:var(--brand-navy)] underline underline-offset-2">
                Send
              </Link>{" "}
              menu)
            </li>
            <li>Select the correct template</li>
            <li>Enter the client&apos;s name</li>
            <li>Enter the date of loss</li>
            <li>Enter the client&apos;s phone number</li>
            <li>Send the request</li>
          </ol>
        ),
      },
      {
        question: "What templates are available?",
        answer: (
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>English Intake Contract</li>
            <li>Spanish Intake Contract</li>
            <li>One-time forms — SAR (name includes “SAR”) or Disbursement (name includes “Disbursement”)</li>
            <li>HIPAA form — English only; name must include “HIPAA”</li>
          </ul>
        ),
      },
      {
        question: "How do I send a one-time form (SAR or Disbursement)?",
        answer: (
          <>
            <p className="mb-2">
              Use{" "}
              <Link href="/dashboard/send/onetime" className="font-medium text-[color:var(--brand-navy)] underline underline-offset-2">
                One-time
              </Link>
              . That page lists SAR and Disbursement templates and keeps contracts/HIPAA out of the dropdown.
            </p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Create the person&apos;s template in DocuSeal (name must include &quot;SAR&quot; or &quot;Disbursement&quot;)</li>
              <li>Open One-time and select that template</li>
              <li>Enter the client&apos;s name (used in SMS and on the dashboard)</li>
              <li>Enter phone with <code className="rounded bg-slate-100 px-1 text-xs">+1</code> and send</li>
              <li>After a successful send, Sign Flow archives the template in DocuSeal</li>
              <li>Disbursement: client completes signature and date on the document</li>
            </ol>
          </>
        ),
      },
      {
        question: "How do I send a HIPAA form?",
        answer: (
          <>
            <p className="mb-2">
              Use{" "}
              <Link href="/dashboard/send/hipaa" className="font-medium text-[color:var(--brand-navy)] underline underline-offset-2">
                Send HIPAA
              </Link>
              . That page only lists HIPAA templates and collects the fields needed for the RJL HIPAA Form (English only).
            </p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Select the HIPAA template</li>
              <li>Enter first and last name (required)</li>
              <li>Fill optional demographics as needed</li>
              <li>Confirm the legal and all-health authorizations</li>
              <li>Enter delivery phone with <code className="rounded bg-slate-100 px-1 text-xs">+1</code> and send</li>
              <li>The client completes the signature on the document</li>
            </ol>
          </>
        ),
      },
    ],
  },
  {
    title: "Phone Number Requirements",
    items: [
      {
        question: "Why won't the text send?",
        answer: (
          <>
            <p>The phone number must include the country code format.</p>
            <p className="mt-2">
              Example: <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm">+1XXXXXXXXXX</code>
            </p>
          </>
        ),
      },
      {
        question: "Do I need the +1?",
        answer: "Yes. This appears to be required for delivery.",
      },
    ],
  },
  {
    title: "Tracking Status",
    items: [
      {
        question: "How do I know if a client received the contract?",
        answer: (
          <>
            Check the{" "}
            <Link href="/dashboard" className="font-medium text-[color:var(--brand-navy)] underline underline-offset-2">
              request dashboard
            </Link>
            .
          </>
        ),
      },
      {
        question: "What statuses can I see?",
        answer: (
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Sent</li>
            <li>Viewed</li>
            <li>Completed</li>
          </ul>
        ),
      },
      {
        question: "Can I tell if the client opened the contract?",
        answer: "Yes, the status will show when it has been viewed.",
      },
      {
        question: "Can I tell if the client signed it?",
        answer: "Yes, completed requests are marked as completed.",
      },
    ],
  },
  {
    title: "Reminders & Follow-Up",
    items: [
      {
        question: "Does Sign Flow send reminders?",
        answer: "Yes, reminder activity is visible on each request. Reminders only go out between 7:00 AM and 8:00 PM US Central.",
      },
      {
        question: "What happens if a client texts STOP?",
        answer: (
          <>
            <p>
              Sign Flow turns off <strong>automated reminders only</strong>. The signing link stays active so the client can
              still open and sign. On the request page you&apos;ll see Reminders marked as stopped, and an activity row for
              the STOP.
            </p>
            <p className="mt-2">
              Staff can also use <strong>Stop reminders</strong> on the request without cancelling it. Cancelling a request is
              separate and stops reminders plus marks the request cancelled.
            </p>
          </>
        ),
      },
      {
        question: "How do I know when the last activity occurred?",
        answer: "The dashboard shows the most recent activity date/time.",
      },
    ],
  },
  {
    title: "Document Access",
    items: [
      {
        question: "Can I view the document that was sent?",
        answer: "Yes, click on the request to view the document.",
      },
    ],
  },
  {
    title: "Troubleshooting",
    items: [
      {
        question: "The client says they never got the text. What should I check first?",
        answer: (
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Verify the phone number.</li>
            <li>Confirm the number includes +1.</li>
            <li>Check the request status in the dashboard.</li>
            <li>Verify the request was successfully sent.</li>
          </ul>
        ),
      },
    ],
  },
];

export default function FaqPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">FAQ</h1>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          How to use Sign Flow for Ramos James Law intake contracts.
        </p>
      </div>

      <section className="overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] shadow-sm">
        <div className="border-b border-[color:var(--border)] px-6 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Demo video</h2>
          <p className="mt-1 text-xs text-slate-600">Walkthrough of sending a signing request.</p>
        </div>
        <div className="aspect-video w-full bg-slate-900">
          <iframe
            className="h-full w-full"
            src={`https://www.youtube.com/embed/${DEMO_VIDEO_ID}`}
            title="Sign Flow demo video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
      </section>

      <div className="space-y-8">
        {SECTIONS.map((section) => (
          <section
            key={section.title}
            className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-6 shadow-sm"
          >
            <h2 className="text-base font-semibold text-slate-900">{section.title}</h2>
            <dl className="mt-4 divide-y divide-slate-100">
              {section.items.map((item) => (
                <div key={item.question} className="py-4 first:pt-0 last:pb-0">
                  <dt className="text-sm font-medium text-slate-900">{item.question}</dt>
                  <dd className="mt-2 text-sm leading-relaxed text-slate-700">{item.answer}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>
  );
}
