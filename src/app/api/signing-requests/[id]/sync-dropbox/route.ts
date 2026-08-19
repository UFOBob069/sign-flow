import { NextResponse } from "next/server";
import { requireFirmSession, requireSigningRequestInFirm } from "@/lib/auth/firm-session";
import { syncSignedArtifactsToDropbox } from "@/server/signing-workflow";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  let firmId: string;
  try {
    ({ firmId } = await requireFirmSession());
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  try {
    await requireSigningRequestInFirm(id, firmId);
    const item = await syncSignedArtifactsToDropbox(id);
    return NextResponse.json({ item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
