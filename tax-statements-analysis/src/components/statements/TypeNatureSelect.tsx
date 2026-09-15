// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { StatementType } from "@/domain/types";
import { isNatureValidForType, naturesForType } from "@/lib/natures";

const TYPE_OPTIONS: ReadonlyArray<{ value: StatementType; label: string }> = [
  { value: "inflow", label: "In-Flow" },
  { value: "outflow", label: "Out-Flow" },
];

function typeLabel(type: StatementType): string {
  return type === "inflow" ? "In-Flow" : "Out-Flow";
}

export interface TypeNatureSelectProps {
  type: StatementType | "";
  nature: string;
  onTypeChange: (type: StatementType) => void;
  onNatureChange: (nature: string) => void;
  disabled?: boolean;
}

export function TypeNatureSelect({
  type,
  nature,
  onTypeChange,
  onNatureChange,
  disabled = false,
}: TypeNatureSelectProps) {
  const [typeOpen, setTypeOpen] = useState(false);
  const [natureOpen, setNatureOpen] = useState(false);

  const natureDisabled = disabled || type === "";
  const options = type === "" ? [] : naturesForType(type);

  function handleTypeChange(nextType: StatementType) {
    onTypeChange(nextType);
    if (nature !== "" && !isNatureValidForType(nature, nextType)) {
      onNatureChange("");
    }
    setTypeOpen(false);
  }

  return (
    <div className="flex items-start gap-2">
      <Popover open={typeOpen} onOpenChange={setTypeOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            aria-label="Type"
            disabled={disabled}
            className="h-11 w-40 justify-between px-4 text-base font-normal"
          >
            {type === "" ? "Select type" : typeLabel(type)}
            <ChevronDown className="opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-40 p-1">
          <div role="listbox" aria-label="Type options">
            {TYPE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={type === option.value}
                className={cn(
                  "flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
                  type === option.value && "bg-muted",
                )}
                onClick={() => handleTypeChange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <Popover open={natureOpen} onOpenChange={setNatureOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            aria-label="Nature"
            disabled={natureDisabled}
            className="h-11 w-64 justify-between px-4 text-base font-normal"
          >
            <span className="truncate">{nature === "" ? "Select nature" : nature}</span>
            <ChevronDown className="opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="max-h-72 w-72 overflow-y-auto p-1">
          <div role="listbox" aria-label="Nature options">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={nature === option.value}
                className={cn(
                  "flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
                  nature === option.value && "bg-muted",
                )}
                onClick={() => {
                  onNatureChange(option.value);
                  setNatureOpen(false);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
