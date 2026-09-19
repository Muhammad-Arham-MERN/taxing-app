// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
/**
 * The View Bills Customer filter (FR-065).
 *
 * A drop-down of every customer billed before, which can also be typed into, so
 * a customer is found by any part of their name. Clearing it removes the filter.
 */
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Customer } from "@/domain/types";

export interface CustomerFilterProps {
  customers: Customer[];
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}

const LIST_ID = "bill-customer-options";

export function CustomerFilter({
  customers,
  value,
  onChange,
  disabled = false,
}: CustomerFilterProps) {
  return (
    <div className="grid gap-2">
      <label className="text-sm leading-none font-medium" htmlFor="bill-customer-filter">
        Customer
      </label>
      <div className="flex gap-2">
        <Input
          id="bill-customer-filter"
          className="h-11 text-base md:text-base"
          list={LIST_ID}
          placeholder="All customers"
          disabled={disabled}
          value={value ?? ""}
          onChange={(event) => {
            const next = event.target.value;
            onChange(next.trim().length > 0 ? next : null);
          }}
        />
        {value ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Clear customer"
            disabled={disabled}
            onClick={() => onChange(null)}
          >
            <X aria-hidden="true" />
          </Button>
        ) : null}
      </div>
      <datalist id={LIST_ID}>
        {customers.map((customer) => (
          <option key={customer.name} value={customer.name} />
        ))}
      </datalist>
    </div>
  );
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
