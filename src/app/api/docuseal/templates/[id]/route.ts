import { NextResponse } from "next/server";
import { requireFirmSession } from "@/lib/auth/firm-session";
import { getTemplateJson } from "@/services/docuseal-client";
import { getFirmDocusealConnection } from "@/lib/firms";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  let firmId: string;
  try {
    ({ firmId } = await requireFirmSession());
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const templateId = Number(id);
  if (!Number.isFinite(templateId) || templateId <= 0) {
    return NextResponse.json({ error: "Invalid template id" }, { status: 400 });
  }
  try {
    const json = await getTemplateJson(templateId, await getFirmDocusealConnection(firmId));
    return NextResponse.json(json);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load template";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
