// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
/**
 * The Create Bill form (FR-005–FR-027).
 *
 * The entries the practitioner must fill in come first — the date, the
 * customer's name, and the bill's line items — and the optional ones sit below
 * them. The item numbers, the total, the amount in words and the invoice number
 * are generated, so none of them is an entry (FR-012). The Create Bill action
 * stays unavailable until every required entry is complete and valid
 * (FR-020, FR-021).
 */
import { useEffect, useRef, useState } from "react";
import { useForm, useFormState, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useRepositories } from "@/components/providers/DataProvider";
import { BillItemsEditor } from "@/components/bills/BillItemsEditor";
import { BillTextField, type BillTextFieldName } from "@/components/bills/BillTextField";
import { WalletNumbersEditor } from "@/components/bills/WalletNumbersEditor";
import { NoiseButton } from "@/components/statements/NoiseButton";
import {
  billFormSchema,
  toNewBill,
  type BillFormInput,
  type BillFormOutput,
} from "@/domain/billValidation";
import { DEFAULT_ACCOUNT_HOLDER, WALLET_PLACEHOLDERS } from "@/domain/identity";
import type { Customer } from "@/domain/types";
import { amountInWordsPkr, rupeesToMinor } from "@/lib/amountInWords";
import { billFileName, renderBillInvoice } from "@/lib/billInvoice";
import { formatPkr, parseIsoDate, toIsoDate, todayIso } from "@/lib/format";

function createEmptyForm(): BillFormInput {
  return {
    date: todayIso(),
    customerName: "",
    customerAddress: "",
    contactPerson: "",
    contactNumber: "",
    email: "",
    ntn: "",
    customerPassword: "",
    // The practice's own wallet numbers are filled in by default; the
    // practitioner can clear one and put another in its place (client request,
    // 2026-09-19).
    jazzcashNumbers: [WALLET_PLACEHOLDERS.jazzcash],
    easypaisaNumbers: [WALLET_PLACEHOLDERS.easypaisa],
    accountHolder: DEFAULT_ACCOUNT_HOLDER,
    items: [{ details: "", amount: "" }],
  };
}

export interface CreateBillFormProps {
  onCreated?: () => void;
}

export function CreateBillForm({ onCreated }: CreateBillFormProps) {
  const { bills, customers: customerRepository } = useRepositories();
  const [knownCustomers, setKnownCustomers] = useState<Customer[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [invoiceNotice, setInvoiceNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const form = useForm<BillFormInput, unknown, BillFormOutput>({
    resolver: zodResolver(billFormSchema),
    mode: "onChange",
    defaultValues: createEmptyForm(),
  });

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

  const customerName = useWatch({ control: form.control, name: "customerName" }) ?? "";

  // وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
  /**
   * Choosing a customer billed before fills their saved details in (FR-066,
   * FR-067). It fires only when the typed name matches a remembered customer
   * exactly, so details edited afterwards are never overwritten.
   */
  useEffect(() => {
    const match = knownCustomers.find(
      (customer) => customer.name.toLowerCase() === customerName.trim().toLowerCase(),
    );
    if (!match) {
      return;
    }

    const details: Array<[BillTextFieldName, string | null]> = [
      ["customerAddress", match.address],
      ["contactPerson", match.contactPerson],
      ["contactNumber", match.contactNumber],
      ["email", match.email],
      ["ntn", match.ntn],
      ["customerPassword", match.password],
    ];
    for (const [name, value] of details) {
      form.setValue(name, value ?? "", { shouldDirty: true, shouldValidate: true });
    }
  }, [customerName, knownCustomers, form]);

  const items = useWatch({ control: form.control, name: "items" }) ?? [];
  const total = items.reduce((sum, item) => {
    const amount = Number(item?.amount);
    return Number.isFinite(amount) && amount > 0 ? sum + amount : sum;
  }, 0);
  const words = amountInWordsPkr(rupeesToMinor(total));
  const { isValid } = useFormState({ control: form.control });

  // وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
  const onSubmit = form.handleSubmit(async (values) => {
    // Synchronous in-flight guard: a rapid second click cannot pass this check
    // before the first submission settles (FR-023).
    if (submittingRef.current) {
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    setInvoiceNotice(null);

    try {
      const bill = await bills.create(toNewBill(values));

      // The invoice is rendered fresh from the stored bill, so what the
      // practitioner sees is exactly what was stored (FR-027, FR-034).
      try {
        const bytes = await renderBillInvoice(bill);
        await bills.openInvoice(bytes, billFileName(bill.invoiceNo));
      } catch {
        setInvoiceNotice(
          "The bill was created, but its invoice could not be opened here. You can download it from View Bills.",
        );
      }

      form.reset(createEmptyForm());
      onCreated?.();
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Unable to create the bill.",
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate>
        <section
          data-slot="create-bill-panel"
          className="rounded-4xl border border-border bg-card/60 p-6"
        >
          <h2 className="font-heading text-lg font-semibold">Create Bill</h2>

          <div className="mt-5 grid gap-5">
            <div className="rounded-2xl border border-border/60 bg-surface/60 p-5">
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
                  placeholder="Who this bill is for"
                  disabled={submitting}
                  listId="bill-known-customers"
                />
              </div>

              <div className="mt-5">
                <BillItemsEditor control={form.control} disabled={submitting} />
              </div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-surface/60 p-5">
              <span className="text-sm leading-none font-medium text-muted-foreground">
                Customer Details
              </span>
              <div className="mt-4 grid gap-5 lg:grid-cols-3">
                <BillTextField
                  control={form.control}
                  name="customerAddress"
                  label="Customer Address"
                  placeholder="Optional"
                  disabled={submitting}
                />
                <BillTextField
                  control={form.control}
                  name="contactPerson"
                  label="Contact Person"
                  placeholder="Optional"
                  disabled={submitting}
                />
                <BillTextField
                  control={form.control}
                  name="contactNumber"
                  label="Contact Number"
                  placeholder="Optional"
                  disabled={submitting}
                />
                <BillTextField
                  control={form.control}
                  name="email"
                  label="Email"
                  placeholder="Optional"
                  disabled={submitting}
                />
                <BillTextField
                  control={form.control}
                  name="ntn"
                  label="NTN Number"
                  placeholder="Optional"
                  disabled={submitting}
                />
                <BillTextField
                  control={form.control}
                  name="customerPassword"
                  label="Password"
                  placeholder="Optional"
                  disabled={submitting}
                />
              </div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-surface/60 p-5">
              <span className="text-sm leading-none font-medium text-muted-foreground">
                Payment Details
              </span>
              <div className="mt-4 grid gap-5 lg:grid-cols-3">
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

            <div
              data-slot="bill-total"
              className="rounded-2xl border border-border/60 bg-surface/60 p-5"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <span className="text-sm leading-none font-medium text-muted-foreground">
                  Total
                </span>
                <span className="font-heading text-xl font-semibold text-brand">
                  {formatPkr(total)}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground" data-slot="bill-words">
                {words}
              </p>
            </div>
          </div>

          {/* Previously used customers, so a name can be picked and its details fill in. */}
          <datalist id="bill-known-customers">
            {knownCustomers.map((customer) => (
              <option key={customer.name} value={customer.name} />
            ))}
          </datalist>

          <div className="mt-6 flex justify-center">
            <NoiseButton type="submit" disabled={!isValid || submitting}>
              {submitting ? "Saving…" : "Create Bill"}
            </NoiseButton>
          </div>

          {invoiceNotice ? (
            <p role="status" className="mt-4 text-center text-sm text-muted-foreground">
              {invoiceNotice}
            </p>
          ) : null}
          {submitError ? (
            <p role="alert" className="mt-4 text-center text-sm text-destructive">
              {submitError}
            </p>
          ) : null}
        </section>
      </form>
    </Form>
  );
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
