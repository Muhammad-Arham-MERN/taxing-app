// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
/**
 * The JazzCash / Easypaisa number lists (client change, 2026-09-19).
 *
 * Each wallet starts with one number and a "+" adds as many more as the
 * practitioner wants; the last remaining row cannot be removed. Blank rows are
 * ignored when the bill is saved.
 */
import {
  useFieldArray,
  useFormState,
  type Control,
  type FieldPath,
} from "react-hook-form";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BillFormInput, BillFormOutput } from "@/domain/billValidation";
import { WALLET_PLACEHOLDERS } from "@/domain/identity";

export type WalletNumbersName = "jazzcashNumbers" | "easypaisaNumbers";

export interface WalletNumbersEditorProps {
  control: Control<BillFormInput, unknown, BillFormOutput>;
  name: WalletNumbersName;
  label: string;
  disabled?: boolean;
}

export function WalletNumbersEditor({
  control,
  name,
  label,
  disabled = false,
}: WalletNumbersEditorProps) {
  const { fields, append, remove } = useFieldArray({ control, name });
  const { errors } = useFormState({ control });

  // Read this list's per-row errors so a wrong number is explained, not just
  // left with the Create action disabled (client request, 2026-09-19).
  const listErrors = (errors as Record<string, unknown>)[name] as
    | Array<{ message?: string } | undefined>
    | undefined;

  // Each wallet keeps its own default example as the placeholder.
  const placeholder =
    name === "jazzcashNumbers"
      ? WALLET_PLACEHOLDERS.jazzcash
      : WALLET_PLACEHOLDERS.easypaisa;

  return (
    <div className="grid gap-2" data-slot={`wallet-numbers-${name}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm leading-none font-medium">{label}</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={`Add ${label}`}
          disabled={disabled}
          onClick={() => append("")}
        >
          <Plus aria-hidden="true" />
          Add
        </Button>
      </div>

      {fields.map((field, index) => {
        const message = listErrors?.[index]?.message;
        return (
          <div key={field.id} className="grid gap-1">
            <div className="flex gap-2">
              <Input
                aria-label={`${label} ${index + 1}`}
                inputMode="tel"
                placeholder={placeholder}
                disabled={disabled}
                {...control.register(`${name}.${index}` as FieldPath<BillFormInput>)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove ${label} ${index + 1}`}
                disabled={disabled || fields.length === 1}
                onClick={() => remove(index)}
              >
                <Minus aria-hidden="true" />
              </Button>
            </div>
            {message ? (
              <p role="alert" className="text-xs text-destructive">
                {message}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
