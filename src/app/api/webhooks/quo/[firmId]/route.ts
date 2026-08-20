import { NextResponse } from "next/server";
import { isQuoWebhookAuthorized, processQuoWebhookJson } from "@/server/quo-webhook";

export const dynamic = "force-dynamic";

/**
 * Per-firm Quo / OpenPhone inbound webhook.
 * Configure `message.received` → https://your-host/api/webhooks/quo/{firmId}
 * Store that Quo account’s signing secret on the firm (Admin → Firms).
 */
export async function POST(req: Request, ctx: { params: Promise<{ firmId: string }> }) {
  const { firmId } = await ctx.params;
  const rawBody = await req.text();
  if (!(await isQuoWebhookAuthorized(req, rawBody, firmId))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const result = await processQuoWebhookJson(json, firmId);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "webhook error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
