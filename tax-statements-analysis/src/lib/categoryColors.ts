// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
/**
 * The colour palette categories are chosen from (client request).
 *
 * Colours are stored as plain hex strings, exactly as chosen, so a category's
 * colour never depends on the theme being applied.
 */

export interface CategoryColor {
  name: string;
  value: string;
}

export const CATEGORY_PALETTE: CategoryColor[] = [
  { name: "Green", value: "#44cc00" },
  { name: "Teal", value: "#14b8a6" },
  { name: "Sky", value: "#0ea5e9" },
  { name: "Indigo", value: "#6366f1" },
  { name: "Violet", value: "#8b5cf6" },
  { name: "Pink", value: "#ec4899" },
  { name: "Red", value: "#ef4444" },
  { name: "Orange", value: "#f97316" },
  { name: "Amber", value: "#f59e0b" },
  { name: "Slate", value: "#64748b" },
];

/** The colour offered first when creating a category. */
export const DEFAULT_CATEGORY_COLOR = CATEGORY_PALETTE[0].value;

/** The colour actually usable, so a blank or unknown value still renders a swatch. */
export function resolveCategoryColor(color: string | null | undefined): string {
  const trimmed = color?.trim();
  return trimmed ? trimmed : DEFAULT_CATEGORY_COLOR;
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
