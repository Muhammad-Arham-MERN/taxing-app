// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import { describe, expect, it } from "vitest";
import {
  NONE,
  firstOfCurrentMonthIso,
  formatAmount,
  formatDate,
  formatOptional,
  isValidIsoDate,
  parseIsoDate,
  toIsoDate,
  todayIso,
} from "@/lib/format";

describe("formatAmount", () => {
  it("renders ₨ with thousands separators and two decimals", () => {
    expect(formatAmount(1234.5)).toBe("₨ 1,234.50");
    expect(formatAmount(0)).toBe("₨ 0.00");
    expect(formatAmount(1234567.891)).toBe("₨ 1,234,567.89");
  });

  it("renders negative values with a minus sign", () => {
    expect(formatAmount(-42)).toBe("₨ -42.00");
  });
});

describe("formatOptional", () => {
  it("falls back to None for missing values", () => {
    expect(formatOptional(null)).toBe(NONE);
    expect(formatOptional(undefined)).toBe(NONE);
    expect(formatOptional("")).toBe(NONE);
    expect(formatOptional("   ")).toBe(NONE);
  });

  it("returns trimmed text when present", () => {
    expect(formatOptional("  receipt.pdf ")).toBe("receipt.pdf");
  });
});

describe("ISO date helpers", () => {
  it("formats local dates without UTC drift", () => {
    expect(toIsoDate(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(toIsoDate(new Date(2026, 11, 31))).toBe("2026-12-31");
  });

  it("parses an ISO date to a local date", () => {
    const parsed = parseIsoDate("2026-09-14");
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(8);
    expect(parsed.getDate()).toBe(14);
  });

  it("validates real ISO dates", () => {
    expect(isValidIsoDate("2026-09-14")).toBe(true);
    expect(isValidIsoDate("2026-02-30")).toBe(false);
    expect(isValidIsoDate("14-09-2026")).toBe(false);
    expect(isValidIsoDate("")).toBe(false);
  });

  it("returns the ISO string from formatDate and blank for invalid input", () => {
    expect(formatDate("2026-09-14")).toBe("2026-09-14");
    expect(formatDate("nope")).toBe("");
  });

  it("derives the first of the month and today in local time", () => {
    expect(firstOfCurrentMonthIso(new Date(2026, 8, 14))).toBe("2026-09-01");
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
