// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
/**
 * The in-memory implementation of the seam.
 *
 * It is **only** used by tests. The running application injects
 * `src/data/tauri.ts` instead. It exists so Module 1's suite still has something
 * to exercise, and it does the minimum needed to satisfy the widened interfaces.
 */
import type { ZodError } from "zod";
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
  ObjectUsage,
  ReconnectResult,
  Customer,
  LocationAssessment,
  NewBill,
  NewClientRecord,
  NewStatement,
  SecretsPasteResult,
  SetupConnectResult,
  SetupState,
  Statement,
  StatementFilter,
  StatementUpdate,
  StorageState,
  SyncOutcome,
  SyncResult,
} from "@/domain/types";
import { newStatementSchema } from "@/domain/validation";
import {
  DuplicateSubmissionError,
  InvalidRangeError,
  UnknownBillError,
  UnknownCategoryError,
  UnknownClientError,
  UnknownRecordError,
  UnknownStatementError,
  ValidationError,
  type BillRepository,
  type BusinessProfileRepository,
  type CategoryRepository,
  type ClientRecordRepository,
  type ClientRepository,
  type CloudRepository,
  type CustomerRepository,
  type SetupRepository,
  type StatementRepository,
  type StorageRepository,
} from "@/data/repositories";

export const DEFAULT_BUSINESS_PROFILE: BusinessProfile = {
  brandName: "M&M Tax Law Solutions",
  location: "Office no 8, 1st Floor, Pounch House Complex, Adam Jee Road, Rawalpindi",
  contacts: ["+92 334-5739614", "+92 312-5739614", "051-5910021"],
};

export interface Repositories {
  statements: StatementRepository;
  storage: StorageRepository;
  bills: BillRepository;
  customers: CustomerRepository;
  clients: ClientRepository;
  categories: CategoryRepository;
  clientRecords: ClientRecordRepository;
  businessProfile: BusinessProfileRepository;
  cloud: CloudRepository;
  setup: SetupRepository;
}

function createStatementId(): string {
  const cryptoRef = globalThis.crypto;
  if (cryptoRef && typeof cryptoRef.randomUUID === "function") {
    return cryptoRef.randomUUID();
  }
  return `stmt-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function cloneProfile(profile: BusinessProfile): BusinessProfile {
  return { ...profile, contacts: [...profile.contacts] };
}

function fingerprintOf(input: NewStatement): string {
  return [
    input.date,
    input.type,
    input.nature,
    input.amount,
    input.remarks ?? "",
    input.fileName ?? "",
  ].join("|");
}

function byNewestFirst(a: Statement, b: Statement): number {
  if (a.date !== b.date) {
    return a.date < b.date ? 1 : -1;
  }
  return a.createdAt < b.createdAt ? 1 : -1;
}

function toFieldErrors(error: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "form";
    if (!fields[key]) {
      fields[key] = issue.message;
    }
  }
  return fields;
}

export class InMemoryStatementRepository implements StatementRepository {
  private readonly statements: Statement[] = [];
  private readonly files = new Map<string, AttachmentPayload>();
  private readonly pending = new Set<string>();

  // وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
  async create(
    input: NewStatement,
    attachment?: AttachmentPayload | null,
  ): Promise<Statement> {
    const parsed = newStatementSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(toFieldErrors(parsed.error));
    }

    const fingerprint = fingerprintOf(input);
    if (this.pending.has(fingerprint)) {
      throw new DuplicateSubmissionError();
    }
    this.pending.add(fingerprint);

    try {
      // Yield once so a concurrent identical submission sees the guard above
      // before this one commits its record.
      await Promise.resolve();

      const values = parsed.data;
      const id = createStatementId();
      const statement: Statement = {
        id,
        date: values.date,
        type: values.type,
        nature: values.nature,
        amount: values.amount,
        remarks: values.remarks ?? null,
        fileName: attachment?.fileName ?? values.fileName ?? null,
        fileRef: values.fileRef ?? null,
        createdAt: new Date().toISOString(),
      };

      if (attachment) {
        this.files.set(id, attachment);
      }
      this.statements.push(statement);
      return statement;
    } finally {
      this.pending.delete(fingerprint);
    }
  }

  async findByDateRange(filter: StatementFilter): Promise<Statement[]> {
    if (filter.from > filter.to) {
      throw new InvalidRangeError();
    }
    return this.statements
      .filter((statement) => statement.date >= filter.from && statement.date <= filter.to)
      .sort(byNewestFirst);
  }

  async listAll(): Promise<Statement[]> {
    return [...this.statements].sort(byNewestFirst);
  }

  async update(update: StatementUpdate): Promise<Statement> {
    const index = this.statements.findIndex((statement) => statement.id === update.id);
    if (index === -1) {
      throw new UnknownStatementError();
    }

    const existing = this.statements[index];
    let fileName = existing.fileName;

    switch (update.attachment.action) {
      case "keep":
        break;
      case "remove":
        this.files.delete(update.id);
        fileName = null;
        break;
      case "replace":
        this.files.set(update.id, {
          fileName: update.attachment.fileName,
          bytes: update.attachment.bytes,
        });
        fileName = update.attachment.fileName;
        break;
    }

    const updated: Statement = {
      ...existing,
      date: update.date,
      type: update.type,
      nature: update.nature,
      amount: update.amount,
      remarks: update.remarks,
      fileName,
    };
    this.statements[index] = updated;
    return updated;
  }

  async remove(id: string): Promise<void> {
    const index = this.statements.findIndex((statement) => statement.id === id);
    if (index === -1) {
      throw new UnknownStatementError();
    }
    this.statements.splice(index, 1);
    this.files.delete(id);
  }

  /** The fixture has no operating system to hand a file to. */
  async openAttachment(): Promise<void> {}

  /** Nor a save prompt, so nothing is written. */
  async saveAttachmentCopy(): Promise<string | null> {
    return null;
  }
}

export class InMemoryStorageRepository implements StorageRepository {
  private location: StorageState["location"] = {
    kind: "directory",
    path: "(in memory)",
  };

  /**
   * Reported as already chosen, so tests that render the application see the
   * statements UI rather than the first-run gate.
   */
  async getState(): Promise<StorageState> {
    return { chosen: true, location: this.location, problem: null };
  }

  async pickDirectory(): Promise<string | null> {
    return null;
  }

  async pickStoreFile(): Promise<string | null> {
    return null;
  }

  async assess(): Promise<LocationAssessment> {
    return {
      acceptable: true,
      warning: null,
      rejection: null,
      isEmptyStore: false,
    };
  }

  async setLocation(
    kind: "directory" | "file",
    path: string,
    _carryAcross: CarryAcrossChoice,
  ): Promise<StorageState> {
    this.location = { kind, path };
    return { chosen: true, location: this.location, problem: null };
  }
}

export class InMemoryBusinessProfileRepository implements BusinessProfileRepository {
  private profile: BusinessProfile;

  constructor(initial: BusinessProfile = DEFAULT_BUSINESS_PROFILE) {
    this.profile = cloneProfile(initial);
  }

  async get(): Promise<BusinessProfile> {
    return cloneProfile(this.profile);
  }

  async save(profile: BusinessProfile): Promise<BusinessProfile> {
    this.profile = cloneProfile(profile);
    return cloneProfile(this.profile);
  }
}

// ---- Bills and customers (Module 3) ---------------------------------------

function validateNewBill(input: NewBill): Record<string, string> {
  const fields: Record<string, string> = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    fields.date = "Choose a valid date.";
  }
  if (!input.customer.name.trim()) {
    fields.customerName = "Enter the customer's name.";
  }
  if (input.items.length === 0) {
    fields.items = "Add at least one item to the bill.";
  }
  input.items.forEach((item, index) => {
    if (!item.details.trim()) {
      fields[`items.${index}.details`] = "Enter the details for this item.";
    }
    if (!Number.isFinite(item.amount) || item.amount <= 0) {
      fields[`items.${index}.amount`] = "Enter an amount greater than zero.";
    }
  });
  return fields;
}

function cloneBill(bill: Bill): Bill {
  return {
    ...bill,
    customer: { ...bill.customer },
    jazzcashNumbers: [...bill.jazzcashNumbers],
    easypaisaNumbers: [...bill.easypaisaNumbers],
    items: bill.items.map((item) => ({ ...item })),
  };
}

function billId(): string {
  const cryptoRef = globalThis.crypto;
  if (cryptoRef && typeof cryptoRef.randomUUID === "function") {
    return cryptoRef.randomUUID();
  }
  return `bill-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function byNewestBillFirst(a: BillSummary, b: BillSummary): number {
  if (a.date !== b.date) {
    return a.date < b.date ? 1 : -1;
  }
  return a.invoiceNo < b.invoiceNo ? 1 : -1;
}

/**
 * Remembered customers. The bill repository writes into it whenever a bill is
 * saved, which is what implements FR-066 without a "manage customers" screen.
 */
export class InMemoryCustomerRepository implements CustomerRepository {
  /** Keyed by the lower-cased name, so identity is case-insensitive (FR-068). */
  readonly byKey = new Map<string, Customer>();

  async list(): Promise<Customer[]> {
    return [...this.byKey.values()].sort((a, b) =>
      a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1,
    );
  }

  async update(customer: Customer): Promise<Customer> {
    this.remember(customer);
    return { ...customer };
  }

  remember(customer: Customer): void {
    this.byKey.set(customer.name.toLowerCase(), { ...customer });
  }
}

/** Add each value once, case-insensitively, ignoring blanks (the store's merge). */
function unionContacts(...lists: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of lists.flat()) {
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

/** The contact book. The merge matches the store's: first name wins, contacts union. */
export class InMemoryClientRepository implements ClientRepository {
  private readonly byCnic = new Map<string, Client>();

  async create(input: Client): Promise<Client> {
    const key = input.cnic.trim().toLowerCase();
    const existing = this.byCnic.get(key);
    const merged: Client = existing
      ? {
          ...existing,
          company: existing.company ?? input.company,
          password: existing.password ?? input.password,
          phones: unionContacts(existing.phones, input.phones),
          whatsapps: unionContacts(existing.whatsapps, input.whatsapps),
          emails: unionContacts(existing.emails, input.emails),
        }
      : {
          cnic: input.cnic.trim(),
          name: input.name.trim(),
          company: input.company,
          password: input.password,
          phones: unionContacts(input.phones),
          whatsapps: unionContacts(input.whatsapps),
          emails: unionContacts(input.emails),
        };
    this.byCnic.set(key, merged);
    return { ...merged };
  }

  /** A true replace, matching the store's `update_within` (a removed number disappears). */
  async update(input: Client): Promise<Client> {
    const key = input.cnic.trim().toLowerCase();
    if (!this.byCnic.has(key)) {
      throw new UnknownClientError();
    }
    const replaced: Client = {
      cnic: input.cnic.trim(),
      name: input.name.trim(),
      company: input.company,
      password: input.password,
      phones: unionContacts(input.phones),
      whatsapps: unionContacts(input.whatsapps),
      emails: unionContacts(input.emails),
    };
    this.byCnic.set(key, replaced);
    return { ...replaced };
  }

  async list(): Promise<Client[]> {
    return [...this.byCnic.values()]
      .map((client) => ({ ...client }))
      .sort((a, b) => (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1));
  }

  async remove(cnic: string): Promise<void> {
    this.byCnic.delete(cnic.trim().toLowerCase());
  }
}

/** The global category list. Deleting one clears the tag from clients and records. */
export class InMemoryCategoryRepository implements CategoryRepository {
  private readonly items: Category[] = [];

  async list(): Promise<Category[]> {
    return this.items
      .map((category) => ({ ...category }))
      .sort((a, b) => (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1));
  }

  async create(input: CategoryInput): Promise<Category> {
    const taken = new Set(this.items.map((category) => category.name.toLowerCase()));
    if (taken.has(input.name.trim().toLowerCase())) {
      throw new ValidationError({ name: "A category with that name already exists." });
    }
    const category: Category = {
      id: `category-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
      name: input.name.trim(),
      color: input.color,
    };
    this.items.push(category);
    return { ...category };
  }

  async update(id: string, input: CategoryInput): Promise<Category> {
    const index = this.items.findIndex((category) => category.id === id);
    if (index === -1) {
      throw new UnknownCategoryError();
    }
    const taken = this.items.some(
      (category) =>
        category.id !== id && category.name.toLowerCase() === input.name.trim().toLowerCase(),
    );
    if (taken) {
      throw new ValidationError({ name: "A category with that name already exists." });
    }
    const updated: Category = { id, name: input.name.trim(), color: input.color };
    this.items[index] = updated;
    return { ...updated };
  }

  async remove(id: string): Promise<void> {
    const index = this.items.findIndex((category) => category.id === id);
    if (index === -1) {
      throw new UnknownCategoryError();
    }
    this.items.splice(index, 1);
  }
}

/** A client's own records. Not wired to the client book's own list, which is fine for tests. */
export class InMemoryClientRecordRepository implements ClientRecordRepository {
  private readonly records: ClientRecord[] = [];
  private readonly files = new Map<string, AttachmentPayload>();

  async list(cnic: string): Promise<ClientRecord[]> {
    return this.records
      .filter((record) => record.cnic.toLowerCase() === cnic.trim().toLowerCase())
      .map((record) => ({ ...record }))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.createdAt < b.createdAt ? 1 : -1));
  }

  async create(
    input: NewClientRecord,
    attachment?: AttachmentPayload | null,
  ): Promise<ClientRecord> {
    const id = `record-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
    const record: ClientRecord = {
      id,
      cnic: input.cnic.trim(),
      name: input.name.trim(),
      date: input.date,
      remarks: input.remarks,
      categoryId: input.categoryId,
      fileName: attachment?.fileName ?? null,
      createdAt: new Date().toISOString(),
    };
    if (attachment) {
      this.files.set(id, attachment);
    }
    this.records.push(record);
    return { ...record };
  }

  async update(update: ClientRecordUpdate): Promise<ClientRecord> {
    const index = this.records.findIndex((record) => record.id === update.id);
    if (index === -1) {
      throw new UnknownRecordError();
    }
    let fileName = this.records[index].fileName;
    switch (update.attachment.action) {
      case "keep":
        break;
      case "remove":
        this.files.delete(update.id);
        fileName = null;
        break;
      case "replace":
        this.files.set(update.id, {
          fileName: update.attachment.fileName,
          bytes: update.attachment.bytes,
        });
        fileName = update.attachment.fileName;
        break;
    }
    const updated: ClientRecord = {
      ...this.records[index],
      name: update.name.trim(),
      date: update.date,
      remarks: update.remarks,
      categoryId: update.categoryId,
      fileName,
    };
    this.records[index] = updated;
    return { ...updated };
  }

  async remove(id: string): Promise<void> {
    const index = this.records.findIndex((record) => record.id === id);
    if (index === -1) {
      throw new UnknownRecordError();
    }
    this.records.splice(index, 1);
    this.files.delete(id);
  }

  /** The fixture has no operating system to hand a file to. */
  async openFile(): Promise<void> {}

  /** Nor a save prompt, so nothing is written. */
  async saveFileCopy(): Promise<string | null> {
    return null;
  }
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
export class InMemoryBillRepository implements BillRepository {
  private readonly bills: Bill[] = [];

  /** Only ever incremented: a deleted bill's number is never issued again (SC-021). */
  private sequence = 0;

  constructor(private readonly customers: InMemoryCustomerRepository) {}

  async create(input: NewBill): Promise<Bill> {
    const fields = validateNewBill(input);
    if (Object.keys(fields).length > 0) {
      throw new ValidationError(fields);
    }

    this.sequence += 1;
    const bill: Bill = {
      id: billId(),
      invoiceNo: `INV-${String(this.sequence).padStart(4, "0")}`,
      date: input.date,
      customer: { ...input.customer },
      jazzcashNumbers: [...input.jazzcashNumbers],
      easypaisaNumbers: [...input.easypaisaNumbers],
      accountHolder: input.accountHolder,
      items: input.items.map((item, index) => ({
        id: billId(),
        position: index + 1,
        details: item.details,
        amount: item.amount,
      })),
      total: input.items.reduce((sum, item) => sum + item.amount, 0),
      createdAt: new Date().toISOString(),
    };

    this.customers.remember(bill.customer);
    this.bills.push(bill);
    return cloneBill(bill);
  }

  async list(filter: BillFilter): Promise<BillSummary[]> {
    if (filter.from && filter.to && filter.from > filter.to) {
      throw new InvalidRangeError();
    }

    return this.bills
      .filter((bill) => {
        if (filter.from && bill.date < filter.from) {
          return false;
        }
        if (filter.to && bill.date > filter.to) {
          return false;
        }
        if (
          filter.customer &&
          bill.customer.name.toLowerCase() !== filter.customer.toLowerCase()
        ) {
          return false;
        }
        return true;
      })
      .map((bill) => ({
        id: bill.id,
        invoiceNo: bill.invoiceNo,
        date: bill.date,
        customerName: bill.customer.name,
        details: bill.items.map((item) => item.details).join("; "),
        total: bill.total,
      }))
      .sort(byNewestBillFirst);
  }

  async get(id: string): Promise<Bill> {
    const bill = this.bills.find((candidate) => candidate.id === id);
    if (!bill) {
      throw new UnknownBillError();
    }
    return cloneBill(bill);
  }

  async update(update: BillUpdate): Promise<Bill> {
    const index = this.bills.findIndex((bill) => bill.id === update.id);
    if (index === -1) {
      throw new UnknownBillError();
    }

    const fields = validateNewBill({
      date: update.date,
      customer: update.customer,
      jazzcashNumbers: update.jazzcashNumbers,
      easypaisaNumbers: update.easypaisaNumbers,
      accountHolder: update.accountHolder,
      items: update.items,
    });
    if (Object.keys(fields).length > 0) {
      throw new ValidationError(fields);
    }

    const existing = this.bills[index];
    const updated: Bill = {
      ...existing,
      date: update.date,
      customer: { ...update.customer },
      jazzcashNumbers: [...update.jazzcashNumbers],
      easypaisaNumbers: [...update.easypaisaNumbers],
      accountHolder: update.accountHolder,
      // The invoice number is deliberately untouched, and the items are
      // renumbered from the order given (FR-048, FR-015).
      items: update.items.map((item, position) => ({
        id: existing.items[position]?.id ?? billId(),
        position: position + 1,
        details: item.details,
        amount: item.amount,
      })),
      total: update.items.reduce((sum, item) => sum + item.amount, 0),
    };

    this.customers.remember(updated.customer);
    this.bills[index] = updated;
    return cloneBill(updated);
  }

  async remove(id: string): Promise<void> {
    const index = this.bills.findIndex((bill) => bill.id === id);
    if (index === -1) {
      throw new UnknownBillError();
    }
    this.bills.splice(index, 1);
  }

  /** The fixture has no operating system to hand the invoice to. */
  async openInvoice(): Promise<void> {}

  /** Nor a save prompt, so nothing is written. */
  async saveInvoiceCopy(): Promise<string | null> {
    return null;
  }
}

// ---- Cloud sync (Module 4) ------------------------------------------------

/** Tunable behaviour for the cloud twin, so tests can exercise each outcome. */
export interface CloudTwinOptions {
  configured?: boolean;
  hasUnpushed?: boolean;
  pushOutcome?: SyncOutcome;
  pushChanged?: boolean;
  pullOutcome?: SyncOutcome;
  pullChanged?: boolean;
  usage?: CloudUsage | null;
  objectUsage?: ObjectUsage | null;
  reconnect?: ReconnectResult;
}

const NOTHING_NEW: SyncOutcome = {
  kind: "nothing-new",
  message: "There was nothing new to exchange.",
};

const SECRETS_UNAVAILABLE: SyncOutcome = {
  kind: "secrets-unavailable",
  message: "The cloud connection details are not set up on this computer yet.",
};

const SUCCESS_PUSH: SyncOutcome = {
  kind: "success",
  message: "Your changes are published.",
};

/**
 * The cloud twin. Its behaviour is configurable so the contract cases (CS-01 …
 * CS-14) can be exercised without a network. `emitPulled` stands in for the
 * background pull's `cloud://pulled` event.
 */
export class InMemoryCloudRepository implements CloudRepository {
  private configured: boolean;
  private hasUnpushed: boolean;
  private lastPushedAt: string | null;
  private readonly pushOutcome: SyncOutcome;
  private readonly pushChanged: boolean;
  private readonly pullOutcome: SyncOutcome;
  private readonly pullChanged: boolean;
  private readonly usageValue: CloudUsage | null;
  private readonly objectUsageValue: ObjectUsage | null;
  private readonly reconnectValue: ReconnectResult;
  private readonly handlers = new Set<() => void>();

  constructor(options: CloudTwinOptions = {}) {
    this.configured = options.configured ?? true;
    this.hasUnpushed = options.hasUnpushed ?? false;
    this.lastPushedAt = this.hasUnpushed ? null : "2026-01-01T00:00:00.000Z";
    this.pushOutcome = options.pushOutcome ?? SUCCESS_PUSH;
    this.pushChanged = options.pushChanged ?? true;
    this.pullOutcome = options.pullOutcome ?? SUCCESS_PUSH;
    this.pullChanged = options.pullChanged ?? true;
    this.usageValue =
      options.usage ??
      ({ usedBytes: 0, allowanceBytes: 5 * 1024 * 1024 * 1024, remainingBytes: 5 * 1024 * 1024 * 1024 } as CloudUsage);
    this.objectUsageValue =
      options.objectUsage ??
      ({
        usedBytes: 0,
        allowanceBytes: 10 * 1024 * 1024 * 1024,
        remainingBytes: 10 * 1024 * 1024 * 1024,
        pendingUploads: 0,
      } as ObjectUsage);
    this.reconnectValue =
      options.reconnect ?? {
        connected: this.configured,
        verified: true,
        message: this.configured
          ? "Connected to the cloud. Storage figures refreshed."
          : "The cloud connection details are not set up on this computer yet.",
        usage: this.usageValue,
        objectUsage: this.objectUsageValue,
      };
  }

  async status(): Promise<CloudStatus> {
    return {
      configured: this.configured,
      hasUnpushed: this.hasUnpushed,
      lastPushedAt: this.lastPushedAt,
      phase: "idle",
    };
  }

  async push(): Promise<SyncResult> {
    if (!this.configured) {
      return { outcome: SECRETS_UNAVAILABLE, changed: false };
    }
    if (!this.hasUnpushed) {
      return { outcome: NOTHING_NEW, changed: false };
    }
    if (this.pushOutcome.kind === "success") {
      this.hasUnpushed = false;
      this.lastPushedAt = new Date().toISOString();
      return { outcome: this.pushOutcome, changed: this.pushChanged };
    }
    return { outcome: this.pushOutcome, changed: false };
  }

  async pull(): Promise<SyncResult> {
    if (!this.configured) {
      return { outcome: SECRETS_UNAVAILABLE, changed: false };
    }
    if (this.pullOutcome.kind === "success") {
      return { outcome: this.pullOutcome, changed: this.pullChanged };
    }
    return { outcome: this.pullOutcome, changed: false };
  }

  async usage(): Promise<CloudUsage | null> {
    return this.usageValue;
  }

  async objectUsage(): Promise<ObjectUsage | null> {
    return this.objectUsageValue;
  }

  async reconnect(): Promise<ReconnectResult> {
    return this.reconnectValue;
  }

  onPulled(handler: () => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /** Test helper: pretend a background pull brought something. */
  emitPulled(): void {
    for (const handler of [...this.handlers]) {
      handler();
    }
  }

  /** Test helper: pretend a local write happened (sets the un-pushed marker). */
  markDirty(): void {
    this.hasUnpushed = true;
  }
}

/** The two keys the partner's env file must carry (the rest are optional). */
const REQUIRED_SECRET_KEYS = ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"];

/** The setup twin. Defaults to "set up" so the tests see the application. */
export class InMemorySetupRepository implements SetupRepository {
  constructor(
    private storageReady = true,
    private secretsReady = true,
    private connectOk = true,
  ) {}

  async state(): Promise<SetupState> {
    return { storageReady: this.storageReady, secretsReady: this.secretsReady };
  }

  async saveSecrets(text: string): Promise<SecretsPasteResult> {
    const missing = REQUIRED_SECRET_KEYS.filter(
      (key) => !new RegExp(`^\\s*${key}\\s*=`, "m").test(text),
    );
    if (missing.length > 0) {
      return {
        ok: false,
        missing,
        message: `These values are missing or empty: ${missing.join(", ")}. Nothing was saved.`,
      };
    }
    this.secretsReady = true;
    return {
      ok: true,
      missing: [],
      message: "The cloud connection details were saved.",
    };
  }

  async connect(): Promise<SetupConnectResult> {
    if (!this.secretsReady) {
      return {
        ok: false,
        kind: "secrets-unavailable",
        message: "The cloud connection details are not set up on this computer yet.",
      };
    }
    if (!this.connectOk) {
      return {
        ok: false,
        kind: "no-internet",
        message:
          "The internet could not be reached, so nothing was exchanged. Your work is safe and will publish when the connection is back.",
      };
    }
    return {
      ok: true,
      kind: "success",
      message: "Connected to the cloud. Your records will now sync.",
    };
  }
}

export function createInMemoryRepositories(): Repositories {
  const customers = new InMemoryCustomerRepository();
  return {
    statements: new InMemoryStatementRepository(),
    storage: new InMemoryStorageRepository(),
    bills: new InMemoryBillRepository(customers),
    customers,
    clients: new InMemoryClientRepository(),
    categories: new InMemoryCategoryRepository(),
    clientRecords: new InMemoryClientRecordRepository(),
    businessProfile: new InMemoryBusinessProfileRepository(),
    cloud: new InMemoryCloudRepository(),
    setup: new InMemorySetupRepository(),
  };
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
