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
  Customer,
  LocationAssessment,
  NewBill,
  NewStatement,
  Statement,
  StatementFilter,
  StatementUpdate,
  StorageState,
} from "@/domain/types";
import { newStatementSchema } from "@/domain/validation";
import {
  DuplicateSubmissionError,
  InvalidRangeError,
  UnknownBillError,
  UnknownStatementError,
  ValidationError,
  type BillRepository,
  type BusinessProfileRepository,
  type CustomerRepository,
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
  businessProfile: BusinessProfileRepository;
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

export function createInMemoryRepositories(): Repositories {
  const customers = new InMemoryCustomerRepository();
  return {
    statements: new InMemoryStatementRepository(),
    storage: new InMemoryStorageRepository(),
    bills: new InMemoryBillRepository(customers),
    customers,
    businessProfile: new InMemoryBusinessProfileRepository(),
  };
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
