// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import { useEffect, useState } from "react";
import { useForm, useFormState, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useRepositories } from "@/components/providers/DataProvider";
import { FileAttachmentField } from "@/components/statements/FileAttachmentField";
import { TypeNatureSelect } from "@/components/statements/TypeNatureSelect";
import type { AttachmentPayload, Statement, StatementType } from "@/domain/types";
import {
  statementFormSchema,
  toNewStatement,
  type StatementFormInput,
  type StatementFormOutput,
} from "@/domain/validation";
import { parseIsoDate, toIsoDate } from "@/lib/format";

const FIELD_INPUT_CLASS = "h-11 text-base md:text-base";

export interface EditStatementDialogProps {
  statement: Statement | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

function toFormInput(statement: Statement): StatementFormInput {
  return {
    date: statement.date,
    type: statement.type,
    nature: statement.nature,
    amount: String(statement.amount),
    remarks: statement.remarks ?? "",
  };
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/**
 * Correcting a stored statement (FR-038–FR-049).
 *
 * The three outcomes for the file are explicit rather than inferred from whether
 * a new one was picked: **keep** it untouched, **remove** it, or **replace** it.
 * "Keep" matters — re-uploading the same file would rewrite the stored blob for
 * no reason (FR-047).
 */
export function EditStatementDialog({
  statement,
  open,
  onOpenChange,
  onSaved,
}: EditStatementDialogProps) {
  const { statements } = useRepositories();
  const [pending, setPending] = useState<AttachmentPayload | null>(null);
  const [removed, setRemoved] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const form = useForm<StatementFormInput, unknown, StatementFormOutput>({
    resolver: zodResolver(statementFormSchema),
    mode: "onChange",
  });

  useEffect(() => {
    if (open && statement) {
      form.reset(toFormInput(statement));
      setPending(null);
      setRemoved(false);
      setFileError(null);
      setSaveError(null);
      setSaving(false);
    }
  }, [open, statement, form]);

  const typeValue = useWatch({ control: form.control, name: "type" });
  const type: StatementType | "" =
    typeValue === "inflow" || typeValue === "outflow" ? typeValue : "";
  const nature = useWatch({ control: form.control, name: "nature" }) ?? "";
  const { isValid, errors } = useFormState({ control: form.control });

  const storedStillAttached = !pending && !removed && Boolean(statement?.fileName);
  const shownName = pending?.fileName ?? (removed ? null : (statement?.fileName ?? null));

  async function openStored() {
    if (!statement) {
      return;
    }
    setFileError(null);
    try {
      await statements.openAttachment(statement.id);
    } catch (error) {
      // The save action stays available even when opening fails (FR-075).
      setFileError(
        error instanceof Error ? error.message : "That file could not be opened.",
      );
    }
  }

  async function saveCopy() {
    if (!statement) {
      return;
    }
    setFileError(null);
    try {
      await statements.saveAttachmentCopy(statement.id);
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "The copy could not be saved.");
    }
  }

  const onSubmit = form.handleSubmit(async (values) => {
    if (!statement || saving) {
      return;
    }
    setSaving(true);
    setSaveError(null);

    const next = toNewStatement(values, shownName);

    try {
      await statements.update({
        id: statement.id,
        date: next.date,
        type: next.type,
        nature: next.nature,
        amount: next.amount,
        remarks: next.remarks,
        attachment: pending
          ? { action: "replace", fileName: pending.fileName, bytes: pending.bytes }
          : removed
            ? { action: "remove" }
            : { action: "keep" },
      });
      onSaved();
      onOpenChange(false);
    } catch (error) {
      // The stored record is unchanged when a save fails (FR-049).
      setSaveError(error instanceof Error ? error.message : "The change could not be saved.");
    } finally {
      setSaving(false);
    }
  });

  const natureError = errors.nature?.message;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit statement</DialogTitle>
          <DialogDescription>
            Correcting this statement replaces it — it does not create a second one.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={onSubmit} noValidate className="grid gap-5">
            <div className="grid gap-5 sm:grid-cols-2">
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
            </div>

            <div className="grid gap-2">
              <span className="text-sm leading-none font-medium">Type / Nature</span>
              <TypeNatureSelect
                type={type}
                nature={nature}
                onTypeChange={(nextType) =>
                  form.setValue("type", nextType, { shouldValidate: true })
                }
                onNatureChange={(nextNature) =>
                  form.setValue("nature", nextNature, { shouldValidate: true })
                }
                disabled={saving}
              />
              {natureError ? <p className="text-sm text-destructive">{natureError}</p> : null}
            </div>

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
                fileName={shownName}
                onFileNameChange={(name) => {
                  if (!name) {
                    setPending(null);
                    setRemoved(true);
                  }
                }}
                onFileSelected={(payload) => {
                  setPending(payload);
                  setRemoved(false);
                }}
                onOpen={storedStillAttached ? openStored : undefined}
                onSaveCopy={storedStillAttached ? saveCopy : undefined}
                disabled={saving}
              />
            </div>

            {fileError ? (
              <p role="alert" className="text-sm text-destructive">
                {fileError}
              </p>
            ) : null}

            {saveError ? (
              <p role="alert" className="text-sm text-destructive">
                {saveError}
              </p>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!isValid || saving}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
