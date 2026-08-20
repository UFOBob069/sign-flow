import { cookies } from "next/headers";
import { getSignFlowStore } from "@/lib/db";
import { nowIso } from "@/lib/time";
import type { Firm, FirmSecrets } from "@/types/models";
import {
  DEFAULT_FIRM_ID,
  FIRM_COOKIE,
  defaultFirmRecord,
  userCanAccessFirm,
} from "@/lib/firm-scope";

export {
  DEFAULT_FIRM_ID,
  FIRM_COOKIE,
  belongsToFirm,
  defaultFirmRecord,
  documentFirmId,
  emptyFirmSecrets,
  parseMemberEmails,
  slugifyFirmName,
  userCanAccessFirm,
} from "@/lib/firm-scope";

export async function ensureDefaultFirm(): Promise<Firm> {
  const store = getSignFlowStore();
  const existing = await store.getFirm(DEFAULT_FIRM_ID);
  if (existing) return existing;
  const firm = defaultFirmRecord(nowIso());
  await store.upsertFirm(firm);
  return firm;
}

export async function listAllFirms(): Promise<Firm[]> {
  const store = getSignFlowStore();
  await ensureDefaultFirm();
  const firms = await store.listFirms();
  if (firms.some((f) => f.id === DEFAULT_FIRM_ID)) return firms;
  return [defaultFirmRecord(nowIso()), ...firms];
}

export async function firmsAccessibleTo(email: string | undefined, isAdmin: boolean): Promise<Firm[]> {
  const firms = await listAllFirms();
  return firms.filter((f) => userCanAccessFirm(email, f, isAdmin));
}

export async function emailIsFirmMember(email: string): Promise<boolean> {
  const firms = await listAllFirms();
  return firms.some((f) => f.memberEmails.length > 0 && userCanAccessFirm(email, f, false));
}

export async function readFirmCookie(): Promise<string | null> {
  const value = (await cookies()).get(FIRM_COOKIE)?.value?.trim();
  return value || null;
}

export async function resolveActiveFirm(email: string | undefined, isAdmin: boolean): Promise<Firm> {
  const accessible = await firmsAccessibleTo(email, isAdmin);
  if (accessible.length === 0) {
    return ensureDefaultFirm();
  }
  const cookieId = await readFirmCookie();
  const fromCookie = cookieId ? accessible.find((f) => f.id === cookieId) : undefined;
  if (fromCookie) return fromCookie;
  const home = accessible.find((f) => f.id === DEFAULT_FIRM_ID);
  return home ?? accessible[0]!;
}

export type FirmPublic = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  memberEmails: string[];
  docusealConfigured: boolean;
  quoConfigured: boolean;
  usesEnvDocuseal: boolean;
  usesEnvQuo: boolean;
  /** Non-secret connection fields — safe to show in Admin → Firms. */
  docusealApiUrl: string | null;
  docusealAdminBaseUrl: string | null;
  quoFromNumber: string | null;
  quoPhoneNumberId: string | null;
  /** True when a firm-specific secret is stored (value never returned). */
  hasDocusealApiKey: boolean;
  hasDocusealWebhookSecret: boolean;
  hasQuoApiKey: boolean;
};

export function firmSecretsConfigured(secrets: FirmSecrets | null): {
  docusealConfigured: boolean;
  quoConfigured: boolean;
  usesEnvDocuseal: boolean;
  usesEnvQuo: boolean;
  docusealApiUrl: string | null;
  docusealAdminBaseUrl: string | null;
  quoFromNumber: string | null;
  quoPhoneNumberId: string | null;
  hasDocusealApiKey: boolean;
  hasDocusealWebhookSecret: boolean;
  hasQuoApiKey: boolean;
} {
  const hasFirmDocuseal = Boolean(secrets?.docusealApiKey?.trim());
  const hasEnvDocuseal = Boolean(process.env.DOCUSEAL_API_KEY?.trim());
  const hasFirmQuo = Boolean(
    secrets?.quoApiKey?.trim() && (secrets.quoFromNumber?.trim() || secrets.quoPhoneNumberId?.trim()),
  );
  const hasEnvQuo = Boolean(
    process.env.QUO_API_KEY?.trim() && (process.env.QUO_FROM_NUMBER?.trim() || process.env.QUO_PHONE_NUMBER_ID?.trim()),
  );
  return {
    docusealConfigured: hasFirmDocuseal || hasEnvDocuseal,
    quoConfigured: hasFirmQuo || hasEnvQuo,
    usesEnvDocuseal: !hasFirmDocuseal && hasEnvDocuseal,
    usesEnvQuo: !hasFirmQuo && hasEnvQuo,
    docusealApiUrl: secrets?.docusealApiUrl?.trim() || null,
    docusealAdminBaseUrl: secrets?.docusealAdminBaseUrl?.trim() || null,
    quoFromNumber: secrets?.quoFromNumber?.trim() || null,
    quoPhoneNumberId: secrets?.quoPhoneNumberId?.trim() || null,
    hasDocusealApiKey: hasFirmDocuseal,
    hasDocusealWebhookSecret: Boolean(secrets?.docusealWebhookSecret?.trim()),
    hasQuoApiKey: Boolean(secrets?.quoApiKey?.trim()),
  };
}

export async function toFirmPublic(firm: Firm): Promise<FirmPublic> {
  const secrets = await getSignFlowStore().getFirmSecrets(firm.id);
  return {
    id: firm.id,
    name: firm.name,
    slug: firm.slug,
    logoUrl: firm.logoUrl,
    memberEmails: firm.memberEmails,
    ...firmSecretsConfigured(secrets),
  };
}

export type DocusealConnection = {
  apiUrl?: string | null;
  apiKey?: string | null;
  adminBaseUrl?: string | null;
  webhookSecret?: string | null;
};

export type QuoConnection = {
  apiKey?: string | null;
  fromNumber?: string | null;
  phoneNumberId?: string | null;
};

export async function getFirmDocusealConnection(firmId: string): Promise<DocusealConnection> {
  const secrets = await getSignFlowStore().getFirmSecrets(firmId);
  return {
    apiUrl: secrets?.docusealApiUrl,
    apiKey: secrets?.docusealApiKey,
    adminBaseUrl: secrets?.docusealAdminBaseUrl,
    webhookSecret: secrets?.docusealWebhookSecret,
  };
}

export async function getFirmQuoConnection(firmId: string): Promise<QuoConnection | undefined> {
  const secrets = await getSignFlowStore().getFirmSecrets(firmId);
  if (!secrets?.quoApiKey?.trim()) return undefined;
  return {
    apiKey: secrets.quoApiKey,
    fromNumber: secrets.quoFromNumber,
    phoneNumberId: secrets.quoPhoneNumberId,
  };
}
