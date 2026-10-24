// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import { cn } from "cn";
import type { SyncOutcome, SyncOutcomeKind } from "@/domain/types";

export interface CloudOutcomeMessageProps {
  outcome: SyncOutcome | null;
}

/** Tone per outcome kind: successes calm, no-op neutral, failures clear (FR-033). */
const TONE: Record<SyncOutcomeKind, string> = {
  success: "text-emerald-600 dark:text-emerald-400",
  "nothing-new": "text-muted-foreground",
  "no-internet": "text-amber-600 dark:text-amber-400",
  "secrets-unavailable": "text-amber-600 dark:text-amber-400",
  "server-unavailable": "text-destructive",
  other: "text-destructive",
};

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/**
 * Renders exactly **one** plain-language outcome per attempt (FR-033). Nothing is
 * shown between attempts, so the practitioner never reads a stale result.
 */
export function CloudOutcomeMessage({ outcome }: CloudOutcomeMessageProps) {
  if (!outcome) {
    return null;
  }

  return (
    <p
      data-slot="cloud-outcome"
      data-kind={outcome.kind}
      role="status"
      className={cn("max-w-xs text-xs leading-snug", TONE[outcome.kind])}
    >
      {outcome.message}
    </p>
  );
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
