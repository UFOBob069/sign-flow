import { emailMatchesAllowlist, parseEmailAllowlist } from "@/lib/auth/email-allowlist";
import type { Firm, FirmSecrets } from "@/types/models";

export const DEFAULT_FIRM_ID = "ramos-james";
export const FIRM_COOKIE = "signflow_firm";
export const LEGACY_SETTINGS_ID = "default";

export function defaultFirmRecord(now: string): Firm {
  return {
    id: DEFAULT_FIRM_ID,
    name: "Ramos James Law",
    slug: "ramos-james",
    logoUrl: "/ramosjames-new-logo-white-revised-f.webp",
    memberEmails: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function emptyFirmSecrets(firmId: string, now: string): FirmSecrets {
  return {
    firmId,
    docusealApiUrl: null,
    docusealApiKey: null,
    docusealAdminBaseUrl: null,
    docusealWebhookSecret: null,
    quoApiKey: null,
    quoFromNumber: null,
    quoPhoneNumberId: null,
    updatedAt: now,
  };
}

export function documentFirmId(doc: { firmId?: string | null }): string {
  return doc.firmId?.trim() || DEFAULT_FIRM_ID;
}

export function belongsToFirm(doc: { firmId?: string | null }, firmId: string): boolean {
  return documentFirmId(doc) === firmId;
}

export function slugifyFirmName(name: string): string {
  const s = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return s || "firm";
}

export function parseMemberEmails(raw: string): string[] {
  return parseEmailAllowlist(raw.replace(/\n/g, ","));
}

export function userCanAccessFirm(email: string | undefined, firm: Firm, isAdmin: boolean): boolean {
  if (isAdmin) return true;
  if (firm.memberEmails.length > 0) {
    if (!email) return false;
    return emailMatchesAllowlist(email, firm.memberEmails);
  }
  return firm.id === DEFAULT_FIRM_ID;
}
