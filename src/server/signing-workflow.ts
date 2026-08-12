import { clampToReminderSendWindow, computeNextReminderAt, isWithinReminderSendWindow } from "@/lib/reminder-cadence";
import { mergeReminderSchedule } from "@/lib/reminder-schedule";
import {
  mergeCompletionNotifications,
  parseEmailList,
  teamCompletedEmailFromSettings,
  thankYouSmsFromSettings,
} from "@/lib/completion-notifications";
import { mergeOutboundDelivery } from "@/lib/outbound-delivery";
import {
  extractSubmissionDocumentUrls,
  submissionIsCompleted,
} from "@/lib/docuseal-submission";
import {
  reminderEmailFromSettings,
  reminderSmsFromSettings,
  signingEmailFromSettings,
  signingSmsFromSettings,
} from "@/lib/messaging";
import { newId, nowIso } from "@/lib/time";
import { getSignFlowStore } from "@/lib/db";
import {
  buildDocusealPrefillFields,
  detectSigningFormKind,
  isRjlHipaaTemplate,
  isOneTimeTemplate,
  resolveClientNameForSigningRequest,
  templateRequiresDateOfLoss,
  validateHipaaPrefill,
} from "@/lib/docuseal-prefill";
import { normalizeDocusealPublicUrl, normalizeSigningRequestDocusealUrls } from "@/lib/docuseal-public-url";
import { createSubmission, downloadUrlToBuffer, getSubmission, getTemplate, archiveTemplate } from "@/services/docuseal-client";
import { uploadDropboxFile, getDropboxTemporaryLink } from "@/services/dropbox-client";
import type { EmailAttachment } from "@/lib/mime-rfc822";
import { sendTransactionalEmail } from "@/services/email-delivery";
import { sendSms } from "@/services/quo-service";
import { appendSigningEvent } from "@/services/signing-events";
import { isActiveSigningRequest, isCancelledSigningRequest } from "@/lib/signing-request-active";
import { phonesMatch } from "@/lib/phone";
import type { HipaaFormPrefill, Lead, LeadStatus, SigningRequest, SupportedLanguage } from "@/types/models";

export type CreateSigningRequestInput = {
  clientName: string;
  phone: string | null;
  email: string | null;
  language: SupportedLanguage;
  source: string;
  templateId: number;
  /** yyyy-MM-dd; required for templates that pre-fill date-of-loss fields. */
  dateOfLoss: string | null;
  hipaaPrefill?: HipaaFormPrefill | null;
  sendSms: boolean;
  sendEmail: boolean;
  reminderEnabled: boolean;
  assignedTo: string | null;
  /**
   * Allow creating the request without any immediate SMS/email delivery — used
   * when the signer will sign inline (e.g. embedded during an intake journey)
   * and only the reminder schedule should follow up if they don't finish.
   */
  allowNoDelivery?: boolean;
};

export async function createLeadAndSigningRequest(
  input: CreateSigningRequestInput,
  actor: { sub: string; name: string },
): Promise<{ lead: Lead; signingRequest: SigningRequest }> {
  const store = getSignFlowStore();
  const appSettings = await store.getAppSettings();
  const reminderSchedule = mergeReminderSchedule(appSettings);
  const now = nowIso();
  const leadId = newId("lead");
  const reqId = newId("sig");

  const template = await getTemplate(input.templateId);
  const formKind = detectSigningFormKind(template.name);

  if (templateRequiresDateOfLoss(template.name) && !input.dateOfLoss?.trim()) {
    throw new Error("Date of loss is required for this contract template.");
  }

  if (isRjlHipaaTemplate(template.name)) {
    if (!input.hipaaPrefill) throw new Error("HIPAA form data is required.");
    validateHipaaPrefill(input.hipaaPrefill);
  }

  const clientName = resolveClientNameForSigningRequest(
    template.name,
    input.clientName,
    input.hipaaPrefill,
  );
  const language: SupportedLanguage =
    formKind === "contract" ? input.language : "en";

  const hipaaPrefill = isRjlHipaaTemplate(template.name) ? (input.hipaaPrefill ?? null) : null;

  const lead: Lead = {
    id: leadId,
    clientName,
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    language,
    source: input.source || "dashboard",
    createdAt: now,
    updatedAt: now,
    assignedTo: input.assignedTo,
    status: "new" satisfies LeadStatus,
  };

  const sentAt = new Date();
  const prefillFields = buildDocusealPrefillFields({
    templateName: template.name,
    clientName,
    dateOfLoss: input.dateOfLoss?.trim() || null,
    hipaaPrefill,
    sentAt,
  });

  const submitters = await createSubmission({
    templateId: input.templateId,
    clientName,
    email: input.email,
    phone: input.phone,
    sendDocusealEmail: false,
    sendDocusealSms: false,
    prefillFields,
  });

  const primary = submitters[0];
  if (!primary?.submission_id) throw new Error("DocuSeal did not return a submission id.");

  const signingUrl = normalizeDocusealPublicUrl(primary.embed_src ?? null, primary.slug);
  const sentAtIso = nowIso();
  const sentDate = new Date(sentAtIso);

  const signingRequest: SigningRequest = {
    id: reqId,
    leadId,
    clientName: lead.clientName,
    phone: lead.phone,
    email: lead.email,
    language,
    templateId: input.templateId,
    templateName: template.name,
    dateOfLoss: input.dateOfLoss?.trim() || null,
    formKind,
    hipaaPrefill,
    docusealSubmissionId: primary.submission_id,
    docusealSubmitterId: primary.id ?? null,
    signingUrl,
    status: "sent",
    sentViaSms: false,
    sentViaEmail: false,
    reminderEnabled: input.reminderEnabled,
    reminderCount: 0,
    nextReminderAt: input.reminderEnabled
      ? (computeNextReminderAt({ sentAt: sentDate, reminderCount: 0 }, reminderSchedule)?.toISOString() ?? null)
      : null,
    lastReminderAt: null,
    completedAt: null,
    signedPdfUrl: null,
    auditCertificateUrl: null,
    dropboxFolderPath: null,
    dropboxSignedPdfPath: null,
    dropboxAuditPath: null,
    dropboxSignedPdfLink: null,
    dropboxAuditLink: null,
    manualFollowUp: false,
    sentAt: sentAtIso,
    lastActivityAt: sentAtIso,
    createdAt: now,
    updatedAt: now,
  };

  if (!signingUrl) throw new Error("DocuSeal did not return a signing URL.");

  const outbound = mergeOutboundDelivery(appSettings);
  if (input.sendSms && !outbound.signingSmsEnabled) {
    throw new Error("SMS for signing requests is turned off in Admin → Messages (Signing request delivery).");
  }
  if (input.sendEmail && !outbound.signingEmailEnabled) {
    throw new Error("Email for signing requests is turned off in Admin → Messages (Signing request delivery).");
  }

  await store.upsertLead(lead);
  await store.upsertSigningRequest(signingRequest);

  await appendSigningEvent({
    signingRequestId: reqId,
    leadId,
    type: "created",
    metadata: { actor: actor.sub, templateId: input.templateId },
  });

  if (input.sendSms && lead.phone) {
    await sendSms(
      lead.phone,
      signingSmsFromSettings(appSettings, lead.clientName, signingUrl, language),
    );
    signingRequest.sentViaSms = true;
    await appendSigningEvent({ signingRequestId: reqId, leadId, type: "sms_sent", metadata: {} });
  }

  if (input.sendEmail && lead.email) {
    const { subject, text, html } = signingEmailFromSettings(
      appSettings,
      lead.clientName,
      signingUrl,
      language,
    );
    const mail = await sendTransactionalEmail({ to: lead.email, subject, textBody: text, htmlBody: html });
    if (!mail.ok) throw new Error(mail.error);
    signingRequest.sentViaEmail = true;
    await appendSigningEvent({ signingRequestId: reqId, leadId, type: "email_sent", metadata: {} });
  }

  if (!input.allowNoDelivery && !signingRequest.sentViaSms && !signingRequest.sentViaEmail) {
    throw new Error("Select at least one delivery method (SMS or email).");
  }

  lead.status = "signing_sent";
  lead.updatedAt = nowIso();
  signingRequest.updatedAt = nowIso();
  await store.upsertLead(lead);
  await store.upsertSigningRequest(signingRequest);

  if (isOneTimeTemplate(template.name)) {
    try {
      await archiveTemplate(input.templateId);
      await appendSigningEvent({
        signingRequestId: reqId,
        leadId,
        type: "synced",
        metadata: { action: "archived_docuseal_template", templateId: input.templateId },
      });
    } catch (e) {
      await appendSigningEvent({
        signingRequestId: reqId,
        leadId,
        type: "failed",
        metadata: { step: "archive_onetime_template", templateId: input.templateId, error: String(e) },
      });
    }
  }

  return { lead, signingRequest };
}

export async function cancelSigningRequest(
  signingRequestId: string,
  actor: { sub: string },
): Promise<SigningRequest> {
  const store = getSignFlowStore();
  const req = await store.getSigningRequest(signingRequestId);
  if (!req) throw new Error("Not found");
  if (req.status === "completed") throw new Error("Completed requests cannot be cancelled.");
  if (isCancelledSigningRequest(req)) throw new Error("This signing request is already cancelled.");

  const t = nowIso();
  req.status = "cancelled";
  req.deletedAt = null;
  req.reminderEnabled = false;
  req.nextReminderAt = null;
  req.manualFollowUp = false;
  req.lastActivityAt = t;
  req.updatedAt = t;
  await store.upsertSigningRequest(req);

  await appendSigningEvent({
    signingRequestId: req.id,
    leadId: req.leadId,
    type: "cancelled",
    metadata: { actor: actor.sub },
  });

  return req;
}

export type StopRemindersSource = "client_sms_stop" | "staff";

/**
 * Turn off automated reminders only. Signing link / request stays active
 * so the client can still open and sign.
 */
export async function stopRemindersForRequest(
  signingRequestId: string,
  source: StopRemindersSource,
  meta?: { actor?: string; fromPhone?: string; messageBody?: string },
): Promise<SigningRequest> {
  const store = getSignFlowStore();
  const req = await store.getSigningRequest(signingRequestId);
  if (!req) throw new Error("Not found");
  if (isCancelledSigningRequest(req)) throw new Error("This signing request is cancelled.");
  if (req.status === "completed" || req.status === "signed") {
    throw new Error("Reminders are already finished for a completed request.");
  }

  if (!req.reminderEnabled && !req.nextReminderAt) {
    return req;
  }

  const t = nowIso();
  req.reminderEnabled = false;
  req.nextReminderAt = null;
  req.lastActivityAt = t;
  req.updatedAt = t;
  await store.upsertSigningRequest(req);

  await appendSigningEvent({
    signingRequestId: req.id,
    leadId: req.leadId,
    type: "reminders_stopped",
    metadata: {
      source,
      actor: meta?.actor ?? null,
      fromPhone: meta?.fromPhone ?? null,
      messageBody: meta?.messageBody ?? null,
      signingLinkRemainsActive: true,
    },
  });

  return req;
}

/** Match inbound STOP (or staff) phone to active requests still receiving reminders. */
export async function stopRemindersByPhone(
  fromPhone: string,
  source: StopRemindersSource,
  meta?: { messageBody?: string },
): Promise<SigningRequest[]> {
  const store = getSignFlowStore();
  const items = await store.listSigningRequests();
  const targets = items.filter(
    (r) =>
      isActiveSigningRequest(r) &&
      r.reminderEnabled &&
      (r.status === "sent" || r.status === "viewed" || r.status === "draft") &&
      phonesMatch(r.phone, fromPhone),
  );

  const updated: SigningRequest[] = [];
  for (const r of targets) {
    updated.push(
      await stopRemindersForRequest(r.id, source, {
        fromPhone,
        messageBody: meta?.messageBody,
      }),
    );
  }
  return updated;
}

export async function purgeSigningRequest(signingRequestId: string): Promise<void> {
  const store = getSignFlowStore();
  const req = await store.getSigningRequest(signingRequestId);
  if (!req) throw new Error("Not found");

  const leadId = req.leadId;
  await store.purgeSigningRequest(signingRequestId);

  const siblings = (await store.listSigningRequests()).filter(
    (r) => r.leadId === leadId && r.id !== signingRequestId && !isCancelledSigningRequest(r),
  );
  const lead = await store.getLead(leadId);
  if (lead && siblings.length === 0 && lead.status !== "signed") {
    lead.status = "archived";
    lead.updatedAt = nowIso();
    await store.upsertLead(lead);
  }
}

export async function repairStoredDocusealUrls(req: SigningRequest): Promise<SigningRequest> {
  const fixed = normalizeSigningRequestDocusealUrls(req);
  if (
    fixed.signingUrl !== req.signingUrl ||
    fixed.signedPdfUrl !== req.signedPdfUrl ||
    fixed.auditCertificateUrl !== req.auditCertificateUrl
  ) {
    fixed.updatedAt = nowIso();
    await getSignFlowStore().upsertSigningRequest(fixed);
  }
  return fixed;
}

export async function resendSigningNotifications(
  signingRequestId: string,
  opts: { sms?: boolean; email?: boolean },
): Promise<SigningRequest> {
  const store = getSignFlowStore();
  const appSettings = await store.getAppSettings();
  const outbound = mergeOutboundDelivery(appSettings);
  const raw = await store.getSigningRequest(signingRequestId);
  const req = raw ? await repairStoredDocusealUrls(raw) : null;
  if (!req?.signingUrl) throw new Error("Signing request not found or missing URL.");
  if (!isActiveSigningRequest(req)) throw new Error("This signing request was cancelled.");

  if (opts.sms && !outbound.signingSmsEnabled) {
    throw new Error("SMS for signing requests is turned off in Admin → Messages.");
  }
  if (opts.email && !outbound.signingEmailEnabled) {
    throw new Error("Email for signing requests is turned off in Admin → Messages.");
  }

  if (opts.sms) {
    if (!req.phone?.trim()) throw new Error("No phone number on file for this request; add a phone number to resend SMS.");
    await sendSms(
      req.phone,
      signingSmsFromSettings(appSettings, req.clientName, req.signingUrl, req.language),
    );
    await appendSigningEvent({ signingRequestId, leadId: req.leadId, type: "sms_sent", metadata: { resend: true } });
  }
  if (opts.email) {
    if (!req.email?.trim()) throw new Error("No email address on file for this request; add an email to resend email.");
    const { subject, text, html } = signingEmailFromSettings(
      appSettings,
      req.clientName,
      req.signingUrl,
      req.language,
    );
    const mail = await sendTransactionalEmail({ to: req.email, subject, textBody: text, htmlBody: html });
    if (!mail.ok) throw new Error(mail.error);
    await appendSigningEvent({ signingRequestId, leadId: req.leadId, type: "email_sent", metadata: { resend: true } });
  }

  req.updatedAt = nowIso();
  req.lastActivityAt = nowIso();
  await store.upsertSigningRequest(req);
  return req;
}

export async function syncSignedArtifactsToDropbox(signingRequestId: string): Promise<SigningRequest> {
  const store = getSignFlowStore();
  const req = await store.getSigningRequest(signingRequestId);
  if (!req) throw new Error("Not found");
  if (!isActiveSigningRequest(req)) throw new Error("This signing request was cancelled.");
  if (!req.signedPdfUrl && !req.auditCertificateUrl) {
    throw new Error("No DocuSeal document URLs on file yet; wait for completion or refresh from DocuSeal.");
  }

  const folder = `/SignFlow/${req.leadId}/${req.id}`;
  let signedPath: string | null = null;
  let auditPath: string | null = null;
  let signedLink: string | null = null;
  let auditLink: string | null = null;

  if (req.signedPdfUrl) {
    const buf = await downloadUrlToBuffer(req.signedPdfUrl);
    const up = await uploadDropboxFile({ dropboxPath: `${folder}/signed.pdf`, bytes: buf });
    signedPath = up.path_display;
    try {
      signedLink = await getDropboxTemporaryLink(signedPath);
    } catch {
      signedLink = null;
    }
  }
  if (req.auditCertificateUrl) {
    const buf = await downloadUrlToBuffer(req.auditCertificateUrl);
    const up = await uploadDropboxFile({ dropboxPath: `${folder}/audit-certificate.pdf`, bytes: buf });
    auditPath = up.path_display;
    try {
      auditLink = await getDropboxTemporaryLink(auditPath);
    } catch {
      auditLink = null;
    }
  }

  req.dropboxFolderPath = folder;
  req.dropboxSignedPdfPath = signedPath;
  req.dropboxAuditPath = auditPath;
  req.dropboxSignedPdfLink = signedLink;
  req.dropboxAuditLink = auditLink;
  req.updatedAt = nowIso();
  await store.upsertSigningRequest(req);
  await appendSigningEvent({
    signingRequestId,
    leadId: req.leadId,
    type: "dropbox_saved",
    metadata: { folder, signedPath, auditPath },
  });
  return req;
}

export async function syncSigningRequestFromDocuseal(signingRequestId: string): Promise<SigningRequest> {
  const store = getSignFlowStore();
  const req = await store.getSigningRequest(signingRequestId);
  if (!req) throw new Error("Not found");
  if (!isActiveSigningRequest(req)) throw new Error("This signing request was cancelled.");
  if (req.docusealSubmissionId == null) throw new Error("No DocuSeal submission id on this request.");

  const raw = await getSubmission(req.docusealSubmissionId);
  if (!submissionIsCompleted(raw)) {
    throw new Error("DocuSeal submission is not completed yet.");
  }

  const { pdf, audit } = extractSubmissionDocumentUrls(raw);
  await applyDocusealCompletionToRequest({
    signingRequestId: req.id,
    signedPdfUrl: normalizeDocusealPublicUrl(pdf),
    auditCertificateUrl: normalizeDocusealPublicUrl(audit),
    source: "sync",
  });

  await appendSigningEvent({
    signingRequestId: req.id,
    leadId: req.leadId,
    type: "synced",
    metadata: { source: "docuseal" },
  });

  const updated = await store.getSigningRequest(signingRequestId);
  if (!updated) throw new Error("Not found");
  return updated;
}

export async function applyDocusealCompletionToRequest(input: {
  signingRequestId: string;
  signedPdfUrl: string | null;
  auditCertificateUrl: string | null;
  source?: "docuseal" | "sync";
}): Promise<void> {
  const store = getSignFlowStore();
  const req = await store.getSigningRequest(input.signingRequestId);
  if (!req || !isActiveSigningRequest(req)) return;

  const pdf = input.signedPdfUrl ?? null;
  const audit = input.auditCertificateUrl ?? null;

  if (req.status === "completed") {
    let changed = false;
    if (pdf && !req.signedPdfUrl) {
      req.signedPdfUrl = pdf;
      changed = true;
    }
    if (audit && !req.auditCertificateUrl) {
      req.auditCertificateUrl = audit;
      changed = true;
    }
    if (changed) {
      req.updatedAt = nowIso();
      await store.upsertSigningRequest(req);
    }
    return;
  }

  const t = nowIso();
  req.status = "completed";
  req.completedAt = t;
  req.signedPdfUrl = pdf ?? req.signedPdfUrl;
  req.auditCertificateUrl = audit ?? req.auditCertificateUrl;
  req.reminderEnabled = false;
  req.nextReminderAt = null;
  req.manualFollowUp = false;
  req.lastActivityAt = t;
  req.updatedAt = t;
  await store.upsertSigningRequest(req);

  const lead = await store.getLead(req.leadId);
  if (lead) {
    lead.status = "signed";
    lead.updatedAt = t;
    await store.upsertLead(lead);
  }

  await appendSigningEvent({
    signingRequestId: req.id,
    leadId: req.leadId,
    type: "signed",
    metadata: { source: input.source ?? "docuseal" },
  });

  const appSettings = await store.getAppSettings();
  const completionSettings = mergeCompletionNotifications(appSettings);
  const documentUrl = req.signedPdfUrl ?? req.signingUrl ?? "";

  if (completionSettings.thankYouSmsEnabled && req.phone?.trim()) {
    try {
      await sendSms(req.phone, thankYouSmsFromSettings(appSettings, req.clientName, req.language));
      await appendSigningEvent({
        signingRequestId: req.id,
        leadId: req.leadId,
        type: "sms_sent",
        metadata: { kind: "thank_you" },
      });
    } catch (e) {
      await appendSigningEvent({
        signingRequestId: req.id,
        leadId: req.leadId,
        type: "failed",
        metadata: { step: "thank_you_sms", error: String(e) },
      });
    }
  }

  const teamEmails = parseEmailList(completionSettings.teamNotificationEmails);
  if (teamEmails.length > 0) {
    const base = req.clientName.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-") || "signed";
    const attachments: EmailAttachment[] = [];

    if (req.signedPdfUrl) {
      try {
        const pdfBytes = await downloadUrlToBuffer(req.signedPdfUrl);
        attachments.push({ filename: `${base}-signed.pdf`, content: pdfBytes, mimeType: "application/pdf" });
      } catch (e) {
        await appendSigningEvent({
          signingRequestId: req.id,
          leadId: req.leadId,
          type: "failed",
          metadata: { step: "team_completed_pdf", error: String(e) },
        });
      }
    }

    if (req.auditCertificateUrl) {
      try {
        const auditBytes = await downloadUrlToBuffer(req.auditCertificateUrl);
        attachments.push({ filename: `${base}-audit-log.pdf`, content: auditBytes, mimeType: "application/pdf" });
      } catch (e) {
        await appendSigningEvent({
          signingRequestId: req.id,
          leadId: req.leadId,
          type: "failed",
          metadata: { step: "team_completed_audit", error: String(e) },
        });
      }
    }

    const { subject, text } = teamCompletedEmailFromSettings(appSettings, {
      clientName: req.clientName,
      templateName: req.templateName,
      documentUrl: documentUrl || "(see attached PDF or check DocuSeal)",
    });

    const sentTo: string[] = [];
    for (const email of teamEmails) {
      try {
        const mail = await sendTransactionalEmail({
          to: email,
          subject,
          textBody: text,
          attachments: attachments.length ? attachments : undefined,
        });
        if (!mail.ok) throw new Error(mail.error);
        sentTo.push(email);
        await appendSigningEvent({
          signingRequestId: req.id,
          leadId: req.leadId,
          type: "email_sent",
          metadata: {
            kind: "team_completed",
            to: email,
            attachedPdf: attachments.some((a) => a.filename.endsWith("-signed.pdf")),
            attachedAudit: attachments.some((a) => a.filename.endsWith("-audit-log.pdf")),
          },
        });
      } catch (e) {
        await appendSigningEvent({
          signingRequestId: req.id,
          leadId: req.leadId,
          type: "failed",
          metadata: { step: "team_completed_email", to: email, error: String(e) },
        });
      }
    }

    if (sentTo.length === 0 && teamEmails.length > 0) {
      await appendSigningEvent({
        signingRequestId: req.id,
        leadId: req.leadId,
        type: "failed",
        metadata: {
          step: "team_completed_email",
          to: teamEmails.join(", "),
          error: "All team completion emails failed.",
        },
      });
    }
  }

  if (process.env.DROPBOX_ACCESS_TOKEN) {
    try {
      await syncSignedArtifactsToDropbox(req.id);
      await appendSigningEvent({ signingRequestId: req.id, leadId: req.leadId, type: "downloaded", metadata: {} });
    } catch (e) {
      await appendSigningEvent({
        signingRequestId: req.id,
        leadId: req.leadId,
        type: "failed",
        metadata: { step: "dropbox", error: String(e) },
      });
    }
  }
}

export async function markSigningViewedFromWebhook(submissionId: number): Promise<void> {
  const store = getSignFlowStore();
  const req = await store.findSigningRequestByDocusealSubmissionId(submissionId);
  if (!req || !isActiveSigningRequest(req)) return;
  if (req.status === "viewed" || req.status === "completed" || req.status === "signed") return;
  if (req.status === "sent") {
    req.status = "viewed";
    req.lastActivityAt = nowIso();
    req.updatedAt = nowIso();
    await store.upsertSigningRequest(req);
    await appendSigningEvent({ signingRequestId: req.id, leadId: req.leadId, type: "viewed", metadata: { submissionId } });
  }
}

/** `"deferred"` = due but outside 7 AM–8 PM US Central; nextReminderAt was pushed to the window. */
export async function runReminderForRequest(
  req: SigningRequest,
): Promise<SigningRequest | "deferred" | null> {
  req = await repairStoredDocusealUrls(req);
  if (!isActiveSigningRequest(req) || !req.reminderEnabled || !req.signingUrl) return null;
  if (
    req.status === "completed" ||
    req.status === "signed" ||
    req.status === "expired" ||
    req.status === "failed" ||
    req.status === "cancelled"
  ) {
    return null;
  }
  const store = getSignFlowStore();
  const appSettings = await store.getAppSettings();
  const outbound = mergeOutboundDelivery(appSettings);
  const reminderSchedule = mergeReminderSchedule(appSettings);
  if (req.reminderCount >= reminderSchedule.maxAutoReminders) {
    req.manualFollowUp = true;
    req.nextReminderAt = null;
    req.updatedAt = nowIso();
    await store.upsertSigningRequest(req);
    return req;
  }
  if (!req.sentAt) return null;
  const next = req.nextReminderAt ? new Date(req.nextReminderAt) : null;
  if (!next || next.getTime() > Date.now()) return null;

  // Never text/email clients overnight — hold until the next 7 AM–8 PM US Central window.
  if (!isWithinReminderSendWindow(new Date())) {
    const reopen = clampToReminderSendWindow(new Date());
    req.nextReminderAt = reopen.toISOString();
    req.updatedAt = nowIso();
    await store.upsertSigningRequest(req);
    return "deferred";
  }

  const sentAt = new Date(req.sentAt);
  let smsSent = false;
  let emailSent = false;

  // Which channels to remind on. Normally we follow up on the channel the
  // request was originally delivered on. Intake/inline-signing requests are
  // created with no initial send (sentViaSms/sentViaEmail both false) but with
  // reminders enabled — the client got the signing link inline and just didn't
  // finish. For those, fall back to every channel the client can be reached on,
  // so the 1→2→3 reminder cadence actually runs instead of silently no-op-ing.
  const hadInitialDelivery = req.sentViaSms || req.sentViaEmail;
  const remindViaSms =
    Boolean(req.phone?.trim()) && outbound.signingSmsEnabled && (req.sentViaSms || !hadInitialDelivery);
  const remindViaEmail =
    Boolean(req.email) && outbound.signingEmailEnabled && (req.sentViaEmail || !hadInitialDelivery);

  if (remindViaSms && req.phone) {
    try {
      await sendSms(
        req.phone,
        reminderSmsFromSettings(appSettings, req.clientName, req.signingUrl, req.language),
      );
      smsSent = true;
      await appendSigningEvent({
        signingRequestId: req.id,
        leadId: req.leadId,
        type: "sms_sent",
        metadata: { kind: "reminder" },
      });
    } catch (e) {
      await appendSigningEvent({
        signingRequestId: req.id,
        leadId: req.leadId,
        type: "failed",
        metadata: { step: "reminder_sms", error: String(e) },
      });
    }
  }

  if (remindViaEmail && req.email) {
    const { subject, text, html } = reminderEmailFromSettings(
      appSettings,
      req.clientName,
      req.signingUrl,
      req.language,
    );
    const mail = await sendTransactionalEmail({ to: req.email, subject, textBody: text, htmlBody: html });
    if (!mail.ok) {
      await appendSigningEvent({
        signingRequestId: req.id,
        leadId: req.leadId,
        type: "failed",
        metadata: { step: "reminder_email", error: mail.error },
      });
    } else {
      emailSent = true;
      await appendSigningEvent({
        signingRequestId: req.id,
        leadId: req.leadId,
        type: "email_sent",
        metadata: { kind: "reminder" },
      });
    }
  }

  if (!smsSent && !emailSent) {
    return null;
  }

  req.reminderCount += 1;
  req.lastReminderAt = nowIso();
  req.lastActivityAt = req.lastReminderAt;
  const nextSlot = computeNextReminderAt({ sentAt, reminderCount: req.reminderCount }, reminderSchedule);
  req.nextReminderAt = nextSlot ? nextSlot.toISOString() : null;
  if (req.reminderCount >= reminderSchedule.maxAutoReminders) {
    req.manualFollowUp = true;
    req.nextReminderAt = null;
  }
  req.updatedAt = nowIso();
  await store.upsertSigningRequest(req);
  await appendSigningEvent({
    signingRequestId: req.id,
    leadId: req.leadId,
    type: "reminder_sent",
    metadata: { count: req.reminderCount, sms: smsSent, email: emailSent },
  });
  return req;
}
