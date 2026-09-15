// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { StorageRepository } from "@/data/repositories";
import type { CarryAcrossChoice, LocationRisk } from "@/domain/types";

export interface StorageLocationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storage: StorageRepository;
  /** A usable store is already open, so its records could be brought across. */
  hasCurrentStore: boolean;
  /** Called after the location changes, so the caller can re-read the state. */
  onChanged: () => void;
}

type Pending = { kind: "directory" | "file"; path: string };

function describeRisk(risk: LocationRisk): string {
  switch (risk) {
    case "cloud-synced":
      return "That folder is synced to the cloud, so your records would be copied off this machine.";
    case "network":
      return "That folder is on a network share, so your records would be reachable from other machines.";
    case "removable":
      return "That is removable media, so your records would become unreachable if it is unplugged.";
  }
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/**
 * The whole "where do your records live" flow in one dialog: pick a folder or a
 * backup file, see why a choice was refused, confirm a choice that would let the
 * records leave the machine, and decide what happens to the records already in
 * use (FR-013–FR-019, FR-055, FR-059, FR-060).
 */
export function StorageLocationDialog({
  open,
  onOpenChange,
  storage,
  hasCurrentStore,
  onChanged,
}: StorageLocationDialogProps) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [risk, setRisk] = useState<LocationRisk | null>(null);
  const [rejection, setRejection] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    setPending(null);
    setRisk(null);
    setRejection(null);
    setError(null);
    setBusy(false);
  }

  async function choose(kind: "directory" | "file") {
    setRejection(null);
    setError(null);

    const path =
      kind === "directory" ? await storage.pickDirectory() : await storage.pickStoreFile();

    // Cancelled: nothing changes at all (FR-024).
    if (!path) {
      return;
    }

    const assessment = await storage.assess(kind, path);
    if (!assessment.acceptable) {
      setPending(null);
      setRejection(assessment.rejection ?? "That location cannot be used.");
      return;
    }

    setPending({ kind, path });
    setRisk(assessment.warning);
  }

  async function commit(choice: CarryAcrossChoice) {
    if (!pending) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await storage.setLocation(pending.kind, pending.path, choice);
      reset();
      onChanged();
      onOpenChange(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The location could not be used.");
      setBusy(false);
    }
  }

  const deciding = pending !== null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          reset();
        }
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Where should your records be kept?</DialogTitle>
          <DialogDescription>
            Your statements and their files are kept in one file. Choose a folder for a new
            one, or point at a copy you already have.
          </DialogDescription>
        </DialogHeader>

        {!deciding ? (
          <div className="grid gap-3">
            <Button type="button" variant="outline" size="lg" onClick={() => choose("directory")}>
              Choose a folder
            </Button>
            <Button type="button" variant="outline" size="lg" onClick={() => choose("file")}>
              Use a records file I already have
            </Button>

            {rejection ? (
              <p role="alert" className="text-sm text-destructive">
                {rejection}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-4">
            <p className="text-sm break-all text-muted-foreground">
              {pending.path}
            </p>

            {risk ? (
              <p role="alert" className="text-sm text-destructive">
                {describeRisk(risk)}
              </p>
            ) : null}

            {hasCurrentStore ? (
              <>
                <p className="text-sm">Your existing records — do they come with you?</p>
                <div className="grid gap-2">
                  <Button type="button" disabled={busy} onClick={() => commit("bring")}>
                    Bring my records across
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => commit("start-fresh")}
                  >
                    Start fresh here
                  </Button>
                </div>
              </>
            ) : (
              <Button type="button" disabled={busy} onClick={() => commit("start-fresh")}>
                {busy ? "Setting up…" : "Use this location"}
              </Button>
            )}

            <Button type="button" variant="ghost" disabled={busy} onClick={reset}>
              Back
            </Button>
          </div>
        )}

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
