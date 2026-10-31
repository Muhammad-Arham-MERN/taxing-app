// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import { useTransfer } from "@/components/providers/TransferProgressProvider";

export interface TransferBadgeProps {
  /** The row's file object key; the matching transfer, if any, is shown. */
  fileRef: string | null;
}

const RADIUS = 7;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/**
 * The circular loader shown beside a row while its file's bytes are moving:
 * purple for an **upload**, green for a **download** (the same tokens the header
 * gauges use). It is indeterminate while the size is unknown and a filling ring
 * once it is, and renders nothing at all when the file is not moving.
 */
export function TransferBadge({ fileRef }: TransferBadgeProps) {
  const transfer = useTransfer(fileRef);
  if (!transfer) {
    return null;
  }

  const uploading = transfer.direction === "upload";
  const tone = uploading ? "text-oracle" : "text-brand";
  const label = uploading ? "Uploading" : "Downloading";
  const determinate = transfer.total > 0;
  const fraction = determinate ? Math.min(1, transfer.transferred / transfer.total) : 0;
  const percent = Math.round(fraction * 100);
  // A three-quarter arc reads as "working, size unknown"; a real ring tracks it.
  const dashoffset = determinate ? CIRCUMFERENCE * (1 - fraction) : CIRCUMFERENCE * 0.75;

  return (
    <span
      data-slot="transfer-badge"
      role="status"
      aria-live="polite"
      aria-label={`${label} ${transfer.fileName}${determinate ? ` (${percent}%)` : ""}`}
      title={`${label} ${transfer.fileName}`}
      className={`inline-flex shrink-0 items-center ${tone}`}
    >
      <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true">
        <circle
          cx="10"
          cy="10"
          r={RADIUS}
          fill="none"
          strokeWidth="2"
          className="stroke-current opacity-20"
        />
        <g transform="rotate(-90 10 10)">
          <circle
            cx="10"
            cy="10"
            r={RADIUS}
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={dashoffset}
            className={`origin-center stroke-current ${
              determinate ? "transition-[stroke-dashoffset] duration-150" : "animate-spin"
            }`}
          />
        </g>
      </svg>
    </span>
  );
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
