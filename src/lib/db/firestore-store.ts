import { getFirestore, type Firestore, type CollectionReference } from "firebase-admin/firestore";
import { getFirebaseAdminApp } from "@/lib/firebase/admin-app";
import { DEFAULT_FIRM_ID, LEGACY_SETTINGS_ID, belongsToFirm } from "@/lib/firm-scope";
import type { AppSettings, Firm, FirmSecrets, Lead, SigningEvent, SigningRequest } from "@/types/models";
import type { SignFlowStore, StoreSnapshot } from "./store-types";

function col<T extends Record<string, unknown>>(db: Firestore, name: string): CollectionReference<T> {
  return db.collection(name) as CollectionReference<T>;
}

export class FirestoreSignFlowStore implements SignFlowStore {
  isMock = false;
  private db: Firestore;

  constructor() {
    const app = getFirebaseAdminApp();
    const databaseId = process.env.FIRESTORE_DATABASE_ID?.trim();
    this.db = databaseId ? getFirestore(app, databaseId) : getFirestore(app);
  }

  async snapshot(): Promise<StoreSnapshot> {
    const [leads, signingRequests, signingEvents, appSettings] = await Promise.all([
      this.listLeads(),
      this.listSigningRequests(),
      this.allSigningEvents(),
      this.getAppSettings(),
    ]);
    return { leads, signingRequests, signingEvents, appSettings };
  }

  private async allSigningEvents(): Promise<SigningEvent[]> {
    const snap = await this.db.collection("signingEvents").orderBy("timestamp", "desc").limit(500).get();
    return snap.docs.map((d) => d.data() as SigningEvent);
  }

  async listFirms(): Promise<Firm[]> {
    const snap = await col<Firm>(this.db, "firms").get();
    const rows = snap.docs.map((d) => d.data() as Firm);
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return rows;
  }

  async getFirm(id: string): Promise<Firm | null> {
    const doc = await col<Firm>(this.db, "firms").doc(id).get();
    return doc.exists ? (doc.data() as Firm) : null;
  }

  async upsertFirm(doc: Firm): Promise<void> {
    await col<Firm>(this.db, "firms").doc(doc.id).set(doc, { merge: true });
  }

  async deleteFirm(id: string): Promise<void> {
    const batch = this.db.batch();
    batch.delete(col<Firm>(this.db, "firms").doc(id));
    batch.delete(col<FirmSecrets>(this.db, "firmSecrets").doc(id));
    await batch.commit();
  }

  async getFirmSecrets(firmId: string): Promise<FirmSecrets | null> {
    const doc = await col<FirmSecrets>(this.db, "firmSecrets").doc(firmId).get();
    return doc.exists ? (doc.data() as FirmSecrets) : null;
  }

  async upsertFirmSecrets(doc: FirmSecrets): Promise<void> {
    await col<FirmSecrets>(this.db, "firmSecrets").doc(doc.firmId).set(doc, { merge: true });
  }

  async getLead(id: string): Promise<Lead | null> {
    const doc = await col<Lead>(this.db, "leads").doc(id).get();
    return doc.exists ? (doc.data() as Lead) : null;
  }

  async listLeads(): Promise<Lead[]> {
    const snap = await col<Lead>(this.db, "leads").orderBy("createdAt", "desc").get();
    return snap.docs.map((d) => d.data() as Lead);
  }

  async getLeadsByIds(ids: string[]): Promise<Lead[]> {
    const unique = [...new Set(ids)];
    if (!unique.length) return [];
    const leadsCol = col<Lead>(this.db, "leads");
    const leads: Lead[] = [];
    for (let i = 0; i < unique.length; i += 100) {
      const chunk = unique.slice(i, i + 100);
      const refs = chunk.map((id) => leadsCol.doc(id));
      const snaps = await this.db.getAll(...refs);
      for (const snap of snaps) {
        if (snap.exists) leads.push(snap.data() as Lead);
      }
    }
    return leads;
  }

  async upsertLead(doc: Lead): Promise<void> {
    await col<Lead>(this.db, "leads").doc(doc.id).set(doc, { merge: true });
  }

  async getSigningRequest(id: string): Promise<SigningRequest | null> {
    const doc = await col<SigningRequest>(this.db, "signingRequests").doc(id).get();
    return doc.exists ? (doc.data() as SigningRequest) : null;
  }

  async listSigningRequests(): Promise<SigningRequest[]> {
    const snap = await col<SigningRequest>(this.db, "signingRequests").orderBy("updatedAt", "desc").get();
    return snap.docs.map((d) => d.data() as SigningRequest);
  }

  async upsertSigningRequest(doc: SigningRequest): Promise<void> {
    await col<SigningRequest>(this.db, "signingRequests").doc(doc.id).set(doc, { merge: true });
  }

  async purgeSigningRequest(signingRequestId: string): Promise<void> {
    const eventsSnap = await this.db
      .collection("signingEvents")
      .where("signingRequestId", "==", signingRequestId)
      .get();
    const batch = this.db.batch();
    for (const doc of eventsSnap.docs) {
      batch.delete(doc.ref);
    }
    batch.delete(col<SigningRequest>(this.db, "signingRequests").doc(signingRequestId));
    await batch.commit();
  }

  async findSigningRequestByDocusealSubmissionId(
    submissionId: number,
    firmId?: string,
  ): Promise<SigningRequest | null> {
    const snap = await this.db
      .collection("signingRequests")
      .where("docusealSubmissionId", "==", submissionId)
      .limit(20)
      .get();
    if (snap.empty) return null;
    const rows = snap.docs.map((d) => d.data() as SigningRequest);
    if (firmId) return rows.find((r) => belongsToFirm(r, firmId)) ?? null;
    return rows[0] ?? null;
  }

  async listSigningEventsForRequest(signingRequestId: string): Promise<SigningEvent[]> {
    const snap = await this.db
      .collection("signingEvents")
      .where("signingRequestId", "==", signingRequestId)
      .get();
    const rows = snap.docs.map((d) => d.data() as SigningEvent);
    rows.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return rows;
  }

  async appendSigningEvent(ev: SigningEvent): Promise<void> {
    await col<SigningEvent>(this.db, "signingEvents").doc(ev.id).set(ev);
  }

  async getAppSettings(firmId?: string): Promise<AppSettings | null> {
    const id = firmId?.trim() || DEFAULT_FIRM_ID;
    const doc = await col<AppSettings>(this.db, "appSettings").doc(id).get();
    if (doc.exists) {
      return { ...(doc.data() as AppSettings), id };
    }
    if (id === DEFAULT_FIRM_ID) {
      const legacy = await col<AppSettings>(this.db, "appSettings").doc(LEGACY_SETTINGS_ID).get();
      if (legacy.exists) return { ...(legacy.data() as AppSettings), id: DEFAULT_FIRM_ID };
    }
    return null;
  }

  async upsertAppSettings(doc: AppSettings): Promise<void> {
    const id = !doc.id || doc.id === LEGACY_SETTINGS_ID ? DEFAULT_FIRM_ID : doc.id;
    await col<AppSettings>(this.db, "appSettings").doc(id).set({ ...doc, id }, { merge: true });
  }
}

let firestoreSingleton: FirestoreSignFlowStore | null = null;

export function getFirestoreStore(): FirestoreSignFlowStore {
  if (!firestoreSingleton) firestoreSingleton = new FirestoreSignFlowStore();
  return firestoreSingleton;
}

export function canUseFirestoreAdmin(): boolean {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY,
  );
}
