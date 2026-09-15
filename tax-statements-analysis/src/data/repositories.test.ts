// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_BUSINESS_PROFILE,
  InMemoryBusinessProfileRepository,
  InMemoryStatementRepository,
} from "@/data/in-memory";
import {
  DuplicateSubmissionError,
  InvalidRangeError,
  ValidationError,
} from "@/data/repositories";
import type { NewStatement } from "@/domain/types";

const baseInput: NewStatement = {
  date: "2026-09-14",
  type: "inflow",
  nature: "Audit Fee",
  amount: 1500,
  remarks: null,
  fileName: null,
  fileRef: null,
};

describe("InMemoryStatementRepository contract", () => {
  let repository: InMemoryStatementRepository;

  beforeEach(() => {
    repository = new InMemoryStatementRepository();
  });

  it("C-01 create returns a statement with an id and createdAt", async () => {
    const created = await repository.create(baseInput);
    expect(created.id).toBeTruthy();
    expect(created.createdAt).toBeTruthy();
    expect(created.amount).toBe(1500);
  });

  it("C-02 a created statement is visible to findByDateRange", async () => {
    await repository.create(baseInput);
    const rows = await repository.findByDateRange({ from: "2026-09-01", to: "2026-09-30" });
    expect(rows).toHaveLength(1);
  });

  it("C-03 range bounds are inclusive", async () => {
    await repository.create({ ...baseInput, date: "2026-09-14" });
    const rows = await repository.findByDateRange({ from: "2026-09-14", to: "2026-09-14" });
    expect(rows).toHaveLength(1);
  });

  it("C-04 rejects a reversed range with InvalidRangeError", async () => {
    await expect(
      repository.findByDateRange({ from: "2026-09-30", to: "2026-09-01" }),
    ).rejects.toBeInstanceOf(InvalidRangeError);
  });

  it("C-05 resolves to an empty array when nothing matches", async () => {
    await repository.create(baseInput);
    await expect(
      repository.findByDateRange({ from: "2025-01-01", to: "2025-12-31" }),
    ).resolves.toEqual([]);
  });

  it("C-06 stores omitted remarks and fileName as null", async () => {
    const created = await repository.create({ ...baseInput, remarks: null, fileName: null });
    expect(created.remarks).toBeNull();
    expect(created.fileName).toBeNull();
  });

  it("C-09 rejects a concurrent identical submission", async () => {
    const results = await Promise.allSettled([
      repository.create(baseInput),
      repository.create(baseInput),
    ]);
    const rejected = results.filter((result) => result.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      DuplicateSubmissionError,
    );
    expect(await repository.listAll()).toHaveLength(1);
  });

  it("raises ValidationError for invalid input", async () => {
    await expect(repository.create({ ...baseInput, amount: -1 })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("orders results newest date first", async () => {
    await repository.create({ ...baseInput, date: "2026-09-10" });
    await repository.create({ ...baseInput, date: "2026-09-20" });
    const rows = await repository.findByDateRange({ from: "2026-09-01", to: "2026-09-30" });
    expect(rows.map((row) => row.date)).toEqual(["2026-09-20", "2026-09-10"]);
  });
});

describe("InMemoryBusinessProfileRepository contract", () => {
  it("C-07 get returns the default identity on a fresh store", async () => {
    const repository = new InMemoryBusinessProfileRepository();
    await expect(repository.get()).resolves.toEqual(DEFAULT_BUSINESS_PROFILE);
  });

  it("C-08 save then get returns the saved profile", async () => {
    const repository = new InMemoryBusinessProfileRepository();
    const saved = await repository.save({
      brandName: "M&M Tax Law Solutions",
      location: "Rawalpindi",
      contacts: ["051-5910021"],
    });
    await expect(repository.get()).resolves.toEqual(saved);
  });
});

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
