import type { AppSettings, Firm, FirmSecrets, Lead, SigningEvent, SigningRequest } from "@/types/models";

export type StoreSnapshot = {
  leads: Lead[];
  signingRequests: SigningRequest[];
  signingEvents: SigningEvent[];
  appSettings: AppSettings | null;
};

export interface SignFlowStore {
  isMock: boolean;
  snapshot(): Promise<StoreSnapshot>;

  listFirms(): Promise<Firm[]>;
  getFirm(id: string): Promise<Firm | null>;
  upsertFirm(doc: Firm): Promise<void>;
  deleteFirm(id: string): Promise<void>;
  getFirmSecrets(firmId: string): Promise<FirmSecrets | null>;
  upsertFirmSecrets(doc: FirmSecrets): Promise<void>;

  getLead(id: string): Promise<Lead | null>;
  listLeads(): Promise<Lead[]>;
  /** Batch-fetch leads referenced by signing requests (avoids loading the full leads collection). */
  getLeadsByIds(ids: string[]): Promise<Lead[]>;
  upsertLead(doc: Lead): Promise<void>;

  getSigningRequest(id: string): Promise<SigningRequest | null>;
  listSigningRequests(): Promise<SigningRequest[]>;
  upsertSigningRequest(doc: SigningRequest): Promise<void>;
  /** Permanently remove request and its events (admin only). */
  purgeSigningRequest(signingRequestId: string): Promise<void>;
  /** Find signing request by DocuSeal submission id (optionally scoped to a firm). */
  findSigningRequestByDocusealSubmissionId(
    submissionId: number,
    firmId?: string,
  ): Promise<SigningRequest | null>;

  listSigningEventsForRequest(signingRequestId: string): Promise<SigningEvent[]>;
  appendSigningEvent(ev: SigningEvent): Promise<void>;

  getAppSettings(firmId?: string): Promise<AppSettings | null>;
  upsertAppSettings(doc: AppSettings): Promise<void>;
}
