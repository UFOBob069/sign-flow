import { after } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSignFlowStore } from "@/lib/db";
import { isFirestoreNotProvisionedError } from "@/lib/db/firestore-errors";
import { requireFirmSession } from "@/lib/auth/firm-session";
import { belongsToFirm } from "@/lib/firm-scope";
import { mergeOutboundDelivery } from "@/lib/outbound-delivery";
import { normalizeSigningRequestForDisplay } from "@/lib/signing-request-active";
import { processDueReminders } from "@/server/reminder-processor";
import { createLeadAndSigningRequest } from "@/server/signing-workflow";
import type { HipaaFormPrefill } from "@/types/models";

const emptyToNull = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : v),
  z.string().nullable(),
);

const hipaaPrefillSchema = z.object({
  lastName: z.string().min(1),
  firstName: z.string().min(1),
  middleName: emptyToNull.optional(),
  otherName: emptyToNull.optional(),
  dateOfBirth: emptyToNull.optional(),
  address: emptyToNull.optional(),
  city: emptyToNull.optional(),
  state: emptyToNull.optional(),
  zipCode: emptyToNull.optional(),
  phone: emptyToNull.optional(),
  altPhone: emptyToNull.optional(),
  email: emptyToNull.optional(),
  legalAcknowledged: z.boolean(),
  allHealthAcknowledged: z.boolean(),
  isMinor: z.boolean(),
  nameAuthorizedRepForMinor: emptyToNull.optional(),
  minorRepParent: z.boolean(),
  minorRepGuardian: z.boolean(),
  minorRepOther: z.boolean(),
});

function normalizeHipaaPrefillFromApi(raw: z.infer<typeof hipaaPrefillSchema>): HipaaFormPrefill {
  return {
    lastName: raw.lastName,
    firstName: raw.firstName,
    middleName: raw.middleName ?? null,
    otherName: raw.otherName ?? null,
    dateOfBirth: raw.dateOfBirth ?? null,
    address: raw.address ?? null,
    city: raw.city ?? null,
    state: raw.state ?? null,
    zipCode: raw.zipCode ?? null,
    phone: raw.phone ?? null,
    altPhone: raw.altPhone ?? null,
    email: raw.email ?? null,
    legalAcknowledged: raw.legalAcknowledged,
    allHealthAcknowledged: raw.allHealthAcknowledged,
    isMinor: raw.isMinor,
    nameAuthorizedRepForMinor: raw.nameAuthorizedRepForMinor ?? null,
    minorRepParent: raw.minorRepParent,
    minorRepGuardian: raw.minorRepGuardian,
    minorRepOther: raw.minorRepOther,
  };
}

const postSchema = z.object({
  clientName: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z
    .preprocess((v) => (v === "" || v === null || v === undefined ? undefined : v), z.string().email().optional())
    .optional(),
  language: z.enum(["en", "es"]),
  templateId: z.coerce.number().int().positive(),
  sendSms: z.boolean(),
  sendEmail: z.boolean(),
  reminderEnabled: z.boolean(),
  dateOfLoss: z
    .preprocess((v) => (v === "" || v === null || v === undefined ? null : v), z.string().optional())
    .nullable()
    .optional(),
  hipaaPrefill: hipaaPrefillSchema.optional().nullable(),
  source: z.string().optional(),
  assignedTo: z.string().optional().nullable(),
});

export async function GET() {
  let firmId: string;
  try {
    ({ firmId } = await requireFirmSession());
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const store = getSignFlowStore();
  try {
    const [itemsRaw, appSettings] = await Promise.all([
      store.listSigningRequests(),
      store.getAppSettings(firmId),
    ]);
    const items = itemsRaw.filter((r) => belongsToFirm(r, firmId)).map(normalizeSigningRequestForDisplay);
    const leadIds = [...new Set(items.map((r) => r.leadId))];
    const leads = await store.getLeadsByIds(leadIds);
    const leadsById = Object.fromEntries(leads.map((l) => [l.id, l]));
    const outboundDelivery = mergeOutboundDelivery(appSettings);

    // Backup sweep when staff open the dashboard (primary schedule is Vercel Cron every 15 minutes).
    after(async () => {
      try {
        await processDueReminders();
      } catch {
        /* non-fatal; cron or next dashboard load can retry */
      }
    });

    return NextResponse.json({ items, leadsById, outboundDelivery, store: store.isMock ? "mock" : "firestore" });
  } catch (e) {
    if (isFirestoreNotProvisionedError(e)) {
      return NextResponse.json(
        {
          error: "Firestore returned NOT_FOUND for this project.",
          hint: "Create a Firestore database in the Firebase Console (same project as FIREBASE_PROJECT_ID), set FIRESTORE_DATABASE_ID if you use a non-default database, or set USE_MOCK_DB=true to use in-memory data locally.",
        },
        { status: 503 },
      );
    }
    throw e;
  }
}

export async function POST(req: Request) {
  let actor: { sub: string; name: string };
  let firmId: string;
  try {
    ({ user: actor, firmId } = await requireFirmSession());
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const phone = parsed.data.phone?.trim() || null;
  const email = parsed.data.email?.trim() || null;

  if (parsed.data.sendSms && !phone) {
    return NextResponse.json({ error: "Phone is required when SMS is selected." }, { status: 400 });
  }
  if (parsed.data.sendEmail && !email) {
    return NextResponse.json({ error: "Email is required when email delivery is selected." }, { status: 400 });
  }

  const appSettings = await getSignFlowStore().getAppSettings(firmId);
  const outbound = mergeOutboundDelivery(appSettings);
  if (parsed.data.sendSms && !outbound.signingSmsEnabled) {
    return NextResponse.json(
      { error: "SMS for signing requests is disabled in Admin → Messages." },
      { status: 400 },
    );
  }
  if (parsed.data.sendEmail && !outbound.signingEmailEnabled) {
    return NextResponse.json(
      { error: "Email for signing requests is disabled in Admin → Messages." },
      { status: 400 },
    );
  }

  try {
    const { lead, signingRequest, deliveryWarning } = await createLeadAndSigningRequest(
      {
        clientName: parsed.data.clientName?.trim() || "",
        phone,
        email,
        language: parsed.data.language,
        source: parsed.data.source ?? "dashboard",
        templateId: parsed.data.templateId,
        dateOfLoss: parsed.data.dateOfLoss?.trim() || null,
        hipaaPrefill: parsed.data.hipaaPrefill
          ? normalizeHipaaPrefillFromApi(parsed.data.hipaaPrefill)
          : null,
        sendSms: parsed.data.sendSms,
        sendEmail: parsed.data.sendEmail,
        reminderEnabled: parsed.data.reminderEnabled,
        assignedTo: parsed.data.assignedTo ?? null,
        firmId,
      },
      actor,
    );
    return NextResponse.json({
      item: normalizeSigningRequestForDisplay(signingRequest),
      lead,
      ...(deliveryWarning ? { warning: deliveryWarning } : {}),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
