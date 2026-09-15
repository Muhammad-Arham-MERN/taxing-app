// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import { describe, expect, it } from "vitest";
import {
  newStatementSchema,
  statementFilterSchema,
  statementFormSchema,
} from "@/domain/validation";

const validForm = {
  date: "2026-09-14",
  type: "inflow" as const,
  nature: "Audit Fee",
  amount: "1234.50",
  remarks: "",
};

describe("statementFormSchema", () => {
  it("accepts a complete valid statement", () => {
    expect(statementFormSchema.safeParse(validForm).success).toBe(true);
  });

  it("requires a real ISO date", () => {
    expect(statementFormSchema.safeParse({ ...validForm, date: "" }).success).toBe(false);
    expect(statementFormSchema.safeParse({ ...validForm, date: "14-09-2026" }).success).toBe(false);
    expect(statementFormSchema.safeParse({ ...validForm, date: "2026-02-30" }).success).toBe(false);
  });

  it("requires a type", () => {
    expect(statementFormSchema.safeParse({ ...validForm, type: "" }).success).toBe(false);
  });

  it("requires a nature", () => {
    expect(statementFormSchema.safeParse({ ...validForm, nature: "" }).success).toBe(false);
  });

  it("rejects a nature that does not belong to the selected type", () => {
    const result = statementFormSchema.safeParse({
      ...validForm,
      type: "outflow",
      nature: "Audit Fee",
    });
    expect(result.success).toBe(false);
  });

  it("rejects zero, negative, non-numeric and over-precise amounts", () => {
    for (const amount of ["0", "-5", "abc", "", "12.345"]) {
      expect(statementFormSchema.safeParse({ ...validForm, amount }).success).toBe(false);
    }
  });

  it("accepts a whole-number amount", () => {
    expect(statementFormSchema.safeParse({ ...validForm, amount: "500" }).success).toBe(true);
  });

  it("maps blank remarks to null", () => {
    const result = statementFormSchema.safeParse({ ...validForm, remarks: "   " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.remarks).toBeNull();
    }
  });

  it("trims provided remarks", () => {
    const result = statementFormSchema.safeParse({ ...validForm, remarks: "  paid in cash  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.remarks).toBe("paid in cash");
    }
  });
});

describe("newStatementSchema", () => {
  const validStatement = {
    date: "2026-09-14",
    type: "inflow" as const,
    nature: "Audit Fee",
    amount: 100.5,
    remarks: null,
    fileName: null,
    fileRef: null,
  };

  it("accepts a valid numeric statement", () => {
    expect(newStatementSchema.safeParse(validStatement).success).toBe(true);
  });

  it("rejects a non-positive amount", () => {
    expect(newStatementSchema.safeParse({ ...validStatement, amount: 0 }).success).toBe(false);
  });

  it("rejects a nature that mismatches the type", () => {
    expect(
      newStatementSchema.safeParse({ ...validStatement, type: "outflow", nature: "Audit Fee" })
        .success,
    ).toBe(false);
  });
});

describe("statementFilterSchema", () => {
  it("accepts an ordered range", () => {
    expect(
      statementFilterSchema.safeParse({ from: "2026-09-01", to: "2026-09-30" }).success,
    ).toBe(true);
  });

  it("accepts equal bounds", () => {
    expect(
      statementFilterSchema.safeParse({ from: "2026-09-14", to: "2026-09-14" }).success,
    ).toBe(true);
  });

  it("rejects a reversed range", () => {
    expect(
      statementFilterSchema.safeParse({ from: "2026-09-30", to: "2026-09-01" }).success,
    ).toBe(false);
  });
});

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
