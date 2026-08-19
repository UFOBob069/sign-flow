import { NextResponse } from "next/server";
import { getSignFlowStore } from "@/lib/db";
import { requireFirmSession } from "@/lib/auth/firm-session";
import { nowIso } from "@/lib/time";
import type { AppSettings } from "@/types/models";
import { isGmailWorkspaceDelegationConfigured } from "@/services/gmail-workspace-dwd";
import { DEFAULT_FIRM_ID } from "@/lib/firm-scope";
import { ensureDefaultFirm } from "@/lib/firms";

export async function POST() {
  let firmId: string;
  try {
    ({ firmId } = await requireFirmSession());
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const store = getSignFlowStore();
  const results: string[] = [];
  await ensureDefaultFirm();

  if (!(await store.getAppSettings(firmId))) {
    const settings: AppSettings = {
      id: firmId || DEFAULT_FIRM_ID,
      docusealConfigured: Boolean(process.env.DOCUSEAL_API_KEY),
      smsConfigured: Boolean(
        process.env.QUO_API_KEY && (process.env.QUO_FROM_NUMBER || process.env.QUO_PHONE_NUMBER_ID),
      ),
      dropboxConfigured: Boolean(process.env.DROPBOX_ACCESS_TOKEN),
      slackWebhookConfigured: Boolean(process.env.SLACK_WEBHOOK_URL),
      emailConfigured: Boolean(
        isGmailWorkspaceDelegationConfigured() ||
          process.env.SENDGRID_API_KEY ||
          (process.env.GOOGLE_REFRESH_TOKEN && process.env.GOOGLE_EMAIL_FROM),
      ),
      updatedAt: nowIso(),
    };
    await store.upsertAppSettings(settings);
    results.push("Seeded app settings");
  } else {
    results.push("Skipped app settings (already present)");
  }

  return NextResponse.json({ ok: true, results, store: store.isMock ? "mock" : "firestore" });
}
