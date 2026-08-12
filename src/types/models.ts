/**
 * Firestore-aligned domain types for Sign Flow (Ramos James Law).
 * DocuSeal is the system of record for templates, signing sessions, and signed PDFs.
 * Firestore tracks lead workflow, signing request state, reminders, and communication history.
 */

export type SupportedLanguage = "en" | "es";

export type LeadStatus = "new" | "signing_sent" | "signed" | "archived" | "lost";

export type Lead = {
  id: string;
  clientName: string;
  phone: string | null;
  email: string | null;
  language: SupportedLanguage;
  source: string;
  createdAt: string;
  updatedAt: string;
  assignedTo: string | null;
  status: LeadStatus;
};

export type SigningStatus =
  | "draft"
  | "sent"
  | "viewed"
  | "completed"
  | "signed"
  | "expired"
  | "failed"
  | "cancelled";

export type DeliveryMethod = "sms" | "email";

export type SigningEventType =
  | "created"
  | "sms_sent"
  | "email_sent"
  | "viewed"
  | "signed"
  | "downloaded"
  | "dropbox_saved"
  | "slack_posted"
  | "reminder_sent"
  | "reminders_stopped"
  | "synced"
  | "cancelled"
  | "deleted"
  | "failed";

export type SigningFormKind = "contract" | "sar" | "hipaa" | "disbursement";

export type HipaaFormPrefill = {
  lastName: string;
  firstName: string;
  middleName: string | null;
  otherName: string | null;
  /** yyyy-MM-dd */
  dateOfBirth: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  phone: string | null;
  altPhone: string | null;
  email: string | null;
  legalAcknowledged: boolean;
  allHealthAcknowledged: boolean;
  isMinor: boolean;
  nameAuthorizedRepForMinor: string | null;
  minorRepParent: boolean;
  minorRepGuardian: boolean;
  minorRepOther: boolean;
};

export type SigningRequest = {
  id: string;
  leadId: string;
  clientName: string;
  phone: string | null;
  email: string | null;
  language: SupportedLanguage;
  /** DocuSeal template id (integer from DocuSeal API). */
  templateId: number;
  templateName: string;
  /** Date of loss (yyyy-MM-dd) for contract pre-fill; used on RJL English/Spanish 2026 templates. */
  dateOfLoss: string | null;
  /** contract | sar | hipaa — derived from template when sent. */
  formKind: SigningFormKind | null;
  /** Stored HIPAA intake fields when formKind is hipaa. */
  hipaaPrefill: HipaaFormPrefill | null;
  docusealSubmissionId: number | null;
  docusealSubmitterId: number | null;
  /** Primary signing link (DocuSeal embed / slug URL). */
  signingUrl: string | null;
  status: SigningStatus;
  sentViaSms: boolean;
  sentViaEmail: boolean;
  reminderEnabled: boolean;
  reminderCount: number;
  nextReminderAt: string | null;
  lastReminderAt: string | null;
  completedAt: string | null;
  /** DocuSeal-hosted URLs (metadata only; not binary in Firestore). */
  signedPdfUrl: string | null;
  auditCertificateUrl: string | null;
  dropboxFolderPath: string | null;
  dropboxSignedPdfPath: string | null;
  dropboxAuditPath: string | null;
  /** Optional Dropbox preview/share links for staff. */
  dropboxSignedPdfLink: string | null;
  dropboxAuditLink: string | null;
  /** After automated reminder cadence ends, surface in “needs follow-up” filters. */
  manualFollowUp: boolean;
  sentAt: string | null;
  lastActivityAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Legacy soft-hide; prefer `status: "cancelled"`. Still honored when reading old rows. */
  deletedAt?: string | null;
};

export type SigningEvent = {
  id: string;
  signingRequestId: string;
  leadId: string;
  type: SigningEventType;
  timestamp: string;
  metadata: Record<string, unknown>;
};

/** DocuSeal template row (from API, not persisted in Firestore). */
export type DocuSealTemplateSummary = {
  id: number;
  name: string;
  slug: string | null;
  archivedAt: string | null;
  updatedAt: string | null;
  folderName: string | null;
  adminUrl: string | null;
};

/** Placeholders: `{{clientName}}`, `{{url}}`, `{{firm}}` — `{{firm}}` uses `firmName`. */
export type CommunicationTemplates = {
  /** Value substituted for `{{firm}}` in all templates (SMS, email, HTML wordmark). */
  firmName: string;
  /** Optional absolute URL to your logo image (shown in HTML emails). If empty, falls back to `/rj-logo.svg` when `SIGNFLOW_EMAIL_PUBLIC_ORIGIN` is set. */
  firmLogoUrl: string;
  signingSmsTemplate: string;
  signingEmailSubjectTemplate: string;
  signingEmailBodyTemplate: string;
  /** Plain text shown in the HTML email footer (escaped). Supports {{clientName}}, {{url}}, {{firm}}. */
  emailHtmlFooterTemplate: string;
  reminderSmsTemplate: string;
  reminderEmailSubjectTemplate: string;
  reminderEmailBodyTemplate: string;
  /** Used when signing request `language` is `es` (falls back to English if blank). */
  signingSmsTemplateEs: string;
  signingEmailSubjectTemplateEs: string;
  signingEmailBodyTemplateEs: string;
  emailHtmlFooterTemplateEs: string;
  reminderSmsTemplateEs: string;
  reminderEmailSubjectTemplateEs: string;
  reminderEmailBodyTemplateEs: string;
};

/** Sent when DocuSeal marks a submission completed. Editable in Admin → Messages. */
export type CompletionNotificationSettings = {
  thankYouSmsEnabled: boolean;
  thankYouSmsTemplate: string;
  /** Used when request `language` is `es` (falls back to English if blank). */
  thankYouSmsTemplateEs: string;
  /** Comma- or newline-separated team inboxes notified on completion. */
  teamNotificationEmails: string;
  teamCompletedEmailSubjectTemplate: string;
  teamCompletedEmailBodyTemplate: string;
};

/** Client-facing signing link delivery (initial send, resend, reminders). Not completion/team notifications. */
export type OutboundDeliverySettings = {
  signingSmsEnabled: boolean;
  signingEmailEnabled: boolean;
};

/** Drives `computeNextReminderAt` when present on `AppSettings`. */
export type ReminderScheduleSettings = {
  firstReminderAfterSendMinutes: number;
  /** Second reminder lands on the calendar day after (first send + first offset), at this hour US Central (7–20). */
  secondReminderLocalHour: number;
  thirdReminderHoursAfterSecond: number;
  maxAutoReminders: number;
};

export type AppSettings = {
  id: "default";
  docusealConfigured: boolean;
  smsConfigured: boolean;
  dropboxConfigured: boolean;
  slackWebhookConfigured: boolean;
  emailConfigured: boolean;
  updatedAt: string;
  /** Editable from Admin → Messages & reminders; merged with code defaults when absent. */
  communicationTemplates?: CommunicationTemplates | null;
  reminderSchedule?: ReminderScheduleSettings | null;
  completionNotifications?: CompletionNotificationSettings | null;
  /** Admin toggles for SMS/email when sending signing requests to clients. */
  outboundDelivery?: OutboundDeliverySettings | null;
};
