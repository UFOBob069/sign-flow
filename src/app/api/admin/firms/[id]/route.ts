import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFirmSession } from "@/lib/auth/firm-session";
import { getSignFlowStore } from "@/lib/db";
import { nowIso } from "@/lib/time";
import { DEFAULT_FIRM_ID } from "@/lib/firm-scope";
import { emptyFirmSecrets, parseMemberEmails, toFirmPublic } from "@/lib/firms";
import type { FirmSecrets } from "@/types/models";

async function requireAdmin() {
  const session = await requireFirmSession();
  if (!session.isAdmin) throw new Error("Forbidden");
  return session;
}

const keep = (incoming: string | null | undefined, current: string | null): string | null => {
  if (incoming == null) return current;
  const t = incoming.trim();
  if (!t || t === "********") return current;
  return t;
};

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  logoUrl: z.string().optional().nullable(),
  memberEmails: z.string().optional(),
  docusealApiUrl: z.string().optional().nullable(),
  docusealApiKey: z.string().optional().nullable(),
  docusealAdminBaseUrl: z.string().optional().nullable(),
  docusealWebhookSecret: z.string().optional().nullable(),
  quoApiKey: z.string().optional().nullable(),
  quoFromNumber: z.string().optional().nullable(),
  quoPhoneNumberId: z.string().optional().nullable(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    return NextResponse.json({ error: msg }, { status: msg === "Forbidden" ? 403 : 401 });
  }

  const { id } = await ctx.params;
  const store = getSignFlowStore();
  const firm = await store.getFirm(id);
  if (!firm) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const now = nowIso();
  if (parsed.data.name) firm.name = parsed.data.name.trim();
  if (parsed.data.logoUrl !== undefined) firm.logoUrl = parsed.data.logoUrl?.trim() || null;
  if (parsed.data.memberEmails !== undefined) firm.memberEmails = parseMemberEmails(parsed.data.memberEmails);
  firm.updatedAt = now;
  await store.upsertFirm(firm);

  const existing = (await store.getFirmSecrets(id)) ?? emptyFirmSecrets(id, now);
  const secrets: FirmSecrets = {
    ...existing,
    firmId: id,
    docusealApiUrl: keep(parsed.data.docusealApiUrl, existing.docusealApiUrl),
    docusealApiKey: keep(parsed.data.docusealApiKey, existing.docusealApiKey),
    docusealAdminBaseUrl: keep(parsed.data.docusealAdminBaseUrl, existing.docusealAdminBaseUrl),
    docusealWebhookSecret: keep(parsed.data.docusealWebhookSecret, existing.docusealWebhookSecret),
    quoApiKey: keep(parsed.data.quoApiKey, existing.quoApiKey),
    quoFromNumber: keep(parsed.data.quoFromNumber, existing.quoFromNumber),
    quoPhoneNumberId: keep(parsed.data.quoPhoneNumberId, existing.quoPhoneNumberId),
    updatedAt: now,
  };
  await store.upsertFirmSecrets(secrets);

  return NextResponse.json({ item: await toFirmPublic(firm) });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    return NextResponse.json({ error: msg }, { status: msg === "Forbidden" ? 403 : 401 });
  }
  const { id } = await ctx.params;
  if (id === DEFAULT_FIRM_ID) {
    return NextResponse.json({ error: "The default firm cannot be deleted." }, { status: 400 });
  }
  const store = getSignFlowStore();
  const firm = await store.getFirm(id);
  if (!firm) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await store.deleteFirm(id);
  return NextResponse.json({ ok: true });
}
