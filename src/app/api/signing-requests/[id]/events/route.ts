import { NextResponse } from "next/server";
import { getSignFlowStore } from "@/lib/db";
import { requireFirmSession, requireSigningRequestInFirm } from "@/lib/auth/firm-session";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  let firmId: string;
  try {
    ({ firmId } = await requireFirmSession());
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  try {
    await requireSigningRequestInFirm(id, firmId);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const store = getSignFlowStore();
  const events = await store.listSigningEventsForRequest(id);
  return NextResponse.json({ events });
}
