const DEFAULT_BASE = "https://api.docuseal.com";

/** DocuSeal Cloud — REST lives at host root (`/templates`, …). */
const DOCUSEAL_CLOUD_API_HOSTS = new Set(["api.docuseal.com", "api.docuseal.eu"]);

export type DocusealConnection = {
  apiUrl?: string | null;
  apiKey?: string | null;
  adminBaseUrl?: string | null;
};

/** fetch() requires a scheme; env often omits https:// for self-hosted hosts. */
export function ensureHttpUrlBase(raw: string): string {
  const trimmed = raw.trim().replace(/\/$/, "");
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function docusealBaseUrl(conn?: DocusealConnection): string {
  const u = conn?.apiUrl?.trim() || process.env.DOCUSEAL_API_URL?.trim();
  return u && u.length > 0 ? ensureHttpUrlBase(u) : DEFAULT_BASE;
}

/**
 * Full URL for DocuSeal REST paths (e.g. `/templates`, `/submissions`).
 * Self-hosted mounts JSON under `/api`; `/templates` without it is the browser UI (401 Devise).
 */
export function docusealApiRequestUrl(path: string, conn?: DocusealConnection): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  const base = docusealBaseUrl(conn);
  let host = "";
  try {
    host = new URL(base).hostname.toLowerCase();
  } catch {
    /* fall through to self-hosted rule */
  }
  const isCloud = DOCUSEAL_CLOUD_API_HOSTS.has(host);
  const alreadyHasApiMount = /\/api$/i.test(base);
  const prefix = isCloud || alreadyHasApiMount ? "" : "/api";
  return `${base}${prefix}${p}`;
}

export function docusealHeaders(conn?: DocusealConnection): HeadersInit {
  const key = conn?.apiKey?.trim() || process.env.DOCUSEAL_API_KEY;
  if (!key) throw new Error("DocuSeal API key is not configured for this firm.");
  return {
    "X-Auth-Token": key,
    "content-type": "application/json",
    accept: "application/json",
  };
}

/** Human-readable error when DocuSeal (or Railway in front of it) returns non-2xx. */
export async function docusealApiError(
  res: Response,
  action: string,
  requestUrl?: string,
  conn?: DocusealConnection,
): Promise<string> {
  const text = await res.text();
  let message = text.slice(0, 400);
  try {
    const j = JSON.parse(text) as { message?: string };
    if (j?.message) message = j.message;
  } catch {
    /* keep raw */
  }

  const url = requestUrl ?? docusealBaseUrl(conn);
  if (res.status === 404 && /application not found/i.test(message)) {
    return (
      `DocuSeal ${action} failed: Railway returned "Application not found" for ${url}. ` +
      "That hostname is not a live deployment — open Railway → your DocuSeal service → Settings → Networking and copy the current public URL into this firm's DocuSeal API URL (or DOCUSEAL_API_URL)."
    );
  }

  return `DocuSeal ${action} failed (${res.status}) calling ${requestUrl ?? "DocuSeal API"}: ${message}`;
}

export type DocuSealTemplateRow = {
  id: number;
  name: string;
  slug?: string | null;
  archived_at?: string | null;
  updated_at?: string | null;
  folder_name?: string | null;
  submitters?: { name: string; uuid?: string }[];
};

export type DocuSealSubmitterRow = {
  id: number;
  submission_id: number;
  uuid?: string;
  email?: string | null;
  phone?: string | null;
  role?: string;
  embed_src?: string;
  status?: string;
  slug?: string;
};

export async function listTemplates(conn?: DocusealConnection): Promise<DocuSealTemplateRow[]> {
  const url = docusealApiRequestUrl("/templates", conn);
  const res = await fetch(url, { headers: docusealHeaders(conn), cache: "no-store" });
  if (!res.ok) throw new Error(await docusealApiError(res, "list templates", url, conn));
  const data = (await res.json()) as unknown;
  if (Array.isArray(data)) return data as DocuSealTemplateRow[];
  const wrapped = data as { data?: unknown };
  if (wrapped?.data && Array.isArray(wrapped.data)) return wrapped.data as DocuSealTemplateRow[];
  return [];
}

export async function getTemplate(templateId: number, conn?: DocusealConnection): Promise<DocuSealTemplateRow> {
  const url = docusealApiRequestUrl(`/templates/${templateId}`, conn);
  const res = await fetch(url, {
    headers: docusealHeaders(conn),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await docusealApiError(res, "get template", url, conn));
  return (await res.json()) as DocuSealTemplateRow;
}

/** Archive a one-time template in DocuSeal (e.g. SAR release after send). */
export async function archiveTemplate(templateId: number, conn?: DocusealConnection): Promise<void> {
  const url = docusealApiRequestUrl(`/templates/${templateId}`, conn);
  const res = await fetch(url, { method: "DELETE", headers: docusealHeaders(conn) });
  if (!res.ok) throw new Error(await docusealApiError(res, "archive template", url, conn));
}

/** Full template JSON from DocuSeal (schema, fields, etc.). */
export async function getTemplateJson(templateId: number, conn?: DocusealConnection): Promise<unknown> {
  const url = docusealApiRequestUrl(`/templates/${templateId}`, conn);
  const res = await fetch(url, {
    headers: docusealHeaders(conn),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await docusealApiError(res, "get template", url, conn));
  return res.json();
}

export async function listTemplateDocuments(templateId: number, conn?: DocusealConnection): Promise<unknown> {
  const url = docusealApiRequestUrl(`/templates/${templateId}/documents`, conn);
  const res = await fetch(url, {
    headers: docusealHeaders(conn),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await docusealApiError(res, "list template documents", url, conn));
  return res.json();
}

function firstSubmitterRole(template: DocuSealTemplateRow): string {
  const s = template.submitters?.[0]?.name;
  if (!s) throw new Error("Template has no submitter roles defined.");
  return s;
}

export type DocusealSubmitterPrefillField = {
  name: string;
  default_value: string;
  readonly?: boolean;
};

export type CreateSubmissionInput = {
  templateId: number;
  clientName: string;
  email: string | null;
  phone: string | null;
  /** When false, DocuSeal does not send its own notifications (we send via Quo SMS / email provider). */
  sendDocusealEmail: boolean;
  sendDocusealSms: boolean;
  /** DocuSeal template field pre-fill (field `name` must match the template). */
  prefillFields?: DocusealSubmitterPrefillField[];
  conn?: DocusealConnection;
};

export async function createSubmission(input: CreateSubmissionInput): Promise<DocuSealSubmitterRow[]> {
  const conn = input.conn;
  const template = await getTemplate(input.templateId, conn);
  const role = firstSubmitterRole(template);
  const placeholderEmail =
    input.email?.trim() ||
    `signer+${crypto.randomUUID().slice(0, 8)}@${(process.env.SIGNFLOW_PLACEHOLDER_EMAIL_DOMAIN || "client.invalid").replace(/^@/, "")}`;

  const submitter: Record<string, unknown> = {
    role,
    name: input.clientName,
    email: placeholderEmail,
  };
  if (input.phone?.trim()) {
    submitter.phone = input.phone.trim().startsWith("+") ? input.phone.trim() : `+${input.phone.trim().replace(/\D/g, "")}`;
  }
  if (input.prefillFields?.length) {
    submitter.fields = input.prefillFields.map((f) => ({
      name: f.name,
      default_value: f.default_value,
      readonly: f.readonly ?? true,
    }));
  }

  const body: Record<string, unknown> = {
    template_id: input.templateId,
    send_email: input.sendDocusealEmail,
    send_sms: input.sendDocusealSms,
    submitters: [submitter],
  };

  const url = docusealApiRequestUrl("/submissions", conn);
  const res = await fetch(url, {
    method: "POST",
    headers: docusealHeaders(conn),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await docusealApiError(res, "create submission", url, conn));
  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) throw new Error("DocuSeal create submission returned unexpected shape.");
  return data as DocuSealSubmitterRow[];
}

export async function getSubmission(submissionId: number, conn?: DocusealConnection): Promise<unknown> {
  const url = docusealApiRequestUrl(`/submissions/${submissionId}`, conn);
  const res = await fetch(url, {
    headers: docusealHeaders(conn),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await docusealApiError(res, "get submission", url, conn));
  return res.json();
}

export async function downloadUrlToBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export function docusealAdminTemplateUrl(templateId: number, conn?: DocusealConnection): string | null {
  const base = conn?.adminBaseUrl?.trim() || process.env.DOCUSEAL_ADMIN_BASE_URL?.trim();
  if (!base) return null;
  return `${ensureHttpUrlBase(base)}/templates/${templateId}`;
}
