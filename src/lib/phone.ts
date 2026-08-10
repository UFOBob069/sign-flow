import { parsePhoneNumberFromString } from "libphonenumber-js";

/** Normalize to E.164 when possible (US default). */
export function normalizePhoneE164(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const p = parsePhoneNumberFromString(raw.trim(), "US");
  if (p?.isValid()) return p.number;
  const p2 = parsePhoneNumberFromString(raw.startsWith("+") ? raw : `+${raw.replace(/\D/g, "")}`);
  return p2?.isValid() ? p2.number : null;
}

/** Compare staff-entered and Quo inbound numbers without requiring identical formatting. */
export function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const ea = normalizePhoneE164(a);
  const eb = normalizePhoneE164(b);
  if (ea && eb) return ea === eb;
  const da = (a ?? "").replace(/\D/g, "");
  const db = (b ?? "").replace(/\D/g, "");
  if (da.length < 10 || db.length < 10) return false;
  return da === db || da.endsWith(db) || db.endsWith(da);
}

/** CTIA/common SMS opt-out keywords + Spanish ALTO used in RJL SMS templates. */
const STOP_KEYWORDS = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit", "alto"]);

export function isSmsStopKeyword(body: string | null | undefined): boolean {
  const text = (body ?? "").trim().toLowerCase().replace(/[.!]+$/g, "");
  return STOP_KEYWORDS.has(text);
}
