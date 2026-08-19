import { NextResponse } from "next/server";
import { requireFirmSession, requireSigningRequestInFirm } from "@/lib/auth/firm-session";
import { normalizeSigningRequestForDisplay } from "@/lib/signing-request-active";
import { stopRemindersForRequest } from "@/server/signing-workflow";

/** Staff: turn off automated reminders; signing link stays active. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  let actor: { sub: string };
  let firmId: string;
  try {
    ({ user: actor, firmId } = await requireFirmSession());
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  try {
    await requireSigningRequestInFirm(id, firmId);
    const item = normalizeSigningRequestForDisplay(
      await stopRemindersForRequest(id, "staff", { actor: actor.sub }),
    );
    return NextResponse.json({ item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    const status = msg === "Not found" ? 404 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
