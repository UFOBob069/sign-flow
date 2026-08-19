import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFirmSession } from "@/lib/auth/firm-session";
import { getSignFlowStore } from "@/lib/db";
import { nowIso } from "@/lib/time";
import { DEFAULT_FIRM_ID } from "@/lib/firm-scope";
import {
  emptyFirmSecrets,
  ensureDefaultFirm,
  listAllFirms,
  parseMemberEmails,
  slugifyFirmName,
  toFirmPublic,
} from "@/lib/firms";
import type { Firm, FirmSecrets } from "@/types/models";

async function requireAdmin() {
  const session = await requireFirmSession();
  if (!session.isAdmin) {
    throw new Error("Forbidden");
  }
  return session;
}

const createSchema = z.object({
  name: z.string().min(1),
  logoUrl: z.string().optional().nullable(),
  memberEmails: z.string().optional().default(""),
  docusealApiUrl: z.string().optional().nullable(),
  docusealApiKey: z.string().optional().nullable(),
  docusealAdminBaseUrl: z.string().optional().nullable(),
  docusealWebhookSecret: z.string().optional().nullable(),
  quoApiKey: z.string().optional().nullable(),
  quoFromNumber: z.string().optional().nullable(),
  quoPhoneNumberId: z.string().optional().nullable(),
});

export async function GET() {
  try {
    await requireAdmin();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    return NextResponse.json({ error: msg }, { status: msg === "Forbidden" ? 403 : 401 });
  }
  await ensureDefaultFirm();
  const firms = await listAllFirms();
  const items = await Promise.all(firms.map(toFirmPublic));
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    return NextResponse.json({ error: msg }, { status: msg === "Forbidden" ? 403 : 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const store = getSignFlowStore();
  const existing = await store.listFirms();
  let slug = slugifyFirmName(parsed.data.name);
  if (slug === DEFAULT_FIRM_ID || existing.some((f) => f.id === slug || f.slug === slug)) {
    slug = `${slug}-${crypto.randomUUID().slice(0, 6)}`;
  }

  const now = nowIso();
  const firm: Firm = {
    id: slug,
    name: parsed.data.name.trim(),
    slug,
    logoUrl: parsed.data.logoUrl?.trim() || null,
    memberEmails: parseMemberEmails(parsed.data.memberEmails),
    createdAt: now,
    updatedAt: now,
  };
  await store.upsertFirm(firm);

  const secrets: FirmSecrets = {
    ...emptyFirmSecrets(firm.id, now),
    docusealApiUrl: parsed.data.docusealApiUrl?.trim() || null,
    docusealApiKey: parsed.data.docusealApiKey?.trim() || null,
    docusealAdminBaseUrl: parsed.data.docusealAdminBaseUrl?.trim() || null,
    docusealWebhookSecret: parsed.data.docusealWebhookSecret?.trim() || null,
    quoApiKey: parsed.data.quoApiKey?.trim() || null,
    quoFromNumber: parsed.data.quoFromNumber?.trim() || null,
    quoPhoneNumberId: parsed.data.quoPhoneNumberId?.trim() || null,
  };
  await store.upsertFirmSecrets(secrets);

  return NextResponse.json({ item: await toFirmPublic(firm) });
}
