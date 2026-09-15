// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { StatementFilter } from "@/domain/types";
import { firstOfCurrentMonthIso, parseIsoDate, toIsoDate, todayIso } from "@/lib/format";

export function createDefaultFilter(): StatementFilter {
  return { from: firstOfCurrentMonthIso(), to: todayIso() };
}

interface DateFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}

function DateField({ id, label, value, onChange }: DateFieldProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            className="h-12 w-52 justify-start px-4 text-base font-normal"
          >
            <CalendarDays className="opacity-60" />
            {value}
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
                setOpen(false);
              }
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

export interface DateRangeFilterProps {
  from: string;
  to: string;
  onChange: (next: StatementFilter) => void;
}

export function DateRangeFilter({ from, to, onChange }: DateRangeFilterProps) {
  const invalidRange = from > to;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <DateField
          id="filter-from"
          label="From"
          value={from}
          onChange={(value) => onChange({ from: value, to })}
        />

        <div className="flex flex-1 items-center gap-3 pb-4">
          <span aria-hidden="true" className="h-px flex-1 bg-border" />
          <span className="text-xs tracking-wide text-muted-foreground uppercase">to</span>
          <span aria-hidden="true" className="h-px flex-1 bg-border" />
        </div>

        <DateField
          id="filter-to"
          label="To"
          value={to}
          onChange={(value) => onChange({ from, to: value })}
        />
      </div>

      {invalidRange ? (
        <p role="alert" className="text-sm text-destructive">
          The From date must be on or before the To date.
        </p>
      ) : null}
    </div>
  );
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
