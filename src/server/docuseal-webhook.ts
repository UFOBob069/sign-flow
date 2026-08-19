import { normalizeDocusealPublicUrl } from "@/lib/docuseal-public-url";
import { isActiveSigningRequest } from "@/lib/signing-request-active";
import { applyDocusealCompletionToRequest, markSigningViewedFromWebhook } from "@/server/signing-workflow";
import { getSignFlowStore } from "@/lib/db";
import { appendSigningEvent } from "@/services/signing-events";
import { documentFirmId } from "@/lib/firm-scope";
import { getFirmDocusealConnection } from "@/lib/firms";
import {
  extractCompletionUrlsFromWebhookData,
  extractDocusealSubmissionId,
  isDocusealCompletionEvent,
} from "@/lib/docuseal-submission";

function asObj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function webhookHeaderMatches(req: Request, secret: string): boolean {
  const a = req.headers.get("x-docuseal-secret")?.trim();
  const b = req.headers.get("x-webhook-secret")?.trim();
  return a === secret || b === secret;
}

export async function isDocusealWebhookAuthorized(req: Request, firmId?: string): Promise<boolean> {
  const secrets = firmId ? await getSignFlowStore().getFirmSecrets(firmId) : null;
  const secret = secrets?.docusealWebhookSecret?.trim() || process.env.DOCUSEAL_WEBHOOK_SECRET?.trim();
  if (!secret) return true;
  return webhookHeaderMatches(req, secret);
}

export async function processDocusealWebhookJson(payload: unknown, firmId?: string): Promise<void> {
  const root = asObj(payload);
  if (!root) {
    console.warn("[docuseal-webhook] ignored: payload is not an object");
    return;
  }

  const eventType = String(root.event_type ?? "");
  const data = asObj(root.data);
  if (!data) {
    console.warn("[docuseal-webhook] ignored: missing data", { eventType });
    return;
  }

  const submissionId = extractDocusealSubmissionId(root);
  if (submissionId == null) {
    console.warn("[docuseal-webhook] ignored: no submission id", { eventType });
    return;
  }

  if (eventType === "form.viewed" || eventType === "form.started") {
    await markSigningViewedFromWebhook(submissionId, firmId);
    return;
  }

  const store = getSignFlowStore();
  const req = await store.findSigningRequestByDocusealSubmissionId(submissionId, firmId);
  const conn = req ? await getFirmDocusealConnection(documentFirmId(req)) : undefined;

  if (isDocusealCompletionEvent(eventType)) {
    if (!req || !isActiveSigningRequest(req)) {
      console.warn("[docuseal-webhook] no active signing request for submission", { submissionId, eventType, firmId });
      return;
    }

    const { pdf, audit } = extractCompletionUrlsFromWebhookData(data);
    await applyDocusealCompletionToRequest({
      signingRequestId: req.id,
      signedPdfUrl: normalizeDocusealPublicUrl(pdf, undefined, conn),
      auditCertificateUrl: normalizeDocusealPublicUrl(audit, undefined, conn),
    });
    return;
  }

  if (eventType === "form.declined") {
    if (!req || !isActiveSigningRequest(req)) return;

    req.status = "failed";
    req.updatedAt = new Date().toISOString();
    await store.upsertSigningRequest(req);
    await appendSigningEvent({
      signingRequestId: req.id,
      leadId: req.leadId,
      type: "failed",
      metadata: { eventType, reason: "declined" },
      firmId: req.firmId,
    });
    return;
  }

  if (eventType === "submission.expired") {
    if (!req || !isActiveSigningRequest(req)) return;
    req.status = "expired";
    req.reminderEnabled = false;
    req.nextReminderAt = null;
    req.updatedAt = new Date().toISOString();
    await store.upsertSigningRequest(req);
    await appendSigningEvent({
      signingRequestId: req.id,
      leadId: req.leadId,
      type: "failed",
      metadata: { eventType },
      firmId: req.firmId,
    });
  }
}
