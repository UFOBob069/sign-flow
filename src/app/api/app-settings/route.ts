import { NextResponse } from "next/server";
import { z } from "zod";
import { getSignFlowStore } from "@/lib/db";
import { requireFirmSession } from "@/lib/auth/firm-session";
import { nowIso } from "@/lib/time";
import type { AppSettings } from "@/types/models";
import { isGmailWorkspaceDelegationConfigured } from "@/services/gmail-workspace-dwd";
import { DEFAULT_COMMUNICATION_TEMPLATES } from "@/lib/messaging";
import { DEFAULT_REMINDER_SCHEDULE } from "@/lib/reminder-schedule";
import { DEFAULT_COMPLETION_NOTIFICATIONS } from "@/lib/completion-notifications";
import { DEFAULT_OUTBOUND_DELIVERY, mergeOutboundDelivery } from "@/lib/outbound-delivery";
import { getFirmDocusealConnection, getFirmQuoConnection } from "@/lib/firms";

const communicationTemplatesPatchSchema = z
  .object({
    firmName: z.string().min(1).optional(),
    firmLogoUrl: z.string().optional(),
    signingSmsTemplate: z.string().min(1).optional(),
    signingEmailSubjectTemplate: z.string().min(1).optional(),
    signingEmailBodyTemplate: z.string().min(1).optional(),
    emailHtmlFooterTemplate: z.string().min(1).optional(),
    reminderSmsTemplate: z.string().min(1).optional(),
    reminderEmailSubjectTemplate: z.string().min(1).optional(),
    reminderEmailBodyTemplate: z.string().min(1).optional(),
    signingSmsTemplateEs: z.string().min(1).optional(),
    signingEmailSubjectTemplateEs: z.string().min(1).optional(),
    signingEmailBodyTemplateEs: z.string().min(1).optional(),
    emailHtmlFooterTemplateEs: z.string().min(1).optional(),
    reminderSmsTemplateEs: z.string().min(1).optional(),
    reminderEmailSubjectTemplateEs: z.string().min(1).optional(),
    reminderEmailBodyTemplateEs: z.string().min(1).optional(),
  })
  .optional();

const reminderSchedulePatchSchema = z
  .object({
    firstReminderAfterSendMinutes: z.number().int().min(5).max(10080).optional(),
    secondReminderLocalHour: z.number().int().min(0).max(23).optional(),
    thirdReminderHoursAfterSecond: z.number().int().min(1).max(168).optional(),
    maxAutoReminders: z.number().int().min(1).max(10).optional(),
  })
  .optional();

const completionNotificationsPatchSchema = z
  .object({
    thankYouSmsEnabled: z.boolean().optional(),
    thankYouSmsTemplate: z.string().min(1).optional(),
    thankYouSmsTemplateEs: z.string().min(1).optional(),
    teamNotificationEmails: z.string().optional(),
    teamCompletedEmailSubjectTemplate: z.string().min(1).optional(),
    teamCompletedEmailBodyTemplate: z.string().min(1).optional(),
  })
  .optional();

const outboundDeliveryPatchSchema = z
  .object({
    signingSmsEnabled: z.boolean().optional(),
    signingEmailEnabled: z.boolean().optional(),
  })
  .optional();

const patchSchema = z.object({
  docusealConfigured: z.boolean().optional(),
  smsConfigured: z.boolean().optional(),
  dropboxConfigured: z.boolean().optional(),
  slackWebhookConfigured: z.boolean().optional(),
  emailConfigured: z.boolean().optional(),
  communicationTemplates: communicationTemplatesPatchSchema,
  reminderSchedule: reminderSchedulePatchSchema,
  completionNotifications: completionNotificationsPatchSchema,
  outboundDelivery: outboundDeliveryPatchSchema,
});

export async function GET() {
  let firmId: string;
  try {
    ({ firmId } = await requireFirmSession());
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const store = getSignFlowStore();
  const existing = await store.getAppSettings(firmId);
  const item = existing
    ? { ...existing, outboundDelivery: mergeOutboundDelivery(existing) }
    : null;
  const [docuseal, quo] = await Promise.all([getFirmDocusealConnection(firmId), getFirmQuoConnection(firmId)]);
  return NextResponse.json({
    item,
    env: {
      hasDocusealApiKey: Boolean(docuseal.apiKey?.trim() || process.env.DOCUSEAL_API_KEY),
      hasDocusealApiUrl: Boolean(docuseal.apiUrl?.trim() || process.env.DOCUSEAL_API_URL),
      hasDocusealWebhookSecret: Boolean(docuseal.webhookSecret?.trim() || process.env.DOCUSEAL_WEBHOOK_SECRET),
      hasDocusealAdminBase: Boolean(docuseal.adminBaseUrl?.trim() || process.env.DOCUSEAL_ADMIN_BASE_URL),
      hasFirebaseWebAuth:
        Boolean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY) &&
        Boolean(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN) &&
        Boolean(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) &&
        Boolean(process.env.NEXT_PUBLIC_FIREBASE_APP_ID),
      hasGoogleClientId: Boolean(process.env.GOOGLE_CLIENT_ID),
      hasGoogleClientSecret: Boolean(process.env.GOOGLE_CLIENT_SECRET),
      hasSignFlowSessionSecret: Boolean(process.env.SIGNFLOW_SESSION_SECRET),
      hasQuoApiKey: Boolean(quo?.apiKey?.trim() || process.env.QUO_API_KEY),
      hasQuoFromNumber: Boolean(
        quo?.fromNumber?.trim() ||
          quo?.phoneNumberId?.trim() ||
          process.env.QUO_FROM_NUMBER ||
          process.env.QUO_PHONE_NUMBER_ID,
      ),
      hasGmailWorkspaceDelegation: isGmailWorkspaceDelegationConfigured(),
      hasSendgrid: Boolean(process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM_EMAIL),
      hasGmailUserOAuth: Boolean(process.env.GOOGLE_REFRESH_TOKEN && process.env.GOOGLE_EMAIL_FROM),
      hasDropboxToken: Boolean(process.env.DROPBOX_ACCESS_TOKEN),
    },
  });
}

export async function PATCH(req: Request) {
  let firmId: string;
  try {
    ({ firmId } = await requireFirmSession());
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const store = getSignFlowStore();
  const existing =
    (await store.getAppSettings(firmId)) ??
    ({
      id: firmId,
      docusealConfigured: false,
      smsConfigured: false,
      dropboxConfigured: false,
      slackWebhookConfigured: false,
      emailConfigured: false,
      updatedAt: nowIso(),
    } satisfies AppSettings);

  const {
    communicationTemplates: ctPatch,
    reminderSchedule: rsPatch,
    completionNotifications: cnPatch,
    outboundDelivery: odPatch,
    ...flagPatches
  } = parsed.data;

  const updated: AppSettings = {
    ...existing,
    ...flagPatches,
    id: firmId,
    updatedAt: nowIso(),
  };

  if (ctPatch !== undefined) {
    updated.communicationTemplates = {
      ...DEFAULT_COMMUNICATION_TEMPLATES,
      ...(existing.communicationTemplates ?? {}),
      ...ctPatch,
    };
  }
  if (rsPatch !== undefined) {
    updated.reminderSchedule = {
      ...DEFAULT_REMINDER_SCHEDULE,
      ...(existing.reminderSchedule ?? {}),
      ...rsPatch,
    };
  }
  if (cnPatch !== undefined) {
    updated.completionNotifications = {
      ...DEFAULT_COMPLETION_NOTIFICATIONS,
      ...(existing.completionNotifications ?? {}),
      ...cnPatch,
    };
  }
  if (odPatch !== undefined) {
    updated.outboundDelivery = {
      ...DEFAULT_OUTBOUND_DELIVERY,
      ...(existing.outboundDelivery ?? {}),
      ...odPatch,
    };
  }
  await store.upsertAppSettings(updated);
  return NextResponse.json({
    item: { ...updated, outboundDelivery: mergeOutboundDelivery(updated) },
  });
}
