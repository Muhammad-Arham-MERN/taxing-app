// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import { describe, expect, it } from "vitest";
import { filterByDateRange, isRangeValid, summarize } from "@/domain/summary";
import type { Statement } from "@/domain/types";

function makeStatement(overrides: Partial<Statement> = {}): Statement {
  return {
    id: overrides.id ?? "id",
    date: "2026-09-14",
    type: "inflow",
    nature: "Audit Fee",
    amount: 100,
    remarks: null,
    fileName: null,
    fileRef: null,
    createdAt: "2026-09-14T00:00:00.000Z",
    ...overrides,
  };
}

const dataset: Statement[] = [
  makeStatement({ id: "a", date: "2026-08-31", type: "inflow", amount: 500 }),
  makeStatement({ id: "b", date: "2026-09-01", type: "inflow", amount: 1000 }),
  makeStatement({ id: "c", date: "2026-09-15", type: "outflow", amount: 250 }),
  makeStatement({ id: "d", date: "2026-09-30", type: "outflow", amount: 50 }),
  makeStatement({ id: "e", date: "2026-10-01", type: "inflow", amount: 999 }),
];

describe("filterByDateRange", () => {
  it("includes both boundary dates", () => {
    const rows = filterByDateRange(dataset, "2026-09-01", "2026-09-30");
    expect(rows.map((row) => row.id)).toEqual(["b", "c", "d"]);
  });

  it("excludes statements outside the range", () => {
    const rows = filterByDateRange(dataset, "2026-09-02", "2026-09-29");
    expect(rows.map((row) => row.id)).toEqual(["c"]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterByDateRange(dataset, "2026-01-01", "2026-01-31")).toEqual([]);
  });

  it("returns an empty array for a reversed range", () => {
    expect(filterByDateRange(dataset, "2026-09-30", "2026-09-01")).toEqual([]);
  });
});

describe("summarize", () => {
  it("totals inflow and outflow and derives the balance", () => {
    const rows = filterByDateRange(dataset, "2026-09-01", "2026-09-30");
    expect(summarize(rows)).toEqual({
      totalInflow: 1000,
      totalOutflow: 300,
      balance: 700,
    });
  });

  it("returns zeros for an empty result set", () => {
    expect(summarize([])).toEqual({ totalInflow: 0, totalOutflow: 0, balance: 0 });
  });

  it("allows a negative balance", () => {
    const rows = filterByDateRange(dataset, "2026-09-15", "2026-09-30");
    expect(summarize(rows)).toEqual({
      totalInflow: 0,
      totalOutflow: 300,
      balance: -300,
    });
  });

  it("keeps balance equal to inflow minus outflow", () => {
    const summary = summarize(dataset);
    expect(summary.balance).toBe(summary.totalInflow - summary.totalOutflow);
  });
});

describe("isRangeValid", () => {
  it("accepts ordered and equal bounds", () => {
    expect(isRangeValid("2026-09-01", "2026-09-30")).toBe(true);
    expect(isRangeValid("2026-09-14", "2026-09-14")).toBe(true);
  });

  it("rejects reversed or empty bounds", () => {
    expect(isRangeValid("2026-09-30", "2026-09-01")).toBe(false);
    expect(isRangeValid("", "2026-09-30")).toBe(false);
  });
});

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
