import { parsePhoneNumberFromString } from "libphonenumber-js";

export type SendSmsResult = {
  sid: string;
  status: string;
  body: string;
  to: string;
};

const PN_ID = /^PN[a-zA-Z0-9]+$/;
const QUO_MESSAGES_URL = "https://api.openphone.com/v1/messages";
const SMS_ATTEMPTS = 2;
const SMS_TIMEOUT_MS = 15_000;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504, 524]);

export type QuoConnection = {
  apiKey?: string | null;
  fromNumber?: string | null;
  phoneNumberId?: string | null;
};

/** True when real SMS can be sent (API key + from number or phone number id). */
export function isQuoSmsConfigured(conn?: QuoConnection): boolean {
  const apiKey = conn?.apiKey?.trim() || process.env.QUO_API_KEY?.trim();
  return Boolean(apiKey && resolveQuoFrom(conn)?.from);
}

function quoSmsMockEnabled(): boolean {
  return process.env.QUO_SMS_MOCK?.trim().toLowerCase() === "true";
}

function toE164(raw: string): string | null {
  const p = parsePhoneNumberFromString(raw, "US");
  if (p?.isValid()) return p.number;
  const p2 = parsePhoneNumberFromString(raw.startsWith("+") ? raw : `+${raw.replace(/\D/g, "")}`);
  return p2?.isValid() ? p2.number : null;
}

/** Quo accepts `from` as E.164 or phone number id (PN…). */
function resolveQuoFrom(conn?: QuoConnection): { from: string; label: string } | null {
  const phoneNumberId = conn?.phoneNumberId?.trim() || process.env.QUO_PHONE_NUMBER_ID?.trim();
  if (phoneNumberId) {
    const id = phoneNumberId.startsWith("PN") ? phoneNumberId : `PN${phoneNumberId}`;
    if (!PN_ID.test(id)) return null;
    return { from: id, label: "QUO_PHONE_NUMBER_ID" };
  }

  const raw = conn?.fromNumber?.trim() || process.env.QUO_FROM_NUMBER?.trim();
  if (!raw) return null;
  if (PN_ID.test(raw) || raw.startsWith("PN")) return { from: raw.startsWith("PN") ? raw : `PN${raw}`, label: "QUO_FROM_NUMBER" };

  const e164 = toE164(raw);
  if (!e164) return null;
  return { from: e164, label: "QUO_FROM_NUMBER" };
}

type QuoErrorBody = {
  message?: string;
  code?: string;
  title?: string;
  description?: string;
};

function looksLikeHtml(text: string): boolean {
  const t = text.trimStart().slice(0, 200).toLowerCase();
  return t.startsWith("<!doctype") || t.startsWith("<html") || t.includes("<html");
}

function gatewayTimeoutMessage(status: number): string {
  return (
    `Quo (OpenPhone) timed out (HTTP ${status}). This is usually a temporary outage on their side — ` +
    "wait a moment and retry SMS from the request page. Do not send the contract again."
  );
}

function formatQuoFailure(status: number, text: string, fromLabel: string): string {
  if (status === 502 || status === 503 || status === 504 || status === 524 || looksLikeHtml(text)) {
    if (status === 504 || status === 524 || /gateway time-?out/i.test(text)) {
      return gatewayTimeoutMessage(status);
    }
    return (
      `Quo (OpenPhone) is temporarily unavailable (HTTP ${status}). ` +
      "Wait a moment and retry SMS from the request page."
    );
  }

  let detail = text.slice(0, 900);
  try {
    const j = JSON.parse(text) as QuoErrorBody;
    if (j?.message) {
      detail = j.message;
      if (j.title) detail = `${j.title}: ${detail}`;
      if (j.code) detail += ` (Quo error ${j.code})`;
    }
  } catch {
    /* keep raw snippet */
  }

  const notFoundFrom =
    status === 404 &&
    /phone number not found/i.test(detail) &&
    fromLabel === "QUO_FROM_NUMBER";

  if (notFoundFrom) {
    detail +=
      " — This number is not in your Quo workspace. In the Quo app, open your number’s settings and copy its exact E.164 value, or set QUO_PHONE_NUMBER_ID to the PN… id from GET https://api.openphone.com/v1/phone-numbers (do not reuse a Twilio or other provider number).";
  }

  return detail;
}

function isAbortTimeout(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  return e.name === "TimeoutError" || e.name === "AbortError" || /aborted|timeout/i.test(e.message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendSms(toRaw: string, body: string, conn?: QuoConnection): Promise<SendSmsResult> {
  const apiKey = conn?.apiKey?.trim() || process.env.QUO_API_KEY?.trim();
  const resolved = resolveQuoFrom(conn);
  const userId = process.env.QUO_USER_ID?.trim();

  if (!apiKey || !resolved) {
    if (quoSmsMockEnabled()) {
      const mockSid = `AC_MOCK_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
      return { sid: mockSid, status: "queued-mock", body, to: toRaw };
    }
    throw new Error(
      "SMS was requested but Quo is not fully configured. Set QUO_API_KEY and either QUO_FROM_NUMBER (E.164 number from your Quo workspace) or QUO_PHONE_NUMBER_ID (PN… from GET /v1/phone-numbers). For local dev without Quo, set QUO_SMS_MOCK=true or turn off SMS on the send form.",
    );
  }

  const to = toE164(toRaw);
  if (!to) {
    throw new Error(
      `Invalid phone number for SMS: "${toRaw.trim() || "(empty)"}". Use E.164 (e.g. +15125551234) or a valid US number with area code.`,
    );
  }

  const payload: { content: string; from: string; to: string[]; userId?: string } = {
    content: body,
    from: resolved.from,
    to: [to],
  };
  if (userId) payload.userId = userId;

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= SMS_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(QUO_MESSAGES_URL, {
        method: "POST",
        headers: { Authorization: apiKey, "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(SMS_TIMEOUT_MS),
      });
    } catch (e) {
      lastError = isAbortTimeout(e)
        ? new Error(gatewayTimeoutMessage(504))
        : new Error(`Quo SMS failed: ${e instanceof Error ? e.message : String(e)}`);
      if (attempt < SMS_ATTEMPTS && isAbortTimeout(e)) {
        await sleep(1000 * attempt);
        continue;
      }
      throw lastError;
    }

    if (res.ok) {
      const json = (await res.json()) as {
        data?: { id?: string; status?: string; to?: string[] };
      };
      const data = json.data;
      return {
        sid: String(data?.id ?? ""),
        status: String(data?.status ?? "queued"),
        body,
        to: data?.to?.[0] ?? to,
      };
    }

    const text = await res.text();
    lastError = new Error(`Quo SMS failed (HTTP ${res.status}): ${formatQuoFailure(res.status, text, resolved.label)}`);
    if (attempt < SMS_ATTEMPTS && RETRYABLE_STATUS.has(res.status)) {
      await sleep(1000 * attempt);
      continue;
    }
    throw lastError;
  }

  throw lastError ?? new Error("Quo SMS failed.");
}
