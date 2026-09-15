// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import type { StatementType } from "@/domain/types";

export interface NatureOption {
  value: string;
  label: string;
  type: StatementType;
}

export const INFLOW_NATURE_LABELS = [
  "Fee for Income Tax",
  "Fee for Sales Tax",
  "Fee for PRA | KPRA | SRA | BRA | ETC",
  "Audit Fee",
  "Appeal Fee",
  "Miscellaneous Fee",
  "Loan",
] as const;

export const OUTFLOW_NATURE_LABELS = [
  "Expenses",
  "Rent",
  "Salaries",
  "Utilities - IESCO | PTCL | Mobile",
  "Stationery",
  "Entertainment",
  "Travelling",
  "Taxes",
  "Office Equipments",
  "Others",
  "Receivable",
] as const;

export const NATURE_CATALOG: NatureOption[] = [
  ...INFLOW_NATURE_LABELS.map((label) => ({ value: label, label, type: "inflow" as const })),
  ...OUTFLOW_NATURE_LABELS.map((label) => ({ value: label, label, type: "outflow" as const })),
];

export function naturesForType(type: StatementType): NatureOption[] {
  return NATURE_CATALOG.filter((option) => option.type === type);
}

export function isNatureValidForType(nature: string, type: StatementType): boolean {
  return NATURE_CATALOG.some((option) => option.value === nature && option.type === type);
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
