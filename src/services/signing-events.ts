import { getSignFlowStore } from "@/lib/db";
import { newId, nowIso } from "@/lib/time";
import type { SigningEvent, SigningEventType } from "@/types/models";

export async function appendSigningEvent(input: {
  signingRequestId: string;
  leadId: string;
  type: SigningEventType;
  metadata?: Record<string, unknown>;
  firmId?: string | null;
}): Promise<SigningEvent> {
  const store = getSignFlowStore();
  const ev: SigningEvent = {
    id: newId("evt"),
    firmId: input.firmId ?? null,
    signingRequestId: input.signingRequestId,
    leadId: input.leadId,
    type: input.type,
    timestamp: nowIso(),
    metadata: input.metadata ?? {},
  };
  await store.appendSigningEvent(ev);
  return ev;
}
