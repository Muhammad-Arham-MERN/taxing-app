// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
/** A labelled text entry shared by the create and edit bill forms. */
import type { Control, FieldPath } from "react-hook-form";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import type { BillFormInput, BillFormOutput } from "@/domain/billValidation";

const FIELD_INPUT_CLASS = "h-11 text-base md:text-base";

export type BillTextFieldName = Extract<
  FieldPath<BillFormInput>,
  | "customerName"
  | "customerAddress"
  | "contactPerson"
  | "contactNumber"
  | "email"
  | "ntn"
  | "customerPassword"
  | "accountHolder"
>;

export interface BillTextFieldProps {
  control: Control<BillFormInput, unknown, BillFormOutput>;
  name: BillTextFieldName;
  label: string;
  placeholder?: string;
  disabled?: boolean;
  /** id of a `<datalist>` of suggestions, so a previously used value is offered. */
  listId?: string;
}

export function BillTextField({
  control,
  name,
  label,
  placeholder,
  disabled,
  listId,
}: BillTextFieldProps) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              className={FIELD_INPUT_CLASS}
              placeholder={placeholder}
              disabled={disabled}
              list={listId}
              {...field}
              value={field.value ?? ""}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
