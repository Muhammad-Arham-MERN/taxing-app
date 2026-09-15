// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import { z } from "zod";
import type { NewStatement, StatementType } from "@/domain/types";
import { isValidIsoDate } from "@/lib/format";
import { isNatureValidForType } from "@/lib/natures";

export const statementTypeSchema = z.enum(["inflow", "outflow"]);

export const statementTypeInputSchema = z
  .string()
  .refine(
    (value): value is StatementType => value === "inflow" || value === "outflow",
    "Select a type.",
  );

export const isoDateSchema = z
  .string()
  .trim()
  .refine((value) => isValidIsoDate(value), "Enter a valid date in YYYY-MM-DD format.");

const amountPattern = /^\d+(\.\d{1,2})?$/;

export const amountInputSchema = z
  .string()
  .trim()
  .min(1, "Amount is required.")
  .refine(
    (value) => amountPattern.test(value),
    "Enter a positive amount with up to 2 decimal places.",
  )
  .refine((value) => Number(value) > 0, "Amount must be greater than zero.");

export const amountSchema = z
  .number()
  .finite("Enter a valid amount.")
  .positive("Amount must be greater than zero.")
  .refine((value) => amountPattern.test(String(value)), "Amount may have at most 2 decimal places.");

const remarksInputSchema = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = (value ?? "").trim();
    return trimmed.length > 0 ? trimmed : null;
  });

const nullableTextSchema = z
  .string()
  .nullish()
  .transform((value) => {
    const trimmed = (value ?? "").trim();
    return trimmed.length > 0 ? trimmed : null;
  });

function natureBelongsToType(value: { nature: string; type: StatementType }): boolean {
  return isNatureValidForType(value.nature, value.type);
}

export const statementFormSchema = z
  .object({
    date: isoDateSchema,
    type: statementTypeInputSchema,
    nature: z.string().trim().min(1, "Nature is required."),
    amount: amountInputSchema,
    remarks: remarksInputSchema,
  })
  .refine(natureBelongsToType, {
    message: "Choose a nature that belongs to the selected type.",
    path: ["nature"],
  });

export const newStatementSchema = z
  .object({
    date: isoDateSchema,
    type: statementTypeSchema,
    nature: z.string().trim().min(1, "Nature is required."),
    amount: amountSchema,
    remarks: nullableTextSchema,
    fileName: nullableTextSchema,
    fileRef: nullableTextSchema,
  })
  .refine(natureBelongsToType, {
    message: "Choose a nature that belongs to the selected type.",
    path: ["nature"],
  });

export const statementFilterSchema = z
  .object({
    from: isoDateSchema,
    to: isoDateSchema,
  })
  .refine((value) => value.from <= value.to, {
    message: "The From date must be on or before the To date.",
    path: ["to"],
  });

export type StatementFormInput = z.input<typeof statementFormSchema>;
export type StatementFormOutput = z.output<typeof statementFormSchema>;
export type StatementFilterValues = z.input<typeof statementFilterSchema>;

export function toNewStatement(
  values: StatementFormOutput,
  fileName: string | null,
): NewStatement {
  return {
    date: values.date,
    type: values.type,
    nature: values.nature,
    amount: Number(values.amount),
    remarks: values.remarks,
    fileName,
    fileRef: null,
  };
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
