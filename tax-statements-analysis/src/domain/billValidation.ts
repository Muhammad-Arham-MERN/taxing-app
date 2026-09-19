// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
/**
 * The bill form's validity rules (FR-020, FR-021).
 *
 * The entries the client marked required gate the Create Bill action: the date,
 * each line item's details, each line item's amount, and the customer's name —
 * and a bill always has at least one line item. The wallet numbers are optional
 * but, when given, the JazzCash number must be in +92 format (FR-009).
 */
import { z } from "zod";
import { WALLET_PLACEHOLDERS } from "@/domain/identity";
import type { BillUpdate, NewBill } from "@/domain/types";
import { amountInputSchema, isoDateSchema } from "@/domain/validation";

const optionalTextSchema = z
  .string()
  .nullish()
  .transform((value) => {
    const trimmed = (value ?? "").trim();
    return trimmed.length > 0 ? trimmed : null;
  });

const customerNameInputSchema = z
  .string()
  .trim()
  .min(1, "Customer name is required.");

/** Optional, but when given must be a +92 number — the same rule for both wallets. */
function walletNumberInputSchema(example: string) {
  return z
    .string()
    .trim()
    .refine(
      (value) => value === "" || /^\+92\d{9,10}$/.test(value.replace(/[\s-]/g, "")),
      `Enter the number in +92 format, e.g. ${example}.`,
    );
}

function cleanNumbers(numbers: string[]): string[] {
  return numbers
    .map((number) => number.trim())
    .filter((number) => number.length > 0);
}

export const billItemInputSchema = z.object({
  details: z.string().trim().min(1, "Details are required for every item."),
  amount: amountInputSchema,
});

export const billFormSchema = z.object({
  date: isoDateSchema,
  customerName: customerNameInputSchema,
  customerAddress: optionalTextSchema,
  contactPerson: optionalTextSchema,
  contactNumber: optionalTextSchema,
  email: optionalTextSchema,
  ntn: optionalTextSchema,
  customerPassword: z.string().trim(),
  jazzcashNumbers: z.array(walletNumberInputSchema(WALLET_PLACEHOLDERS.jazzcash)),
  easypaisaNumbers: z.array(walletNumberInputSchema(WALLET_PLACEHOLDERS.easypaisa)),
  accountHolder: z.string().trim().min(1, "Account holder name is required."),
  items: z
    .array(billItemInputSchema)
    .min(1, "Add at least one item to the bill."),
});

export type BillFormInput = z.input<typeof billFormSchema>;
export type BillFormOutput = z.output<typeof billFormSchema>;

/** Turn the validated form values into a `NewBill` for the repository. */
export function toNewBill(values: BillFormOutput): NewBill {
  return {
    date: values.date,
    customer: {
      name: values.customerName,
      address: values.customerAddress ?? null,
      contactPerson: values.contactPerson ?? null,
      contactNumber: values.contactNumber ?? null,
      email: values.email ?? null,
      ntn: values.ntn ?? null,
      password: values.customerPassword ? values.customerPassword : null,
    },
    jazzcashNumbers: cleanNumbers(values.jazzcashNumbers),
    easypaisaNumbers: cleanNumbers(values.easypaisaNumbers),
    accountHolder: values.accountHolder,
    items: values.items.map((item) => ({
      details: item.details,
      amount: Number(item.amount),
    })),
  };
}

/** The same, for an edit of an existing bill (FR-047). */
export function toBillUpdate(id: string, values: BillFormOutput): BillUpdate {
  return { id, ...toNewBill(values) };
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
