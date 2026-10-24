// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRepositories } from "@/components/providers/DataProvider";
import {
  ClientFields,
  draftFromClient,
  draftToClient,
  emptyClientDraft,
  type ClientDraft,
} from "@/components/clients/ClientFields";
import type { Client } from "@/domain/types";

export interface EditClientDialogProps {
  client: Client | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/**
 * Correct a stored client (client request). This **replaces** the client's own
 * details and contacts, so a number removed here actually disappears; the CNIC —
 * the client's identity — is shown but cannot be changed.
 */
export function EditClientDialog({
  client,
  open,
  onOpenChange,
  onSaved,
}: EditClientDialogProps) {
  const { clients: repository } = useRepositories();
  const [draft, setDraft] = useState<ClientDraft>(() => emptyClientDraft());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && client) {
      setDraft(draftFromClient(client));
      setError(null);
    }
  }, [open, client]);

  const ready = draft.name.trim() !== "";

  async function save() {
    if (!client) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await repository.update(draftToClient(draft));
      onSaved();
      onOpenChange(false);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "The client could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit client</DialogTitle>
          <DialogDescription>
            {client ? `${client.name} (${client.cnic})` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-2xl border border-border/60 bg-surface/60 p-5">
          <ClientFields
            draft={draft}
            onChange={setDraft}
            disabled={saving}
            cnicReadOnly
          />
        </div>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={saving || !ready} onClick={() => void save()}>
            {saving ? "Saving…" : "Save client"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
