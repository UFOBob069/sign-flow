import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFirmSession, requireSigningRequestInFirm } from "@/lib/auth/firm-session";
import { normalizeSigningRequestForDisplay } from "@/lib/signing-request-active";
import { resendSigningNotifications } from "@/server/signing-workflow";

const bodySchema = z.object({
  sms: z.boolean().optional(),
  email: z.boolean().optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  let firmId: string;
  try {
    ({ firmId } = await requireFirmSession());
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const json = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const sms = parsed.data.sms !== undefined ? parsed.data.sms : true;
  const email = parsed.data.email !== undefined ? parsed.data.email : true;
  if (!sms && !email) {
    return NextResponse.json({ error: "Enable at least one of sms or email." }, { status: 400 });
  }
  try {
    await requireSigningRequestInFirm(id, firmId);
    const item = normalizeSigningRequestForDisplay(await resendSigningNotifications(id, { sms, email }));
    return NextResponse.json({ item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
