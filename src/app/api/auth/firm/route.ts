import { NextResponse } from "next/server";
import { z } from "zod";
import { isSignFlowAdmin } from "@/lib/auth/is-admin";
import { requireSessionUser } from "@/lib/auth/get-session";
import { FIRM_COOKIE, firmsAccessibleTo } from "@/lib/firms";

const bodySchema = z.object({
  firmId: z.string().min(1),
});

export async function POST(req: Request) {
  let user: { email?: string };
  try {
    user = await requireSessionUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const isAdmin = isSignFlowAdmin(user.email);
  const accessible = await firmsAccessibleTo(user.email, isAdmin);
  const firm = accessible.find((f) => f.id === parsed.data.firmId);
  if (!firm) {
    return NextResponse.json({ error: "You do not have access to that firm." }, { status: 403 });
  }

  const res = NextResponse.json({ ok: true, firm: { id: firm.id, name: firm.name, logoUrl: firm.logoUrl } });
  const secure = process.env.NODE_ENV === "production";
  res.cookies.set(FIRM_COOKIE, firm.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure,
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
