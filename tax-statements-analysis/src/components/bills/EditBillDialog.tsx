// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
/**
 * Correcting a stored bill (FR-046–FR-052).
 *
 * Every stored value is prefilled and editable, including the line items — which
 * are replaced wholesale and renumbered — and the bill keeps the invoice number
 * it was issued with. Saving regenerates the invoice from the corrected values
 * (FR-036); abandoning the dialog changes nothing (FR-051).
 */
import { useEffect, useRef, useState } from "react";
import { useForm, useFormState, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarDays } from "lucide-react";
import { BillItemsEditor } from "@/components/bills/BillItemsEditor";
import { BillTextField, type BillTextFieldName } from "@/components/bills/BillTextField";
import { WalletNumbersEditor } from "@/components/bills/WalletNumbersEditor";
import { NoiseButton } from "@/components/statements/NoiseButton";
import { useRepositories } from "@/components/providers/DataProvider";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  billFormSchema,
  toBillUpdate,
  type BillFormInput,
  type BillFormOutput,
} from "@/domain/billValidation";
import type { Bill, Customer } from "@/domain/types";
import { amountInWordsPkr, rupeesToMinor } from "@/lib/amountInWords";
import { billFileName, renderBillInvoice } from "@/lib/billInvoice";
import { formatPkr, parseIsoDate, toIsoDate, todayIso } from "@/lib/format";

function emptyBillForm(): BillFormInput {
  return {
    date: todayIso(),
    customerName: "",
    customerAddress: "",
    contactPerson: "",
    contactNumber: "",
    email: "",
    ntn: "",
    customerPassword: "",
    jazzcashNumbers: [{ number: "" }],
    easypaisaNumbers: [{ number: "" }],
    accountHolder: "",
    items: [{ details: "", amount: "" }],
  };
}

function toFormInput(bill: Bill): BillFormInput {
  return {
    date: bill.date,
    customerName: bill.customer.name,
    customerAddress: bill.customer.address ?? "",
    contactPerson: bill.customer.contactPerson ?? "",
    contactNumber: bill.customer.contactNumber ?? "",
    email: bill.customer.email ?? "",
    ntn: bill.customer.ntn ?? "",
    customerPassword: bill.customer.password ?? "",
    jazzcashNumbers:
      bill.jazzcashNumbers.length > 0
        ? bill.jazzcashNumbers.map((number) => ({ number }))
        : [{ number: "" }],
    easypaisaNumbers:
      bill.easypaisaNumbers.length > 0
        ? bill.easypaisaNumbers.map((number) => ({ number }))
        : [{ number: "" }],
    accountHolder: bill.accountHolder,
    items: bill.items.map((item) => ({
      details: item.details,
      amount: String(item.amount),
    })),
  };
}

export interface EditBillDialogProps {
  billId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function EditBillDialog({
  billId,
  open,
  onOpenChange,
  onSaved,
}: EditBillDialogProps) {
  const { bills, customers: customerRepository } = useRepositories();
  const [bill, setBill] = useState<Bill | null>(null);
  const [knownCustomers, setKnownCustomers] = useState<Customer[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    let active = true;
    customerRepository
      .list()
      .then((list) => {
        if (active) {
          setKnownCustomers(list);
        }
      })
      .catch(() => {
        if (active) {
          setKnownCustomers([]);
        }
      });
    return () => {
      active = false;
    };
  }, [customerRepository]);

  const form = useForm<BillFormInput, unknown, BillFormOutput>({
    resolver: zodResolver(billFormSchema),
    mode: "onChange",
    defaultValues: emptyBillForm(),
  });

  useEffect(() => {
    if (!open || !billId) {
      return;
    }
    let active = true;
    setLoadError(null);
    setSubmitError(null);

    bills
      .get(billId)
      .then((loaded) => {
        if (active) {
          setBill(loaded);
          form.reset(toFormInput(loaded));
        }
      })
      .catch((error) => {
        if (active) {
          setLoadError(
            error instanceof Error ? error.message : "That bill could not be opened.",
          );
        }
      });

    return () => {
      active = false;
    };
  }, [open, billId, bills, form]);

  const items = useWatch({ control: form.control, name: "items" }) ?? [];
  const total = items.reduce((sum, item) => {
    const amount = Number(item?.amount);
    return Number.isFinite(amount) && amount > 0 ? sum + amount : sum;
  }, 0);
  const words = amountInWordsPkr(rupeesToMinor(total));
  const { isValid } = useFormState({ control: form.control });

  const customerName = useWatch({ control: form.control, name: "customerName" }) ?? "";

  // وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
  /**
   * A bill's customer details are no longer edited here — they belong to the
   * customer (client change, 2026-09-19). Switching to a customer billed before
   * brings their saved details across; a brand-new name starts them empty. The
   * details still travel with the update so an edit never wipes them.
   */
  useEffect(() => {
    const trimmed = customerName.trim();
    if (!bill || trimmed.toLowerCase() === bill.customer.name.toLowerCase()) {
      return;
    }

    const match = knownCustomers.find(
      (customer) => customer.name.toLowerCase() === trimmed.toLowerCase(),
    );
    const details: Array<[BillTextFieldName, string | null]> = [
      ["customerAddress", match?.address ?? null],
      ["contactPerson", match?.contactPerson ?? null],
      ["contactNumber", match?.contactNumber ?? null],
      ["email", match?.email ?? null],
      ["ntn", match?.ntn ?? null],
      ["customerPassword", match?.password ?? null],
    ];
    for (const [name, value] of details) {
      form.setValue(name, value ?? "", { shouldDirty: true, shouldValidate: true });
    }
  }, [customerName, knownCustomers, bill, form]);

  // وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
  const onSubmit = form.handleSubmit(async (values) => {
    if (!bill || submittingRef.current) {
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const saved = await bills.update(toBillUpdate(bill.id, values));
      try {
        const bytes = await renderBillInvoice(saved);
        await bills.openInvoice(bytes, billFileName(saved.invoiceNo));
      } catch {
        // The correction is stored; a failure to open the invoice is not one.
      }
      onSaved();
      onOpenChange(false);
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Unable to save the bill.",
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit bill</DialogTitle>
          <DialogDescription>
            The invoice number stays the same; the invoice is regenerated when you save.
          </DialogDescription>
        </DialogHeader>

        {loadError ? (
          <p role="alert" className="text-sm text-destructive">
            {loadError}
          </p>
        ) : (
          <Form {...form}>
            <form onSubmit={onSubmit} noValidate className="grid gap-5">
              <div className="grid gap-5 lg:grid-cols-2">
                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              type="button"
                              variant="outline"
                              className="h-11 w-full justify-start px-4 text-base font-normal"
                            >
                              <CalendarDays className="opacity-60" />
                              {field.value || "Pick a date"}
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-auto p-0">
                          <Calendar
                            mode="single"
                            autoFocus
                            selected={field.value ? parseIsoDate(field.value) : undefined}
                            onSelect={(date) => {
                              if (date) {
                                field.onChange(toIsoDate(date));
                              }
                            }}
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <BillTextField
                  control={form.control}
                  name="customerName"
                  label="Customer Name"
                  disabled={submitting}
                />
              </div>

              <BillItemsEditor control={form.control} disabled={submitting} />

              <div className="grid gap-5">
                <p className="text-sm text-muted-foreground">
                  The customer's own details are edited from View Bills, by clicking their
                  name in the list.
                </p>

                <span className="text-sm leading-none font-medium text-muted-foreground">
                  Payment Details
                </span>
                <div className="grid gap-5 lg:grid-cols-3">
                  <WalletNumbersEditor
                    control={form.control}
                    name="jazzcashNumbers"
                    label="JazzCash Number"
                    disabled={submitting}
                  />
                  <WalletNumbersEditor
                    control={form.control}
                    name="easypaisaNumbers"
                    label="Easypaisa Number"
                    disabled={submitting}
                  />
                  <BillTextField
                    control={form.control}
                    name="accountHolder"
                    label="Account Holder Name"
                    disabled={submitting}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-baseline justify-between gap-3 rounded-2xl border border-border/60 bg-surface/60 p-4">
                <span className="text-sm font-medium text-muted-foreground">Total</span>
                <span className="font-heading text-lg font-semibold text-brand">
                  {formatPkr(total)}
                </span>
                <p className="w-full text-sm text-muted-foreground">{words}</p>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={submitting}
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                <NoiseButton type="submit" disabled={!isValid || submitting}>
                  {submitting ? "Saving…" : "Save changes"}
                </NoiseButton>
              </div>

              {submitError ? (
                <p role="alert" className="text-sm text-destructive">
                  {submitError}
                </p>
              ) : null}
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
