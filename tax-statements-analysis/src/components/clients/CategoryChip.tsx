// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import type { Category } from "@/domain/types";
import { resolveCategoryColor } from "@/lib/categoryColors";

export interface CategoryChipProps {
  category: Category | null | undefined;
}

/** A category shown as a coloured dot beside its name. */
export function CategoryChip({ category }: CategoryChipProps) {
  if (!category) {
    return <span className="text-muted-foreground">None</span>;
  }
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span
        aria-hidden="true"
        className="size-2.5 shrink-0 rounded-full"
        style={{ background: resolveCategoryColor(category.color) }}
      />
      <span className="truncate">{category.name}</span>
    </span>
  );
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
