import { NextResponse } from "next/server";
import { isQuoWebhookAuthorized, processQuoWebhookJson } from "@/server/quo-webhook";

export const dynamic = "force-dynamic";

/**
 * Quo / OpenPhone inbound message webhook.
 * Configure `message.received` → https://your-host/api/webhooks/quo
 * Optional: set QUO_WEBHOOK_SECRET to the whsec_… signing key from Quo.
 */
export async function POST(req: Request) {
  const rawBody = await req.text();
  if (!isQuoWebhookAuthorized(req, rawBody)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const result = await processQuoWebhookJson(json);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "webhook error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
