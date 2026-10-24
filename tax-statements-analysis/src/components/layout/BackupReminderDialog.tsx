// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import { HardDriveDownload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface BackupReminderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The once-a-month nudge to back up the database file (client request). It only
 * tells the practitioner what to do — the copy itself is theirs to make.
 */
export function BackupReminderDialog({ open, onOpenChange }: BackupReminderDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HardDriveDownload aria-hidden="true" className="size-4 text-brand" />
            Time to back up your records
          </DialogTitle>
          <DialogDescription>
            Your records live in a single file named <code>tax-statements.sqlite</code> in the
            folder you chose. Copy that file somewhere safe — an external drive or a backup
            folder — so a lost or damaged computer never costs you your work.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
