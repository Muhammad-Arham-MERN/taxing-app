// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CloudOutcomeMessage } from "@/components/cloud/CloudOutcomeMessage";
import { SyncProgress } from "@/components/cloud/SyncProgress";
import type { CloudPhase, SyncOutcome } from "@/domain/types";

export interface CloseWarningDialogProps {
  open: boolean;
  phase: CloudPhase;
  outcome: SyncOutcome | null;
  onPushThenClose: () => void;
  onCloseAnyway: () => void;
  onCancel: () => void;
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/**
 * The close-time warning: **Push then close**, **Close without pushing**, or
 * **Cancel** (FR-025–FR-028).
 *
 * Closing is always allowed — no option traps the practitioner; the un-pushed
 * work stays safe on this machine and publishes on the next Push.
 */
export function CloseWarningDialog({
  open,
  phase,
  outcome,
  onPushThenClose,
  onCloseAnyway,
  onCancel,
}: CloseWarningDialogProps) {
  const busy = phase !== "idle";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) {
          onCancel();
        }
      }}
    >
      <DialogContent showCloseButton={false} data-slot="close-warning">
        <DialogHeader>
          <DialogTitle>You have changes that are not published yet</DialogTitle>
          <DialogDescription>
            Publish them to the cloud now, or close and keep them safe on this machine. Nothing
            is ever lost either way.
          </DialogDescription>
        </DialogHeader>

        {busy ? <SyncProgress label="Pushing…" /> : <CloudOutcomeMessage outcome={outcome} />}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" variant="outline" onClick={onCloseAnyway} disabled={busy}>
            Close without pushing
          </Button>
          <Button type="button" onClick={onPushThenClose} disabled={busy}>
            Push then close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
