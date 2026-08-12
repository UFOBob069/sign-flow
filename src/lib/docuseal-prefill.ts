import {
  formatSignflowMonthLong,
  formatSignflowMonthSpanish,
  formatSignflowMonthYear,
  getSignflowCalendarParts,
  parseIsoDateOnly,
} from "@/lib/signflow-timezone";
import {
  buildHipaaDocusealPrefillFields,
  HIPAA_SIGNER_ONLY_LOWER,
  hipaaClientDisplayName,
  validateHipaaPrefill,
} from "@/lib/hipaa-prefill";
import type { HipaaFormPrefill, SigningFormKind } from "@/types/models";

export type { HipaaFormPrefill };
export { validateHipaaPrefill, hipaaClientDisplayName };

/** DocuSeal field names on "Contract Ramos James Law ENGLISH 2026" (and variants). */
export const RJL_ENGLISH_2026_FIELD = {
  clientName: "client name",
  dolDayNumber: "dol day number",
  dolMonthYear: "dol month year",
  todayDayNumber: "today day number",
  todayMonth: "today month",
  signature: "signature",
} as const;

/** DocuSeal field names on "Contract Ramos James Law SPANISH 2026" (and variants). */
export const RJL_SPANISH_2026_FIELD = {
  clientName: "client name",
  dateOfLoss: "date of loss",
  todayDayNumber: "today day number",
  todayMonthSpanish: "today month spanish",
  signature: "signature",
} as const;

/** DocuSeal field names on SAR (release) templates — one template per person in DocuSeal. */
export const SAR_RELEASE_FIELD = {
  dayNumberToday: "day-number-today",
  monthNameToday: "month-name-today",
  signature: "signature",
} as const;

const SIGNER_ONLY_FIELDS_LOWER = new Set(
  [
    RJL_ENGLISH_2026_FIELD.signature,
    RJL_SPANISH_2026_FIELD.signature,
    SAR_RELEASE_FIELD.signature,
    ...HIPAA_SIGNER_ONLY_LOWER,
  ].map((n) => n.toLowerCase()),
);

export function isRjlEnglish2026Template(templateName: string): boolean {
  if (isDeprecatedDocusealTemplate(templateName)) return false;
  return /ramos james law english 2026/i.test(templateName);
}

export function isRjlSpanish2026Template(templateName: string): boolean {
  if (isDeprecatedDocusealTemplate(templateName)) return false;
  return /ramos james law spanish 2026/i.test(templateName);
}

/** SAR release — template name should include “SAR” (each person has their own DocuSeal template). */
export function isSarReleaseTemplate(templateName: string): boolean {
  return /\bsar\b/i.test(templateName);
}

/** Disbursement — one-time per person; name should include “Disbursement”. */
export function isDisbursementTemplate(templateName: string): boolean {
  if (isDeprecatedDocusealTemplate(templateName)) return false;
  if (isSarReleaseTemplate(templateName)) return false;
  return /\bdisbursement\b/i.test(templateName);
}

/** One-time DocuSeal templates (SAR, Disbursement, …) — archived after a successful send. */
export function isOneTimeTemplate(templateName: string): boolean {
  return isSarReleaseTemplate(templateName) || isDisbursementTemplate(templateName);
}

/** RJL HIPAA Form — English only. */
export function isRjlHipaaTemplate(templateName: string): boolean {
  if (isDeprecatedDocusealTemplate(templateName)) return false;
  if (isOneTimeTemplate(templateName)) return false;
  return /\bhipaa\b/i.test(templateName);
}

export function detectSigningFormKind(templateName: string): SigningFormKind {
  if (isSarReleaseTemplate(templateName)) return "sar";
  if (isDisbursementTemplate(templateName)) return "disbursement";
  if (isRjlHipaaTemplate(templateName)) return "hipaa";
  return "contract";
}

export function templateRequiresDateOfLoss(templateName: string): boolean {
  return isRjlEnglish2026Template(templateName) || isRjlSpanish2026Template(templateName);
}

export function templateShowsLanguageChoice(templateName: string): boolean {
  return detectSigningFormKind(templateName) === "contract";
}

/** Retired templates kept in DocuSeal for records — hidden from Sign Flow pickers. */
export function isDeprecatedDocusealTemplate(templateName: string): boolean {
  return /\bold\b/i.test(templateName);
}

export function isVisibleDocusealTemplate(t: { name: string; archivedAt?: string | null }): boolean {
  return !t.archivedAt && !isDeprecatedDocusealTemplate(t.name);
}

export function filterContractTemplates<T extends { name: string; archivedAt?: string | null }>(templates: T[]): T[] {
  return templates.filter(
    (t) =>
      isVisibleDocusealTemplate(t) &&
      !isOneTimeTemplate(t.name) &&
      !isRjlHipaaTemplate(t.name),
  );
}

/** @deprecated Use filterContractTemplates */
export const filterIntakeTemplates = filterContractTemplates;

export function filterSarReleaseTemplates<T extends { name: string; archivedAt?: string | null }>(templates: T[]): T[] {
  return templates.filter((t) => isVisibleDocusealTemplate(t) && isSarReleaseTemplate(t.name));
}

/** SAR releases + Disbursement (and future one-time templates). */
export function filterOneTimeTemplates<T extends { name: string; archivedAt?: string | null }>(templates: T[]): T[] {
  return templates.filter((t) => isVisibleDocusealTemplate(t) && isOneTimeTemplate(t.name));
}

export function filterHipaaTemplates<T extends { name: string; archivedAt?: string | null }>(templates: T[]): T[] {
  return templates.filter((t) => isVisibleDocusealTemplate(t) && isRjlHipaaTemplate(t.name));
}

export type DocusealPrefillField = {
  name: string;
  default_value: string;
  readonly?: boolean;
};

export type BuildDocusealPrefillInput = {
  templateName: string;
  clientName: string;
  /** ISO date (yyyy-MM-dd) for date of loss. */
  dateOfLoss: string | null;
  hipaaPrefill?: HipaaFormPrefill | null;
  /** When the signing request is sent; defaults to now (US Central calendar for “today”). */
  sentAt?: Date;
};

function buildEnglish2026Prefill(input: BuildDocusealPrefillInput, dol: NonNullable<ReturnType<typeof parseIsoDateOnly>>): DocusealPrefillField[] {
  const today = getSignflowCalendarParts(input.sentAt ?? new Date());
  const F = RJL_ENGLISH_2026_FIELD;

  return [
    { name: F.clientName, default_value: input.clientName.trim(), readonly: true },
    { name: F.dolDayNumber, default_value: String(dol.day), readonly: true },
    { name: F.dolMonthYear, default_value: formatSignflowMonthYear(dol), readonly: true },
    { name: F.todayDayNumber, default_value: String(today.day), readonly: true },
    { name: F.todayMonth, default_value: formatSignflowMonthLong(today), readonly: true },
  ];
}

function buildSpanish2026Prefill(input: BuildDocusealPrefillInput, dol: NonNullable<ReturnType<typeof parseIsoDateOnly>>): DocusealPrefillField[] {
  const today = getSignflowCalendarParts(input.sentAt ?? new Date());
  const F = RJL_SPANISH_2026_FIELD;
  // DocuSeal field type is `date` — must be yyyy-MM-dd. Spanish prose (e.g. "28 de julio de 2026")
  // is mis-parsed and can show as 07/01/2026.
  const dateOfLossIso = `${dol.year}-${String(dol.month).padStart(2, "0")}-${String(dol.day).padStart(2, "0")}`;

  return [
    { name: F.clientName, default_value: input.clientName.trim(), readonly: true },
    { name: F.dateOfLoss, default_value: dateOfLossIso, readonly: true },
    { name: F.todayDayNumber, default_value: String(today.day), readonly: true },
    { name: F.todayMonthSpanish, default_value: formatSignflowMonthSpanish(today), readonly: true },
  ];
}

function buildSarReleasePrefill(input: BuildDocusealPrefillInput): DocusealPrefillField[] {
  const today = getSignflowCalendarParts(input.sentAt ?? new Date());
  const F = SAR_RELEASE_FIELD;

  return [
    { name: F.dayNumberToday, default_value: String(today.day), readonly: true },
    { name: F.monthNameToday, default_value: formatSignflowMonthLong(today), readonly: true },
  ];
}

export function resolveClientNameForSigningRequest(
  templateName: string,
  clientName: string | null | undefined,
  hipaaPrefill?: HipaaFormPrefill | null,
): string {
  if (isRjlHipaaTemplate(templateName) && hipaaPrefill) {
    const name = hipaaClientDisplayName(hipaaPrefill);
    if (name) return name;
    throw new Error("First and last name are required for the HIPAA form.");
  }
  const trimmed = clientName?.trim();
  if (trimmed) return trimmed;
  throw new Error("Client name is required.");
}

/** Pre-fill DocuSeal submitter fields (excludes signature). */
export function buildDocusealPrefillFields(input: BuildDocusealPrefillInput): DocusealPrefillField[] {
  if (isSarReleaseTemplate(input.templateName)) {
    return buildSarReleasePrefill(input);
  }
  // Disbursement templates typically have unnamed signature + date fields — client completes both.
  if (isDisbursementTemplate(input.templateName)) {
    return [];
  }
  if (isRjlHipaaTemplate(input.templateName) && input.hipaaPrefill) {
    return buildHipaaDocusealPrefillFields(input.hipaaPrefill, input.sentAt);
  }

  const dol = input.dateOfLoss ? parseIsoDateOnly(input.dateOfLoss) : null;
  if (!dol) return [];

  if (isRjlEnglish2026Template(input.templateName)) {
    return buildEnglish2026Prefill(input, dol);
  }
  if (isRjlSpanish2026Template(input.templateName)) {
    return buildSpanish2026Prefill(input, dol);
  }
  return [];
}

/** Never pre-fill signature or other signer-only fields. */
export function isSignerOnlyDocusealField(fieldName: string): boolean {
  return SIGNER_ONLY_FIELDS_LOWER.has(fieldName.trim().toLowerCase());
}
