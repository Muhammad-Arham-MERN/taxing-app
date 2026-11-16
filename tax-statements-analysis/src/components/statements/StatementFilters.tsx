// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
/**
 * The View Statements **search** and **type filter** (client request).
 *
 * The search box matches any statement field the list shows — its nature, its
 * remarks and its **file name** — and the Filter drop-down offers the two flow
 * types, each opening a submenu of the natures that type can be created with
 * (`lib/natures.ts`). Both combine with the date range above the table, and the
 * filtering is done over the already-loaded rows.
 */
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { StatementType } from "@/domain/types";
import { naturesForType } from "@/lib/natures";

const FLOW_TYPES: Array<{ type: StatementType; label: string }> = [
  { type: "inflow", label: "In-Flow" },
  { type: "outflow", label: "Out-Flow" },
];

export interface StatementFiltersProps {
  query: string;
  onQueryChange: (query: string) => void;
  /** The selected natures; empty means "no nature filter". */
  natures: string[];
  onNaturesChange: (natures: string[]) => void;
}

export function StatementFilters({
  query,
  onQueryChange,
  natures,
  onNaturesChange,
}: StatementFiltersProps) {
  function toggle(nature: string) {
    onNaturesChange(
      natures.includes(nature)
        ? natures.filter((entry) => entry !== nature)
        : [...natures, nature],
    );
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="flex flex-1 items-center gap-2">
        <Search aria-hidden="true" className="size-4 opacity-60" />
        <Input
          value={query}
          aria-label="Search statements"
          placeholder="Search nature, remarks, file name…"
          className="h-11 text-base md:text-base"
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="h-11 shrink-0 px-4 text-base"
            aria-label="Filter statements"
          >
            Filter
            {natures.length > 0 ? (
              <span className="ml-1 rounded-full bg-brand px-1.5 text-xs text-brand-foreground">
                {natures.length}
              </span>
            ) : null}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Filter by type</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {FLOW_TYPES.map((flow) => (
            <DropdownMenuSub key={flow.type}>
              <DropdownMenuSubTrigger>{flow.label}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {naturesForType(flow.type).map((option) => (
                  <DropdownMenuCheckboxItem
                    key={option.value}
                    checked={natures.includes(option.value)}
                    onCheckedChange={() => toggle(option.value)}
                  >
                    {option.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ))}
          {natures.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onNaturesChange([])}>
                Clear filter
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
