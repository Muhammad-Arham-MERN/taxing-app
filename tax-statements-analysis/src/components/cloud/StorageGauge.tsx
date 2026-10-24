// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import { LuCloud, LuFileArchive } from "react-icons/lu";
import type { CloudUsage, ObjectUsage } from "@/domain/types";

export interface StorageGaugeProps {
  usage: CloudUsage | null;
}

function formatBytes(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) {
    return `${gb.toFixed(2)} GB`;
  }
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) {
    return `${mb.toFixed(1)} MB`;
  }
  return `${Math.round(bytes / 1024)} KB`;
}

function GaugeBar({ fraction, barClassName = "bg-brand" }: { fraction: number; barClassName?: string }) {
  return (
    <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
      <div
        className={`h-full ${barClassName}`}
        style={{ width: `${Math.max(0, Math.min(100, Math.round(fraction * 100)))}%` }}
      />
    </div>
  );
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/**
 * The header's purple **"Turso Cloud"** storage-left gauge (FR-029–FR-032).
 *
 * Shows how much of the allowance remains as a proportion; when the figure
 * cannot be fetched it reads **unavailable** rather than showing a stale number
 * (FR-031).
 */
export function StorageGauge({ usage }: StorageGaugeProps) {
  return (
    <div data-slot="storage-gauge" className="flex flex-col items-end gap-1">
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-brand">
        <LuCloud aria-hidden="true" className="size-4" />
        Turso Cloud
      </span>

      {usage ? (
        <>
          <span className="text-xs text-muted-foreground">
            {formatBytes(usage.remainingBytes)} left of {formatBytes(usage.allowanceBytes)}
          </span>
          <div
            role="progressbar"
            aria-label="Turso Cloud storage remaining"
            aria-valuemin={0}
            aria-valuemax={usage.allowanceBytes}
            aria-valuenow={usage.remainingBytes}
          >
            <GaugeBar
              fraction={
                usage.allowanceBytes > 0 ? usage.remainingBytes / usage.allowanceBytes : 0
              }
            />
          </div>
        </>
      ) : (
        <span className="text-xs text-muted-foreground">Storage left: unavailable</span>
      )}
    </div>
  );
}

export interface ObjectStorageGaugeProps {
  usage: ObjectUsage | null;
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/**
 * The header's **Oracle** file gauge: how much the bucket holds, and how many
 * files on this machine are still waiting to upload. When no bucket allowance is
 * configured it reads "used" rather than inventing a headroom figure; when the
 * bucket cannot be listed it reads **unavailable**.
 */
export function ObjectStorageGauge({ usage }: ObjectStorageGaugeProps) {
  return (
    <div data-slot="object-storage-gauge" className="flex flex-col items-end gap-1">
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-oracle">
        <LuFileArchive aria-hidden="true" className="size-4" />
        Oracle Files
      </span>

      {usage ? (
        <>
          <span className="text-xs text-muted-foreground">
            {usage.allowanceBytes !== null && usage.remainingBytes !== null
              ? `${formatBytes(usage.remainingBytes)} left of ${formatBytes(usage.allowanceBytes)}`
              : `${formatBytes(usage.usedBytes)} used`}
            {usage.pendingUploads > 0 ? ` · ${usage.pendingUploads} to upload` : ""}
          </span>
          {usage.allowanceBytes !== null && usage.remainingBytes !== null ? (
            <div
              role="progressbar"
              aria-label="Oracle file storage remaining"
              aria-valuemin={0}
              aria-valuemax={usage.allowanceBytes}
              aria-valuenow={usage.remainingBytes}
            >
              <GaugeBar
                fraction={
                  usage.allowanceBytes > 0 ? usage.remainingBytes / usage.allowanceBytes : 0
                }
                barClassName="bg-oracle"
              />
            </div>
          ) : null}
        </>
      ) : (
        <span className="text-xs text-muted-foreground">Files: unavailable</span>
      )}
    </div>
  );
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
