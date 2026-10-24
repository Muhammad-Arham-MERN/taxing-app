// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ

export type StatementType = "inflow" | "outflow";

export interface Statement {
  id: string;
  date: string;
  type: StatementType;
  nature: string;
  amount: number;
  remarks: string | null;
  fileName: string | null;
  fileRef: string | null;
  createdAt: string;
}

export type NewStatement = Omit<Statement, "id" | "createdAt">;

export interface BusinessProfile {
  brandName: string;
  location: string;
  contacts: string[];
}

export interface StatementFilter {
  from: string;
  to: string;
}

export interface StatementSummary {
  totalInflow: number;
  totalOutflow: number;
  balance: number;
}

/** A file's contents travelling with its name (FR-003). */
export interface AttachmentPayload {
  fileName: string;
  /** The browser-reported MIME type, so a downloaded copy keeps its type. */
  contentType?: string;
  bytes: Uint8Array;
}

/** What an edit does to a statement's attachment (FR-040, FR-041, FR-047). */
export type AttachmentChange =
  | { action: "keep" }
  | { action: "remove" }
  | { action: "replace"; fileName: string; contentType?: string; bytes: Uint8Array };

/** An edit: the statement's identity plus the values that may change (FR-039). */
export interface StatementUpdate {
  id: string;
  date: string;
  type: StatementType;
  nature: string;
  amount: number;
  remarks: string | null;
  attachment: AttachmentChange;
}

/** Where the practitioner has pointed the application (FR-013, FR-062). */
export interface StorageLocation {
  kind: "directory" | "file";
  path: string;
}

/** Why a remembered location cannot be used (FR-023, FR-025, FR-056). */
export type StorageProblem = "unreachable" | "not-a-store" | "damaged" | "unwritable";

/** The state the gate renders from (FR-015). */
export interface StorageState {
  chosen: boolean;
  location: StorageLocation | null;
  problem: StorageProblem | null;
}

/** What to do with the records already in use when a location changes (FR-019). */
export type CarryAcrossChoice = "bring" | "start-fresh";

/** A folder that would let the records leave this machine (FR-055). */
export type LocationRisk = "cloud-synced" | "network" | "removable";

/** The result of inspecting a candidate location before accepting it (FR-055, FR-059). */
export interface LocationAssessment {
  acceptable: boolean;
  warning: LocationRisk | null;
  rejection: string | null;
  isEmptyStore: boolean;
}

// ---- Bills and customers (Module 3) ---------------------------------------

/** A previously billed customer, remembered in the store (FR-066, FR-069). */
export interface Customer {
  name: string;
  address: string | null;
  contactPerson: string | null;
  contactNumber: string | null;
  email: string | null;
  ntn: string | null;
  password: string | null;
}

/**
 * A client in the contact book, identified by CNIC (client request).
 *
 * Contacts are lists: two different emails given for the same CNIC — here or on
 * another machine — both survive, while an identical value is stored once.
 */
export interface Client {
  cnic: string;
  name: string;
  company: string | null;
  /** The client's own password; carried onto a bill raised for them (client request). */
  password: string | null;
  phones: string[];
  whatsapps: string[];
  emails: string[];
}

/** One client's own entry — a row in the table opened from a client block. */
export interface ClientRecord {
  id: string;
  cnic: string;
  name: string;
  date: string;
  remarks: string | null;
  categoryId: string | null;
  fileName: string | null;
  createdAt: string;
}

/** A new record as entered on the form (id, file name and timestamp are assigned). */
export type NewClientRecord = Omit<ClientRecord, "id" | "createdAt" | "fileName">;

/** An edit: the record's identity plus the values that may change. */
export interface ClientRecordUpdate {
  id: string;
  name: string;
  date: string;
  remarks: string | null;
  categoryId: string | null;
  attachment: AttachmentChange;
}

// ---- Categories -----------------------------------------------------------

/** A named, coloured tag for a client's records (client request). */
export interface Category {
  id: string;
  name: string;
  color: string;
}

/** What a category form supplies; the store assigns the id. */
export interface CategoryInput {
  name: string;
  color: string;
}

/** One piece of work on a bill; `position` is the item number shown (FR-014). */
export interface BillItem {
  id: string;
  position: number;
  details: string;
  amount: number;
}

/** An item as entered on the form (no id or position yet). */
export interface NewBillItem {
  details: string;
  amount: number;
}

/** A stored bill with its customer and line items (FR-001). */
export interface Bill {
  id: string;
  invoiceNo: string;
  date: string;
  customer: Customer;
  jazzcashNumbers: string[];
  easypaisaNumbers: string[];
  accountHolder: string;
  items: BillItem[];
  total: number;
  createdAt: string;
}

/** A new bill as entered on the form (FR-005–FR-023). */
export interface NewBill {
  date: string;
  customer: Customer;
  jazzcashNumbers: string[];
  easypaisaNumbers: string[];
  accountHolder: string;
  items: NewBillItem[];
}

/** An edit: the bill's identity plus the values that may change (FR-047). */
export interface BillUpdate {
  id: string;
  date: string;
  customer: Customer;
  jazzcashNumbers: string[];
  easypaisaNumbers: string[];
  accountHolder: string;
  items: NewBillItem[];
}

/** The View Bills filter — both bounds and the customer are optional (FR-038). */
export interface BillFilter {
  from: string | null;
  to: string | null;
  customer: string | null;
}

/** A View Bills row, already carrying what the table shows (FR-064). */
export interface BillSummary {
  id: string;
  invoiceNo: string;
  date: string;
  customerName: string;
  details: string;
  total: number;
}

// ---- Cloud sync (Module 4) ------------------------------------------------

/** What a cloud action is doing right now, so the loader can be exact (R10). */
export type CloudPhase = "idle" | "pushing" | "pulling" | "reconnecting";

/** Whether the secrets are set up, and whether un-pushed changes exist (R4, R8). */
export interface CloudStatus {
  /** The secrets are present in the credential store. */
  configured: boolean;
  /** The local un-pushed marker. */
  hasUnpushed: boolean;
  lastPushedAt: string | null;
  phase: CloudPhase;
}

/** What setup still needs; the application is usable only when both are true (FR-005). */
export interface SetupState {
  /** A usable store has been chosen (Modules 1–3). */
  storageReady: boolean;
  /** The secrets are present in the credential store. */
  secretsReady: boolean;
}

/** The result of pasting an env file at onboarding (FR-044–FR-048). */
export interface SecretsPasteResult {
  ok: boolean;
  /** Required keys that were absent or unreadable. */
  missing: string[];
  /** Ready to show the practitioner. */
  message: string;
}

/** The result of proving the saved details reach the cloud (FR-005, FR-047). */
export interface SetupConnectResult {
  ok: boolean;
  kind: SyncOutcomeKind;
  /** Ready to show the practitioner. */
  message: string;
}

/** The one plain-language result of a Push or Sync (FR-033). */
export type SyncOutcomeKind =
  | "success"
  | "nothing-new"
  | "no-internet"
  | "secrets-unavailable"
  | "server-unavailable"
  | "other";

export interface SyncOutcome {
  kind: SyncOutcomeKind;
  /** Ready to show the practitioner. */
  message: string;
  /** Underlying detail for "other". */
  reason?: string | null;
}

/** The result of one Push or Sync (progress precedes it, FR-036/FR-037). */
export interface SyncResult {
  outcome: SyncOutcome;
  /** pull: did anything arrive? push: did anything send? */
  changed: boolean;
}

/** Turso Cloud storage headroom for the header gauge (FR-029–FR-032). */
export interface CloudUsage {
  usedBytes: number;
  allowanceBytes: number;
  remainingBytes: number;
}

/**
 * Oracle Object Storage usage for the header's file gauge. `allowanceBytes` and
 * `remainingBytes` are `null` unless a bucket allowance is configured, so the
 * gauge shows bytes used rather than inventing a headroom figure.
 * `pendingUploads` counts files cached on this machine whose bytes are not yet
 * in Oracle.
 */
export interface ObjectUsage {
  usedBytes: number;
  allowanceBytes: number | null;
  remainingBytes: number | null;
  pendingUploads: number;
}

/**
 * The result of the header's **Reconnect** action: a connectivity verdict plus
 * the refreshed storage figures. It never pushes or pulls — it only makes sure
 * this computer is pointed at the cloud and the gauges are current.
 */
export interface ReconnectResult {
  connected: boolean;
  /** True when a real network probe ran, so `connected` is a verified answer. */
  verified: boolean;
  message: string;
  usage: CloudUsage | null;
  objectUsage: ObjectUsage | null;
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
