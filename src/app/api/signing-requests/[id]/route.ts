import { NextResponse } from "next/server";
import { getSignFlowStore } from "@/lib/db";
import { isSignFlowAdmin } from "@/lib/auth/is-admin";
import { requireFirmSession, requireSigningRequestInFirm } from "@/lib/auth/firm-session";
import { normalizeSigningRequestForDisplay } from "@/lib/signing-request-active";
import { purgeSigningRequest } from "@/server/signing-workflow";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  let firmId: string;
  try {
    ({ firmId } = await requireFirmSession());
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const store = getSignFlowStore();
  let raw;
  try {
    raw = await requireSigningRequestInFirm(id, firmId);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [lead, events] = await Promise.all([
    store.getLead(raw.leadId),
    store.listSigningEventsForRequest(id),
  ]);
  const item = normalizeSigningRequestForDisplay(raw);
  return NextResponse.json({ item, lead, events });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  let actor: { sub: string; email?: string };
  let firmId: string;
  try {
    ({ user: actor, firmId } = await requireFirmSession());
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSignFlowAdmin(actor.email)) {
    return NextResponse.json(
      { error: "Only admins may permanently delete signing requests. Set SIGNFLOW_ADMIN_EMAILS for your account." },
      { status: 403 },
    );
  }
  const { id } = await ctx.params;
  try {
    await requireSigningRequestInFirm(id, firmId);
    await purgeSigningRequest(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: msg === "Not found" ? 404 : 400 });
  }
}
