import type { AppSettings, Firm, FirmSecrets, Lead, SigningEvent, SigningRequest } from "@/types/models";
import { DEFAULT_FIRM_ID, LEGACY_SETTINGS_ID, belongsToFirm } from "@/lib/firm-scope";
import type { SignFlowStore, StoreSnapshot } from "./store-types";

function sortByDesc<T>(arr: T[], key: keyof T): T[] {
  return [...arr].sort((a, b) => (String(b[key]) < String(a[key]) ? -1 : 1));
}

export class InMemorySignFlowStore implements SignFlowStore {
  isMock = true;

  leads = new Map<string, Lead>();
  signingRequests = new Map<string, SigningRequest>();
  signingEvents = new Map<string, SigningEvent>();
  firms = new Map<string, Firm>();
  firmSecrets = new Map<string, FirmSecrets>();
  appSettingsByFirm = new Map<string, AppSettings>();

  async snapshot(): Promise<StoreSnapshot> {
    return {
      leads: sortByDesc([...this.leads.values()], "createdAt"),
      signingRequests: sortByDesc([...this.signingRequests.values()], "updatedAt"),
      signingEvents: sortByDesc([...this.signingEvents.values()], "timestamp"),
      appSettings: this.appSettingsByFirm.get(DEFAULT_FIRM_ID) ?? null,
    };
  }

  async listFirms(): Promise<Firm[]> {
    return [...this.firms.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async getFirm(id: string): Promise<Firm | null> {
    return this.firms.get(id) ?? null;
  }

  async upsertFirm(doc: Firm): Promise<void> {
    this.firms.set(doc.id, doc);
  }

  async deleteFirm(id: string): Promise<void> {
    this.firms.delete(id);
    this.firmSecrets.delete(id);
    this.appSettingsByFirm.delete(id);
  }

  async getFirmSecrets(firmId: string): Promise<FirmSecrets | null> {
    return this.firmSecrets.get(firmId) ?? null;
  }

  async upsertFirmSecrets(doc: FirmSecrets): Promise<void> {
    this.firmSecrets.set(doc.firmId, doc);
  }

  async getLead(id: string): Promise<Lead | null> {
    return this.leads.get(id) ?? null;
  }

  async listLeads(): Promise<Lead[]> {
    return sortByDesc([...this.leads.values()], "createdAt");
  }

  async getLeadsByIds(ids: string[]): Promise<Lead[]> {
    const out: Lead[] = [];
    for (const id of new Set(ids)) {
      const lead = this.leads.get(id);
      if (lead) out.push(lead);
    }
    return out;
  }

  async upsertLead(doc: Lead): Promise<void> {
    this.leads.set(doc.id, doc);
  }

  async getSigningRequest(id: string): Promise<SigningRequest | null> {
    return this.signingRequests.get(id) ?? null;
  }

  async listSigningRequests(): Promise<SigningRequest[]> {
    return sortByDesc([...this.signingRequests.values()], "updatedAt");
  }

  async upsertSigningRequest(doc: SigningRequest): Promise<void> {
    this.signingRequests.set(doc.id, doc);
  }

  async purgeSigningRequest(signingRequestId: string): Promise<void> {
    this.signingRequests.delete(signingRequestId);
    for (const [id, ev] of this.signingEvents) {
      if (ev.signingRequestId === signingRequestId) this.signingEvents.delete(id);
    }
  }

  async findSigningRequestByDocusealSubmissionId(
    submissionId: number,
    firmId?: string,
  ): Promise<SigningRequest | null> {
    for (const r of this.signingRequests.values()) {
      if (r.docusealSubmissionId !== submissionId) continue;
      if (firmId && !belongsToFirm(r, firmId)) continue;
      return r;
    }
    return null;
  }

  async listSigningEventsForRequest(signingRequestId: string): Promise<SigningEvent[]> {
    return sortByDesc(
      [...this.signingEvents.values()].filter((e) => e.signingRequestId === signingRequestId),
      "timestamp",
    );
  }

  async appendSigningEvent(ev: SigningEvent): Promise<void> {
    this.signingEvents.set(ev.id, ev);
  }

  async getAppSettings(firmId?: string): Promise<AppSettings | null> {
    const id = firmId?.trim() || DEFAULT_FIRM_ID;
    const row = this.appSettingsByFirm.get(id);
    if (row) return row;
    if (id === DEFAULT_FIRM_ID) return this.appSettingsByFirm.get(LEGACY_SETTINGS_ID) ?? null;
    return null;
  }

  async upsertAppSettings(doc: AppSettings): Promise<void> {
    const id = !doc.id || doc.id === LEGACY_SETTINGS_ID ? DEFAULT_FIRM_ID : doc.id;
    this.appSettingsByFirm.set(id, { ...doc, id });
  }
}

let memorySingleton: InMemorySignFlowStore | null = null;

export function getMemoryStore(): InMemorySignFlowStore {
  if (!memorySingleton) memorySingleton = new InMemorySignFlowStore();
  return memorySingleton;
}
