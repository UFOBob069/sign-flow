import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/get-session";
import { normalizeSigningRequestForDisplay } from "@/lib/signing-request-active";
import { stopRemindersForRequest } from "@/server/signing-workflow";

/** Staff: turn off automated reminders; signing link stays active. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  let actor: { sub: string };
  try {
    actor = await requireSessionUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  try {
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
