import { isSignFlowAdmin } from "@/lib/auth/is-admin";
import { requireSessionUser, type SessionUser } from "@/lib/auth/get-session";
import { belongsToFirm, resolveActiveFirm } from "@/lib/firms";
import { getSignFlowStore } from "@/lib/db";
import type { Firm, SigningRequest } from "@/types/models";

export type FirmSession = {
  user: SessionUser;
  firm: Firm;
  firmId: string;
  isAdmin: boolean;
};

export async function requireFirmSession(): Promise<FirmSession> {
  const user = await requireSessionUser();
  const isAdmin = isSignFlowAdmin(user.email);
  const firm = await resolveActiveFirm(user.email, isAdmin);
  return { user, firm, firmId: firm.id, isAdmin };
}

export async function requireSigningRequestInFirm(
  signingRequestId: string,
  firmId: string,
): Promise<SigningRequest> {
  const store = getSignFlowStore();
  const req = await store.getSigningRequest(signingRequestId);
  if (!req || !belongsToFirm(req, firmId)) {
    throw new Error("Not found");
  }
  return req;
}
