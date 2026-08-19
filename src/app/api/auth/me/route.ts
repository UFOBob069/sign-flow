import { NextResponse } from "next/server";
import { isSignFlowAdmin } from "@/lib/auth/is-admin";
import { getSessionUser, isSignFlowAuthRequired } from "@/lib/auth/get-session";
import { firmsAccessibleTo, resolveActiveFirm, toFirmPublic } from "@/lib/firms";

export async function GET() {
  const authRequired = isSignFlowAuthRequired();
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ user: null, authRequired, isAdmin: false, firm: null, firms: [] }, { status: 401 });
  const isAdmin = isSignFlowAdmin(u.email);
  const [firm, accessible] = await Promise.all([
    resolveActiveFirm(u.email, isAdmin),
    firmsAccessibleTo(u.email, isAdmin),
  ]);
  const [firmPublic, firms] = await Promise.all([toFirmPublic(firm), Promise.all(accessible.map(toFirmPublic))]);
  return NextResponse.json({
    user: u,
    authRequired,
    isAdmin,
    firm: { id: firmPublic.id, name: firmPublic.name, logoUrl: firmPublic.logoUrl },
    firms: firms.map((f) => ({ id: f.id, name: f.name, logoUrl: f.logoUrl })),
  });
}
