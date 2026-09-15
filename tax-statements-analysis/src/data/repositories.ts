// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import type {
  AttachmentPayload,
  BusinessProfile,
  CarryAcrossChoice,
  LocationAssessment,
  NewStatement,
  Statement,
  StatementFilter,
  StatementUpdate,
  StorageState,
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

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
