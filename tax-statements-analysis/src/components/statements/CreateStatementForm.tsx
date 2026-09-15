// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import { useRef, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useRepositories } from "@/components/providers/DataProvider";
import { FileAttachmentField } from "@/components/statements/FileAttachmentField";
import { NoiseButton } from "@/components/statements/NoiseButton";
import { TypeNatureSelect } from "@/components/statements/TypeNatureSelect";
import type { AttachmentPayload, StatementType } from "@/domain/types";
import {
  statementFormSchema,
  toNewStatement,
  type StatementFormInput,
  type StatementFormOutput,
} from "@/domain/validation";
import { parseIsoDate, toIsoDate, todayIso } from "@/lib/format";

const FIELD_INPUT_CLASS = "h-11 text-base md:text-base";

function createEmptyForm(): StatementFormInput {
  return {
    date: todayIso(),
    type: "",
    nature: "",
    amount: "",
    remarks: "",
  };
}

export interface CreateStatementFormProps {
  onCreated?: () => void;
}

export function CreateStatementForm({ onCreated }: CreateStatementFormProps) {
  const { statements } = useRepositories();
  // The chosen file is held in full, not just by name: the store keeps its
  // contents, so the name alone would lose the file (FR-003).
  const [attachment, setAttachment] = useState<AttachmentPayload | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const form = useForm<StatementFormInput, unknown, StatementFormOutput>({
    resolver: zodResolver(statementFormSchema),
    mode: "onChange",
    defaultValues: createEmptyForm(),
  });

  const typeValue = useWatch({ control: form.control, name: "type" });
  const type: StatementType | "" =
    typeValue === "inflow" || typeValue === "outflow" ? typeValue : "";
  const nature = useWatch({ control: form.control, name: "nature" }) ?? "";
  const { isValid, errors } = useFormState({ control: form.control });

  function handleTypeChange(nextType: StatementType) {
    form.setValue("type", nextType, { shouldValidate: true, shouldDirty: true });
  }

  function handleNatureChange(nextNature: string) {
    form.setValue("nature", nextNature, { shouldValidate: true, shouldDirty: true });
  }

  // وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
  const onSubmit = form.handleSubmit(async (values) => {
    // Synchronous in-flight guard: a rapid second click cannot pass this check
    // before the first submission settles (FR-016).
    if (submittingRef.current) {
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);

    try {
      await statements.create(
        toNewStatement(values, attachment?.fileName ?? null),
        attachment,
      );
      form.reset(createEmptyForm());
      setAttachment(null);
      onCreated?.();
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Unable to record the statement.",
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  });

  const nameError = errors.nature?.message;

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate>
        <section
          data-slot="create-panel"
          className="rounded-4xl border border-border bg-card/60 p-6"
        >
          <h2 className="font-heading text-lg font-semibold">Create Statements</h2>

          <div className="mt-5 rounded-2xl border border-border/60 bg-surface/60 p-5">
            <div className="grid gap-5 lg:grid-cols-3">
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

              <div className="grid gap-2 lg:col-span-2">
                <span className="text-sm leading-none font-medium">Type / Nature</span>
                <TypeNatureSelect
                  type={type}
                  nature={nature}
                  onTypeChange={handleTypeChange}
                  onNatureChange={handleNatureChange}
                  disabled={submitting}
                />
                {nameError ? <p className="text-sm text-destructive">{nameError}</p> : null}
              </div>

              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="decimal"
                        placeholder="0.00"
                        className={FIELD_INPUT_CLASS}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="remarks"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Remarks</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Optional"
                        className={FIELD_INPUT_CLASS}
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-2">
                <span className="text-sm leading-none font-medium">File</span>
                <FileAttachmentField
                  fileName={attachment?.fileName ?? null}
                  onFileNameChange={(name) => {
                    if (!name) {
                      setAttachment(null);
                    }
                  }}
                  onFileSelected={setAttachment}
                  disabled={submitting}
                />
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-center">
            <NoiseButton type="submit" disabled={!isValid || submitting}>
              {submitting ? "Saving…" : "Create"}
            </NoiseButton>
          </div>

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
