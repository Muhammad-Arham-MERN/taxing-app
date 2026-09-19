// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
/**
 * The View Bills filters (FR-038, FR-065).
 *
 * Both the From and the To date are **optional** — with neither set the list
 * shows every bill — and the Customer filter sits beside them. The two combine,
 * so the list can be narrowed to one customer within a chosen period.
 */
import { CalendarDays, X } from "lucide-react";
import { CustomerFilter } from "@/components/bills/CustomerFilter";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { BillFilter, Customer } from "@/domain/types";
import { parseIsoDate, toIsoDate } from "@/lib/format";

export interface BillFiltersProps {
  filter: BillFilter;
  customers: Customer[];
  onChange: (next: BillFilter) => void;
  disabled?: boolean;
}

function OptionalDateField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-2">
      <span className="text-sm leading-none font-medium">{label}</span>
      <div className="flex gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="h-11 flex-1 justify-start px-4 text-base font-normal"
              disabled={disabled}
            >
              <CalendarDays className="opacity-60" />
              {value ?? "Any date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <Calendar
              mode="single"
              autoFocus
              selected={value ? parseIsoDate(value) : undefined}
              onSelect={(date) => {
                if (date) {
                  onChange(toIsoDate(date));
                }
              }}
            />
          </PopoverContent>
        </Popover>
        {value ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Clear ${label}`}
            disabled={disabled}
            onClick={() => onChange(null)}
          >
            <X aria-hidden="true" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function BillFilters({
  filter,
  customers,
  onChange,
  disabled = false,
}: BillFiltersProps) {
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <OptionalDateField
        label="From"
        value={filter.from}
        onChange={(from) => onChange({ ...filter, from })}
        disabled={disabled}
      />
      <OptionalDateField
        label="To"
        value={filter.to}
        onChange={(to) => onChange({ ...filter, to })}
        disabled={disabled}
      />
      <CustomerFilter
        customers={customers}
        value={filter.customer}
        onChange={(customer) => onChange({ ...filter, customer })}
        disabled={disabled}
      />
    </div>
  );
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
