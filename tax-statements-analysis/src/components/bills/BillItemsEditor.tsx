// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
/**
 * A bill's line items (FR-013–FR-016).
 *
 * The "+" action adds another item; a removable one can be taken away and the
 * remaining items renumber automatically, because the item number **is** the
 * row's position. The last remaining item cannot be removed — a bill is never
 * left with none (FR-016). Each item also carries an optional "crossed" value,
 * rendered struck through beside the amount (client request).
 */
import { useFieldArray, useFormState, type Control } from "react-hook-form";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEFAULT_ITEM_DETAILS } from "@/domain/identity";
import type { BillFormInput, BillFormOutput } from "@/domain/billValidation";

export interface BillItemsEditorProps {
  control: Control<BillFormInput, unknown, BillFormOutput>;
  disabled?: boolean;
}

export function BillItemsEditor({ control, disabled = false }: BillItemsEditorProps) {
  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const { errors } = useFormState({ control });

  // Show each row's own errors, so an incomplete item is explained rather than
  // only leaving the Create action disabled (client request, 2026-09-19).
  const itemErrors = (errors as Record<string, unknown>)["items"] as
    | Array<
        | {
            details?: { message?: string };
            amount?: { message?: string };
            crossed?: { message?: string };
          }
        | undefined
      >
    | undefined;

  return (
    <div className="grid gap-3" data-slot="bill-items">
      <div className="flex items-center justify-between">
        <span className="text-sm leading-none font-medium">Items</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label="Add item"
          disabled={disabled}
          onClick={() => append({ details: "", amount: "", crossed: "" })}
        >
          <Plus aria-hidden="true" />
          Add item
        </Button>
      </div>

      {fields.map((field, index) => {
        const detailsError = itemErrors?.[index]?.details?.message;
        const amountError = itemErrors?.[index]?.amount?.message;
        const crossedError = itemErrors?.[index]?.crossed?.message;

        return (
          <div
            key={field.id}
            data-slot="bill-item-row"
            className="grid grid-cols-[auto_1fr_130px_110px_auto] items-start gap-2"
          >
            <span
              aria-hidden="true"
              className="flex h-11 w-9 items-center justify-center rounded-lg border border-border/60 bg-surface/60 text-sm text-muted-foreground"
            >
              {index + 1}
            </span>

            <div className="grid gap-1">
              <Input
                aria-label={`Details for item ${index + 1}`}
                placeholder={DEFAULT_ITEM_DETAILS}
                disabled={disabled}
                {...control.register(`items.${index}.details`)}
              />
              {detailsError ? (
                <p role="alert" className="text-xs text-destructive">
                  {detailsError}
                </p>
              ) : null}
            </div>

            <div className="grid gap-1">
              <Input
                aria-label={`Amount for item ${index + 1}`}
                inputMode="decimal"
                placeholder="0.00"
                disabled={disabled}
                {...control.register(`items.${index}.amount`)}
              />
              {amountError ? (
                <p role="alert" className="text-xs text-destructive">
                  {amountError}
                </p>
              ) : null}
            </div>

            <div className="grid gap-1">
              <Input
                aria-label={`Crossed for item ${index + 1}`}
                inputMode="decimal"
                placeholder="Crossed"
                title="Shown struck through beside the amount; not added to the total."
                disabled={disabled}
                {...control.register(`items.${index}.crossed`)}
              />
              {crossedError ? (
                <p role="alert" className="text-xs text-destructive">
                  {crossedError}
                </p>
              ) : null}
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove item ${index + 1}`}
              disabled={disabled || fields.length === 1}
              onClick={() => remove(index)}
            >
              <Minus aria-hidden="true" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
