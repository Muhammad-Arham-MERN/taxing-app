// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import type {
  AttachmentPayload,
  Bill,
  BillFilter,
  BillSummary,
  BillUpdate,
  BusinessProfile,
  CarryAcrossChoice,
  Category,
  CategoryInput,
  Client,
  ClientRecord,
  ClientRecordUpdate,
  CloudStatus,
  CloudUsage,
  Customer,
  LocationAssessment,
  NewBill,
  NewClientRecord,
  NewStatement,
  ObjectUsage,
  ReconnectResult,
  SecretsPasteResult,
  SetupConnectResult,
  SetupState,
  Statement,
  StatementFilter,
  StatementUpdate,
  StorageState,
  SyncResult,
  TransferProgress,
} from "@/domain/types";

export class ValidationError extends Error {
  readonly fields: Record<string, string>;

  constructor(fields: Record<string, string>) {
    super("The statement failed validation.");
    this.name = "ValidationError";
    this.fields = fields;
  }
}

export class DuplicateSubmissionError extends Error {
  constructor() {
    super("An identical statement submission is already in progress.");
    this.name = "DuplicateSubmissionError";
  }
}

export class InvalidRangeError extends Error {
  constructor() {
    super("The From date must be on or before the To date.");
    this.name = "InvalidRangeError";
  }
}

export class UnknownStatementError extends Error {
  constructor() {
    super("That statement no longer exists.");
    this.name = "UnknownStatementError";
  }
}

export class AttachmentWriteFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttachmentWriteFailedError";
  }
}

export class AttachmentOpenFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttachmentOpenFailedError";
  }
}

export class StoreWriteFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoreWriteFailedError";
  }
}

export class NotAStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotAStoreError";
  }
}

export class LocationUnreachableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LocationUnreachableError";
  }
}

export class StoreDamagedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoreDamagedError";
  }
}

export class LocationUnwritableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LocationUnwritableError";
  }
}

export class NoStorageLocationError extends Error {
  constructor(message = "Choose where your records should be kept first.") {
    super(message);
    this.name = "NoStorageLocationError";
  }
}

/** A move that stopped part-way. Safe to run again: existing records are skipped. */
export class CarryAcrossInterruptedError extends Error {
  readonly copied: number;
  readonly remaining: number;

  constructor(message: string, copied: number, remaining: number) {
    super(message);
    this.name = "CarryAcrossInterruptedError";
    this.copied = copied;
    this.remaining = remaining;
  }
}

export interface StatementRepository {
  /** Record a statement, with its file's contents when one was attached (FR-001–FR-003). */
  create(input: NewStatement, attachment?: AttachmentPayload | null): Promise<Statement>;

  /** Statements dated inside the range, inclusive, newest first (FR-027). */
  findByDateRange(filter: StatementFilter): Promise<Statement[]>;

  listAll(): Promise<Statement[]>;

  /** Correct a stored statement in place — never a second record (FR-042). */
  update(update: StatementUpdate): Promise<Statement>;

  /** Delete a statement and its attachment (client request). */
  remove(id: string): Promise<void>;

  /**
   * Hand the file to the operating system so it opens in the preferred app
   * (FR-065). The file itself never crosses into the frontend: only the
   * statement's id goes the other way (FR-036, FR-037).
   */
  openAttachment(statementId: string): Promise<void>;

  /** Save a copy wherever the practitioner chooses (FR-072). */
  saveAttachmentCopy(statementId: string): Promise<string | null>;
}

export interface StorageRepository {
  /** Drives the gate and the unusable-location states (FR-013–FR-015). */
  getState(): Promise<StorageState>;

  /** Open the operating system's folder picker. `null` means cancelled (FR-014). */
  pickDirectory(): Promise<string | null>;

  /** Open the operating system's file picker to point at an existing store (FR-057). */
  pickStoreFile(): Promise<string | null>;

  /** Judge a candidate before accepting it (FR-055, FR-059). */
  assess(kind: "directory" | "file", path: string): Promise<LocationAssessment>;

  /** Commit the choice, deciding what happens to the records already in use (FR-019). */
  setLocation(
    kind: "directory" | "file",
    path: string,
    carryAcross: CarryAcrossChoice,
  ): Promise<StorageState>;
}

/**
 * Kept only so Module 1's existing suite still compiles while the frontend
 * migration completes. The header's details are fixed and not stored (FR-053),
 * so nothing in the running application uses this.
 */
export interface BusinessProfileRepository {
  get(): Promise<BusinessProfile>;
  save(profile: BusinessProfile): Promise<BusinessProfile>;
}

// ---- Bills and customers (Module 3) ---------------------------------------

export class UnknownBillError extends Error {
  constructor(message = "That bill no longer exists.") {
    super(message);
    this.name = "UnknownBillError";
  }
}

export class UnknownClientError extends Error {
  constructor(message = "That client no longer exists.") {
    super(message);
    this.name = "UnknownClientError";
  }
}

export class UnknownCategoryError extends Error {
  constructor(message = "That category no longer exists.") {
    super(message);
    this.name = "UnknownCategoryError";
  }
}

export class UnknownRecordError extends Error {
  constructor(message = "That record no longer exists.") {
    super(message);
    this.name = "UnknownRecordError";
  }
}

export class InvoiceWriteFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvoiceWriteFailedError";
  }
}

export class InvoiceOpenFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvoiceOpenFailedError";
  }
}

export interface BillRepository {
  /** Compose a bill; resolves once stored, with its invoice number and items (FR-022). */
  create(input: NewBill): Promise<Bill>;

  /** Bills matching the optional date range and optional customer, newest first (FR-038–FR-041). */
  list(filter: BillFilter): Promise<BillSummary[]>;

  /** One stored bill with its customer and line items (FR-044). */
  get(id: string): Promise<Bill>;

  /** Correct a bill in place, keeping its identity and invoice number (FR-048). */
  update(update: BillUpdate): Promise<Bill>;

  /** Delete a bill and its line items (FR-053, FR-054). */
  remove(id: string): Promise<void>;

  /** Hand a rendered invoice PDF to the system's default PDF application (FR-034). */
  openInvoice(bytes: Uint8Array, fileName: string): Promise<void>;

  /** Save a rendered invoice PDF wherever the practitioner chooses (FR-035). */
  saveInvoiceCopy(bytes: Uint8Array, fileName: string): Promise<string | null>;
}

/**
 * Customers are remembered as a side effect of saving a bill (FR-066) and are
 * never deleted (FR-069). There is no create or remove; their own details are
 * edited from the customer popup in View Bills (client change, 2026-09-19).
 */
export interface CustomerRepository {
  /** Every remembered customer, for the View Bills filter (FR-065). */
  list(): Promise<Customer[]>;

  /** Save a customer's own details from the customer popup (client change, 2026-09-19). */
  update(customer: Customer): Promise<Customer>;
}

/**
 * The contact book (client request). A client is identified by CNIC, and saving
 * the same CNIC again merges: the name stays as first written and each new
 * contact value joins the list.
 */
export interface ClientRepository {
  /** Record a client, merging into the one already held under that CNIC. */
  create(input: Client): Promise<Client>;

  /**
   * Correct a stored client in place (the edit behind a client block). Unlike
   * `create`, this replaces the client's own details and contacts outright.
   */
  update(input: Client): Promise<Client>;

  /** Every client, for the View tab and the bill form's picker. */
  list(): Promise<Client[]>;

  /** Remove a client and every contact value recorded for them. */
  remove(cnic: string): Promise<void>;
}

/**
 * Categories (client request): one global, named, coloured tag list shared by
 * clients and their records. Deleting a category only clears the tag from
 * anything filed under it.
 */
export interface CategoryRepository {
  list(): Promise<Category[]>;
  create(input: CategoryInput): Promise<Category>;
  update(id: string, input: CategoryInput): Promise<Category>;
  remove(id: string): Promise<void>;
}

/**
 * A client's own records (client request): the rows behind the table opened from
 * a client block. Each may carry one file, whose bytes never cross into the
 * frontend — only the record's id goes the other way.
 */
export interface ClientRecordRepository {
  /** Every record belonging to one client, newest first. */
  list(cnic: string): Promise<ClientRecord[]>;

  /** Record an entry, with its file's contents when one was attached. */
  create(input: NewClientRecord, attachment?: AttachmentPayload | null): Promise<ClientRecord>;

  /** Correct a record in place; the file may be kept, removed or replaced. */
  update(update: ClientRecordUpdate): Promise<ClientRecord>;

  /** Delete a record and its file. */
  remove(id: string): Promise<void>;

  /** Hand the record's file to the operating system so it opens in the preferred app. */
  openFile(id: string): Promise<void>;

  /** Save a copy of the record's file wherever the practitioner chooses. */
  saveFileCopy(id: string): Promise<string | null>;
}

// ---- Cloud sync (Module 4) ------------------------------------------------

/** Windows Credential Manager could not be read or written (FR-046, FR-047). */
export class SecretsStoreUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretsStoreUnavailableError";
  }
}

/** The file's bytes are not on this machine and could not be fetched from Oracle. */
export class ObjectStorageUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ObjectStorageUnavailableError";
  }
}

/** Oracle Object Storage is not configured on this computer. */
export class ObjectStorageNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ObjectStorageNotConfiguredError";
  }
}

export interface CloudRepository {
  /** Secrets configured + un-pushed marker. Never touches the network (R4, R8). */
  status(): Promise<CloudStatus>;

  /** Publish this computer's changes to the central copy (FR-006–FR-012). */
  push(): Promise<SyncResult>;

  /** Bring the other computers' changes down (FR-013–FR-020). */
  pull(): Promise<SyncResult>;

  /** Cloud storage headroom for the header gauge, or null when unavailable (FR-029–FR-032). */
  usage(): Promise<CloudUsage | null>;

  /** Oracle Object Storage usage for the file gauge, or null when unavailable. */
  objectUsage(): Promise<ObjectUsage | null>;

  /**
   * The header's Reconnect action: make sure this computer is pointed at the
   * cloud and refresh the storage figures. Never pushes or pulls.
   */
  reconnect(): Promise<ReconnectResult>;

  /**
   * Subscribe to automatic-pull notifications (R9). Returns an unsubscribe
   * function; the handler fires only when a background pull changed something.
   */
  onPulled(handler: () => void): () => void;

  /**
   * Subscribe to per-file transfer progress. The handler fires as a file's bytes
   * move in either direction, so a loader can be shown beside the affected row
   * (purple for an upload, green for a download). Returns an unsubscribe
   * function.
   */
  onTransfer(handler: (progress: TransferProgress) => void): () => void;
}

export interface SetupRepository {
  /** What setup still needs: a usable store and the secrets (FR-005). */
  state(): Promise<SetupState>;

  /** Parse the partner's env file and save the required values (FR-044–FR-048). */
  saveSecrets(text: string): Promise<SecretsPasteResult>;

  /**
   * Prove the saved details reach the cloud, and switch the store to the synced
   * engine on success. The application becomes usable only after this passes
   * (FR-005, FR-047).
   */
  connect(): Promise<SetupConnectResult>;
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
