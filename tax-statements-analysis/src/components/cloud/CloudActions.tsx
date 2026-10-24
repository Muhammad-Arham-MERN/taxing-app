// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import { LuDownload, LuLoaderCircle, LuUpload } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import type { CloudSyncController } from "@/hooks/useCloudSync";

export interface CloudActionsProps {
  controller: CloudSyncController;
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/**
 * The header's **Push** and **Sync** actions as icon-only buttons (FR-006,
 * FR-013). Push sends this machine's changes up (an up arrow); Sync brings the
 * other machines' changes down (a down arrow, the opposite direction).
 *
 * Both are disabled unless the secrets are set up and nothing else is in flight.
 * The button that was pressed shows a spinner for the whole awaited duration
 * (FR-036), and the outcome is reported as a toast rather than painted beside the
 * buttons, so the header keeps its shape (FR-033, FR-037).
 */
export function CloudActions({ controller }: CloudActionsProps) {
  const { phase, status, push, pull } = controller;

  const busy = phase !== "idle";
  const configured = status?.configured ?? false;
  const disabled = busy || !configured;
  const hint = configured ? undefined : "Set up the cloud connection first.";

  return (
    <div data-slot="cloud-actions" className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="icon-lg"
        disabled={disabled}
        aria-label="Push"
        title={hint ?? "Push your changes to the cloud"}
        onClick={() => void push()}
      >
        {phase === "pushing" ? (
          <LuLoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        ) : (
          <LuUpload aria-hidden="true" className="size-4" />
        )}
      </Button>

      <Button
        type="button"
        variant="outline"
        size="icon-lg"
        disabled={disabled}
        aria-label="Sync"
        title={hint ?? "Bring down the other computers' changes"}
        onClick={() => void pull()}
      >
        {phase === "pulling" ? (
          <LuLoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        ) : (
          <LuDownload aria-hidden="true" className="size-4" />
        )}
      </Button>
    </div>
  );
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
