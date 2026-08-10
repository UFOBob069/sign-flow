import { createHmac, timingSafeEqual } from "crypto";
import { isSmsStopKeyword } from "@/lib/phone";
import { stopRemindersByPhone } from "@/server/signing-workflow";

export type QuoMessageReceivedPayload = {
  id?: string;
  type?: string;
  data?: {
    object?: {
      id?: string;
      from?: string;
      to?: string | string[];
      direction?: string;
      body?: string;
      text?: string;
      content?: string;
      status?: string;
    };
  };
};

function getSigningKey(): string | null {
  return process.env.QUO_WEBHOOK_SECRET?.trim() || process.env.QUO_WEBHOOK_KEY?.trim() || null;
}

function hmacKeyCandidates(secret: string): Buffer[] {
  const keys: Buffer[] = [];
  const seen = new Set<string>();
  const add = (buf: Buffer) => {
    const id = buf.toString("hex");
    if (!seen.has(id) && buf.length > 0) {
      seen.add(id);
      keys.push(buf);
    }
  };

  // Canonical Quo/Svix: strip optional whsec_ then base64-decode.
  const withoutPrefix = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  try {
    add(Buffer.from(withoutPrefix, "base64"));
  } catch {
    /* ignore */
  }
  // Some Quo UI copies omit the prefix but still give base64 key material.
  if (withoutPrefix !== secret) {
    try {
      add(Buffer.from(secret, "base64"));
    } catch {
      /* ignore */
    }
  }
  // Fallback: treat the copied secret as raw UTF-8 bytes (non-whsec UI values).
  add(Buffer.from(secret, "utf8"));
  return keys;
}

/**
 * Verify Quo/OpenPhone webhook signature (Svix-style).
 * signed payload = `${webhook-id}.${webhook-timestamp}.${rawBody}`
 *
 * Set QUO_WEBHOOK_SECRET (or QUO_WEBHOOK_KEY) to the signing secret Quo shows when
 * you create the webhook. Official keys are usually `whsec_…`; plain secrets without
 * that prefix are also accepted.
 */
export function isQuoWebhookAuthorized(req: Request, rawBody: string): boolean {
  const secret = getSigningKey();
  if (!secret) return true;

  const webhookId = req.headers.get("webhook-id") ?? "";
  const timestamp = req.headers.get("webhook-timestamp") ?? "";
  const signatureHeader = req.headers.get("webhook-signature") ?? "";
  if (!webhookId || !timestamp || !signatureHeader) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  // Reject deliveries older than 5 minutes (replay protection).
  if (Math.abs(Math.floor(Date.now() / 1000) - ts) > 300) return false;

  const signed = `${webhookId}.${timestamp}.${rawBody}`;
  const candidates = signatureHeader
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [version, signature] = part.split(",");
      return version === "v1" && signature ? signature : part.startsWith("v1,") ? part.slice(3) : part;
    })
    .filter(Boolean);

  for (const key of hmacKeyCandidates(secret)) {
    const expected = createHmac("sha256", key).update(signed, "utf8").digest("base64");
    const expectedBuf = Buffer.from(expected);
    for (const cand of candidates) {
      try {
        const candBuf = Buffer.from(cand);
        if (candBuf.length === expectedBuf.length && timingSafeEqual(candBuf, expectedBuf)) {
          return true;
        }
      } catch {
        /* try next */
      }
    }
  }
  return false;
}

function messageBody(obj: NonNullable<QuoMessageReceivedPayload["data"]>["object"]): string {
  return (obj?.body ?? obj?.text ?? obj?.content ?? "").toString();
}

/**
 * Process Quo message events. Only `message.received` with STOP keywords
 * disable reminders; signing links stay active.
 */
export async function processQuoWebhookJson(payload: unknown): Promise<{
  handled: boolean;
  stopped: number;
  reason?: string;
}> {
  if (!payload || typeof payload !== "object") {
    return { handled: false, stopped: 0, reason: "invalid_payload" };
  }
  const body = payload as QuoMessageReceivedPayload;
  const eventType = body.type ?? "";
  if (eventType && eventType !== "message.received") {
    return { handled: false, stopped: 0, reason: `ignored_${eventType}` };
  }

  const msg = body.data?.object;
  if (!msg) return { handled: false, stopped: 0, reason: "missing_message" };

  const direction = (msg.direction ?? "").toLowerCase();
  if (direction && direction !== "incoming" && direction !== "inbound") {
    return { handled: false, stopped: 0, reason: "not_inbound" };
  }

  const text = messageBody(msg);
  if (!isSmsStopKeyword(text)) {
    return { handled: false, stopped: 0, reason: "not_stop_keyword" };
  }

  const from = msg.from?.trim();
  if (!from) return { handled: false, stopped: 0, reason: "missing_from" };

  const updated = await stopRemindersByPhone(from, "client_sms_stop", { messageBody: text });
  return { handled: true, stopped: updated.length };
}
