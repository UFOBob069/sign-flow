// External intake endpoint for server-to-server callers (e.g. the Intake Engine
// journey platform). Authenticated with a shared bearer token — SIGNFLOW_INTAKE_TOKEN
// — rather than a staff session, since there is no human in the loop.
//
// It creates the lead + signing request (and the DocuSeal submission) with NO
// immediate SMS/email: the visitor signs inline via the returned signingUrl, and
// the reminder schedule follows up only if they don't finish. Set sendSms/sendEmail
// to true to also deliver right away.

import { NextResponse } from "next/server";
import { z } from "zod";
import { timingSafeEqual } from "node:crypto";
import { createLeadAndSigningRequest } from "@/server/signing-workflow";

export const dynamic = "force-dynamic";

function tokenOk(req: Request): boolean {
  const expected = process.env.SIGNFLOW_INTAKE_TOKEN;
  if (!expected) return false;
  const header = req.headers.get("authorization") ?? "";
  const provided = /^Bearer\s+(.+)$/i.exec(header)?.[1]?.trim() ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

const schema = z.object({
  clientName: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z
    .preprocess((v) => (v === "" || v === null || v === undefined ? undefined : v), z.string().email().optional())
    .optional(),
  language: z.enum(["en", "es"]),
  templateId: z.coerce.number().int().positive(),
  source: z.string().optional(),
  dateOfLoss: z
    .preprocess((v) => (v === "" || v === null || v === undefined ? null : v), z.string().optional())
    .nullable()
    .optional(),
  // Delivery defaults to inline signing: no immediate send, reminders armed.
  sendSms: z.boolean().optional().default(false),
  sendEmail: z.boolean().optional().default(false),
  reminderEnabled: z.boolean().optional().default(true),
});

export async function POST(req: Request) {
  if (!tokenOk(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  try {
    const { lead, signingRequest } = await createLeadAndSigningRequest(
      {
        clientName: d.clientName?.trim() || "",
        phone: d.phone?.trim() || null,
        email: d.email?.trim() || null,
        language: d.language,
        source: d.source || "intake-engine",
        templateId: d.templateId,
        dateOfLoss: d.dateOfLoss?.trim() || null,
        hipaaPrefill: null,
        sendSms: d.sendSms,
        sendEmail: d.sendEmail,
        reminderEnabled: d.reminderEnabled,
        assignedTo: null,
        allowNoDelivery: true,
      },
      { sub: "intake-engine", name: "Intake Engine" },
    );
    return NextResponse.json({
      ok: true,
      signingRequestId: signingRequest.id,
      leadId: lead.id,
      signingUrl: signingRequest.signingUrl,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
}
