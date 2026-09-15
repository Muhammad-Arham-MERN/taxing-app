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
  BusinessProfile,
  CarryAcrossChoice,
  LocationAssessment,
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
  UnknownStatementError,
  ValidationError,
  type BusinessProfileRepository,
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

export function createInMemoryRepositories(): Repositories {
  return {
    statements: new InMemoryStatementRepository(),
    storage: new InMemoryStorageRepository(),
    businessProfile: new InMemoryBusinessProfileRepository(),
  };
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
