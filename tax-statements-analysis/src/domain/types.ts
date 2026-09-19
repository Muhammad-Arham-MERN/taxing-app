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
  bytes: Uint8Array;
}

/** What an edit does to a statement's attachment (FR-040, FR-041, FR-047). */
export type AttachmentChange =
  | { action: "keep" }
  | { action: "remove" }
  | { action: "replace"; fileName: string; bytes: Uint8Array };

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

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
