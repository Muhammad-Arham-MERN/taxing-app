// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
/**
 * The frontend half of the bridge to the Rust backend.
 *
 * Every call here maps onto a command in
 * `specs/002-statements-persistence/contracts/tauri-commands.md`. Failures come
 * back as a `{ kind, message }` shape and become the seam's error types, so no
 * component ever parses a message string.
 *
 * **Files never travel as JSON.** When a statement carries an attachment, its
 * bytes are sent as the request's *raw body* and the statement's fields go in a
 * header — see Tauri's "Accessing Raw Request". Sending them as JSON would turn
 * every byte into a decimal number and inflate a 50 MB scan into ~200 MB of text.
 */
import { invoke } from "@tauri-apps/api/core";
import {
  AttachmentOpenFailedError,
  AttachmentWriteFailedError,
  CarryAcrossInterruptedError,
  InvalidRangeError,
  InvoiceOpenFailedError,
  InvoiceWriteFailedError,
  LocationUnreachableError,
  LocationUnwritableError,
  NoStorageLocationError,
  NotAStoreError,
  StoreDamagedError,
  StoreWriteFailedError,
  UnknownBillError,
  UnknownStatementError,
  ValidationError,
  type BillRepository,
  type CustomerRepository,
  type StatementRepository,
  type StorageRepository,
} from "@/data/repositories";
import type {
  AttachmentPayload,
  Bill,
  BillFilter,
  BillSummary,
  BillUpdate,
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

/** Where the statement's own fields travel when the body holds a file. */
const META_HEADER = "x-statement-meta";

/** Where a rendered invoice's file name travels when the body holds the PDF. */
const INVOICE_META_HEADER = "x-bill-invoice-meta";

interface BackendError {
  kind: string;
  message: string;
  fields?: Record<string, string>;
  copied?: number;
  remaining?: number;
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
function toSeamError(raw: unknown): Error {
  const error = raw as Partial<BackendError> | undefined;
  const kind = error?.kind ?? "io";
  const message = error?.message ?? "Something went wrong.";

  switch (kind) {
    case "validation":
      return new ValidationError(error?.fields ?? {});
    case "invalidRange":
      return new InvalidRangeError();
    case "unknownStatement":
      return new UnknownStatementError();
    case "unknownBill":
      return new UnknownBillError();
    case "invoiceWriteFailed":
      return new InvoiceWriteFailedError(message);
    case "invoiceOpenFailed":
      return new InvoiceOpenFailedError(message);
    case "attachmentWriteFailed":
      return new AttachmentWriteFailedError(message);
    case "attachmentOpenFailed":
      return new AttachmentOpenFailedError(message);
    case "notAStore":
      return new NotAStoreError(message);
    case "locationUnreachable":
      return new LocationUnreachableError(message);
    case "storeDamaged":
      return new StoreDamagedError(message);
    case "locationUnwritable":
      return new LocationUnwritableError(message);
    case "noStorageLocation":
      return new NoStorageLocationError(message);
    case "carryAcrossInterrupted":
      return new CarryAcrossInterruptedError(
        message,
        error?.copied ?? 0,
        error?.remaining ?? 0,
      );
    default:
      return new StoreWriteFailedError(message);
  }
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (raw) {
    throw toSeamError(raw);
  }
}

/** A call whose payload is bytes rather than JSON. */
async function callRaw<T>(
  command: string,
  bytes: Uint8Array,
  meta: unknown,
  header = META_HEADER,
): Promise<T> {
  try {
    return await invoke<T>(command, bytes, {
      headers: { [header]: JSON.stringify(meta) },
    });
  } catch (raw) {
    throw toSeamError(raw);
  }
}

export class TauriStatementRepository implements StatementRepository {
  async create(
    input: NewStatement,
    attachment?: AttachmentPayload | null,
  ): Promise<Statement> {
    if (attachment) {
      return callRaw<Statement>("create_statement", attachment.bytes, {
        input,
        fileName: attachment.fileName,
      });
    }
    return call<Statement>("create_statement", { input });
  }

  async findByDateRange(filter: StatementFilter): Promise<Statement[]> {
    return call<Statement[]>("list_statements", {
      from: filter.from,
      to: filter.to,
    });
  }

  /** Every statement is reached through a date range, so the widest range stands in for "all". */
  async listAll(): Promise<Statement[]> {
    return this.findByDateRange({ from: "0001-01-01", to: "9999-12-31" });
  }

  async update(update: StatementUpdate): Promise<Statement> {
    if (update.attachment.action === "replace") {
      const { action, fileName } = update.attachment;
      // The bytes deliberately stay out of the meta — sending them twice would
      // defeat the whole point of the raw body.
      return callRaw<Statement>("update_statement", update.attachment.bytes, {
        update: { ...update, attachment: { action, fileName } },
      });
    }
    return call<Statement>("update_statement", { update });
  }

  async openAttachment(statementId: string): Promise<void> {
    await call<void>("open_attachment", { statementId });
  }

  async saveAttachmentCopy(statementId: string): Promise<string | null> {
    return call<string | null>("save_attachment_copy", { statementId });
  }
}

export class TauriStorageRepository implements StorageRepository {
  async getState(): Promise<StorageState> {
    return call<StorageState>("get_storage_state");
  }

  async pickDirectory(): Promise<string | null> {
    return call<string | null>("pick_directory");
  }

  async pickStoreFile(): Promise<string | null> {
    return call<string | null>("pick_store_file");
  }

  async assess(
    kind: "directory" | "file",
    path: string,
  ): Promise<LocationAssessment> {
    return call<LocationAssessment>("assess_location", { kind, path });
  }

  async setLocation(
    kind: "directory" | "file",
    path: string,
    carryAcross: CarryAcrossChoice,
  ): Promise<StorageState> {
    return call<StorageState>("set_storage_location", {
      kind,
      path,
      carryAcross,
    });
  }
}

export class TauriBillRepository implements BillRepository {
  async create(input: NewBill): Promise<Bill> {
    return call<Bill>("create_bill", { input });
  }

  async list(filter: BillFilter): Promise<BillSummary[]> {
    return call<BillSummary[]>("list_bills", {
      from: filter.from,
      to: filter.to,
      customer: filter.customer,
    });
  }

  async get(id: string): Promise<Bill> {
    return call<Bill>("get_bill", { id });
  }

  async update(update: BillUpdate): Promise<Bill> {
    return call<Bill>("update_bill", { update });
  }

  async remove(id: string): Promise<void> {
    await call<void>("delete_bill", { id });
  }

  /**
   * The invoice is rendered in the frontend and never stored: its bytes travel
   * as the raw body, with only the suggested file name beside them (FR-027).
   */
  async openInvoice(bytes: Uint8Array, fileName: string): Promise<void> {
    await callRaw<void>("open_bill_invoice", bytes, { fileName }, INVOICE_META_HEADER);
  }

  async saveInvoiceCopy(
    bytes: Uint8Array,
    fileName: string,
  ): Promise<string | null> {
    return callRaw<string | null>(
      "save_bill_invoice_copy",
      bytes,
      { fileName },
      INVOICE_META_HEADER,
    );
  }
}

export class TauriCustomerRepository implements CustomerRepository {
  async list(): Promise<Customer[]> {
    return call<Customer[]>("list_customers");
  }

  async update(customer: Customer): Promise<Customer> {
    return call<Customer>("update_customer", { customer });
  }
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
