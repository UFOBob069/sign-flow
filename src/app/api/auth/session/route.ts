import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuth } from "firebase-admin/auth";
import { getFirebaseAdminApp } from "@/lib/firebase/admin-app";
import { emailIsFirmMember } from "@/lib/firms";
import { isStaffEmailAllowed } from "@/lib/auth/email-allowlist";
import { signSessionToken, getSessionCookieName } from "@/lib/auth/session";

const bodySchema = z.object({
  idToken: z.string().min(1),
});

/**
 * Exchange a Firebase Auth ID token (after Google sign-in in the browser) for a Sign Flow session cookie.
 */
export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  let decoded: { uid: string; email?: string; name?: string };
  try {
    const auth = getAuth(getFirebaseAdminApp());
    decoded = await auth.verifyIdToken(parsed.data.idToken);
  } catch {
    return NextResponse.json({ error: "Invalid or expired Firebase ID token" }, { status: 401 });
  }

  const email = decoded.email?.trim();
  if (!email) {
    return NextResponse.json({ error: "Google sign-in did not return an email address" }, { status: 400 });
  }

  if (!isStaffEmailAllowed(email) && !(await emailIsFirmMember(email))) {
    return NextResponse.json({ error: "This account is not authorized for Sign Flow" }, { status: 403 });
  }

  const secret = process.env.SIGNFLOW_SESSION_SECRET ?? "dev-insecure-secret-change-me";
  const name = decoded.name?.trim() || email.split("@")[0] || "Staff";
  const token = await signSessionToken({ sub: `firebase:${decoded.uid}`, name, email }, secret);

  const res = NextResponse.json({ ok: true });
  const secure = process.env.NODE_ENV === "production";
  res.cookies.set(getSessionCookieName(), token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure,
    maxAge: 60 * 60 * 12,
  });
  return res;
}
