// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Category } from "@/domain/types";
import { resolveCategoryColor } from "@/lib/categoryColors";

export interface CategorySelectProps {
  categories: Category[];
  /** The chosen category's id, or `null` for "None". */
  value: string | null;
  onChange: (id: string | null) => void;
  id?: string;
  disabled?: boolean;
}

/** A single-category picker (used by the client form, the client edit and a record). */
export function CategorySelect({
  categories,
  value,
  onChange,
  id,
  disabled = false,
}: CategorySelectProps) {
  const [open, setOpen] = useState(false);
  const selected = categories.find((category) => category.id === value) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className="h-11 w-full justify-between px-3 text-base font-normal"
        >
          <span className="flex items-center gap-2 truncate">
            {selected ? (
              <>
                <span
                  aria-hidden="true"
                  className="size-3 shrink-0 rounded-full"
                  style={{ background: resolveCategoryColor(selected.color) }}
                />
                <span className="truncate">{selected.name}</span>
              </>
            ) : (
              <span className="text-muted-foreground">None</span>
            )}
          </span>
          <ChevronDown aria-hidden="true" className="opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width)">
        <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
          <li>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-muted/50"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              <span className="flex-1 text-muted-foreground">None</span>
              {value === null ? <Check aria-hidden="true" className="size-4 text-brand" /> : null}
            </button>
          </li>
          {categories.map((category) => (
            <li key={category.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-muted/50"
                onClick={() => {
                  onChange(category.id);
                  setOpen(false);
                }}
              >
                <span
                  aria-hidden="true"
                  className="size-3 shrink-0 rounded-full"
                  style={{ background: resolveCategoryColor(category.color) }}
                />
                <span className="flex-1 truncate">{category.name}</span>
                {value === category.id ? (
                  <Check aria-hidden="true" className="size-4 text-brand" />
                ) : null}
              </button>
            </li>
          ))}
          {categories.length === 0 ? (
            <li className="px-1.5 py-1 text-sm text-muted-foreground">
              No categories yet.
            </li>
          ) : null}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
