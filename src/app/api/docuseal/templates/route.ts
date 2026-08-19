import { NextResponse } from "next/server";
import { requireFirmSession } from "@/lib/auth/firm-session";
import { docusealAdminTemplateUrl, ensureHttpUrlBase, listTemplates } from "@/services/docuseal-client";
import { isVisibleDocusealTemplate } from "@/lib/docuseal-prefill";
import { getFirmDocusealConnection } from "@/lib/firms";
import type { DocuSealTemplateSummary } from "@/types/models";

export async function GET() {
  let firmId: string;
  try {
    ({ firmId } = await requireFirmSession());
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const conn = await getFirmDocusealConnection(firmId);
    const rows = await listTemplates(conn);
    const adminBase = conn.adminBaseUrl?.trim() || process.env.DOCUSEAL_ADMIN_BASE_URL?.trim();
    const items: DocuSealTemplateSummary[] = rows
      .filter((t) => isVisibleDocusealTemplate({ name: t.name, archivedAt: t.archived_at ?? null }))
      .map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug ?? null,
      archivedAt: t.archived_at ?? null,
      updatedAt: t.updated_at ?? null,
      folderName: t.folder_name ?? null,
      adminUrl:
        docusealAdminTemplateUrl(t.id, conn) ??
        (adminBase ? `${ensureHttpUrlBase(adminBase)}/templates/${t.id}` : null),
      }));
    return NextResponse.json({ items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load templates";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
