// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import { LuLoader } from "react-icons/lu";

export interface SyncProgressProps {
  label?: string;
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/**
 * The loader shown for the **whole duration** of a Push or Sync (FR-036). It is
 * replaced by the outcome the moment the exchange finishes, so the practitioner
 * never sees a premature success (FR-037).
 */
export function SyncProgress({ label = "Working…" }: SyncProgressProps) {
  return (
    <span
      data-slot="sync-progress"
      role="status"
      aria-live="polite"
      className="inline-flex items-center gap-2 text-sm text-brand"
    >
      <LuLoader aria-hidden="true" className="size-4 animate-spin" />
      <span>{label}</span>
    </span>
  );
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
