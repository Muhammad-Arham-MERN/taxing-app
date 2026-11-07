// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import { useEffect, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { FileDropField } from "@/components/ui/file-drop-field";
import { CategorySelect } from "@/components/clients/CategorySelect";
import { useCreationLock } from "@/components/providers/CreationLockProvider";
import { useRepositories } from "@/components/providers/DataProvider";
import type { AttachmentPayload, Category, Client, ClientRecord } from "@/domain/types";
import { parseIsoDate, toIsoDate, todayIso } from "@/lib/format";

const FIELD_INPUT_CLASS = "h-11 text-base md:text-base";

export interface ClientRecordDialogProps {
  client: Client;
  /** The record being corrected, or `null` to create a new one. */
  record: ClientRecord | null;
  categories: Category[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

interface Draft {
  name: string;
  date: string;
  remarks: string;
  categoryId: string | null;
}

function emptyDraft(): Draft {
  return { name: "", date: todayIso(), remarks: "", categoryId: null };
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/**
 * Create or correct one of a client's records (client request): a name, a date,
 * remarks, an optional category and an **optional file** — which can be dragged
 * in as well as chosen. On an edit the stored file is kept, removed or replaced
 * explicitly so a save can never silently lose it.
 */
export function ClientRecordDialog({
  client,
  record,
  categories,
  open,
  onOpenChange,
  onSaved,
}: ClientRecordDialogProps) {
  const { clientRecords } = useRepositories();
  // A record's file can be large, so a save is held as an uninterruptible write:
  // the rest of the interface is locked and the dialog cannot be dismissed.
  const lock = useCreationLock();
  const [draft, setDraft] = useState<Draft>(() => emptyDraft());
  const [pending, setPending] = useState<AttachmentPayload | null>(null);
  const [removed, setRemoved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Read by the close guards, which fire before React has re-rendered `saving`.
  const savingRef = useRef(false);

  const editing = record !== null;

  useEffect(() => {
    if (!open) {
      return;
    }
    if (record) {
      setDraft({
        name: record.name,
        date: record.date,
        remarks: record.remarks ?? "",
        categoryId: record.categoryId,
      });
    } else {
      setDraft(emptyDraft());
    }
    setPending(null);
    setRemoved(false);
    setError(null);
    setSaving(false);
    savingRef.current = false;
  }, [open, record]);

  const storedStillAttached = editing && !pending && !removed && Boolean(record?.fileName);
  const shownFileName = pending?.fileName ?? (removed ? null : (record?.fileName ?? null));
  const ready = draft.name.trim() !== "";

  async function openStored() {
    if (!record) {
      return;
    }
    try {
      await clientRecords.openFile(record.id);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "That file could not be opened.");
    }
  }

  async function saveCopyOfStored() {
    if (!record) {
      return;
    }
    try {
      await clientRecords.saveFileCopy(record.id);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The copy could not be saved.");
    }
  }

  async function save() {
    if (!ready || savingRef.current) {
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError(null);
    const lockToken = lock.begin("Saving this record…");
    try {
      const values = {
        cnic: client.cnic,
        name: draft.name.trim(),
        date: draft.date,
        remarks: draft.remarks.trim() || null,
        categoryId: draft.categoryId,
      };

      if (record) {
        await clientRecords.update({
          id: record.id,
          name: values.name,
          date: values.date,
          remarks: values.remarks,
          categoryId: values.categoryId,
          attachment: pending
            ? { action: "replace", fileName: pending.fileName, bytes: pending.bytes }
            : removed
              ? { action: "remove" }
              : { action: "keep" },
        });
      } else {
        await clientRecords.create(values, pending);
      }

      onSaved();
      // The write succeeded: allow this close even though the lock is still held
      // until the `finally` below releases it.
      savingRef.current = false;
      onOpenChange(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The record could not be saved.");
    } finally {
      savingRef.current = false;
      lock.end(lockToken);
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Unclosable for as long as the record is being written.
        if (savingRef.current) {
          return;
        }
        onOpenChange(next);
      }}
    >
      <DialogContent
        className="sm:max-w-2xl"
        showCloseButton={!saving}
        onEscapeKeyDown={(event) => {
          if (savingRef.current) {
            event.preventDefault();
          }
        }}
        onInteractOutside={(event) => {
          if (savingRef.current) {
            event.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{editing ? "Edit record" : "New record"}</DialogTitle>
          <DialogDescription>{client.name} ({client.cnic})</DialogDescription>
        </DialogHeader>

        <div className="grid gap-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="record-name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="record-name"
                className={FIELD_INPUT_CLASS}
                value={draft.name}
                placeholder="What this record is"
                disabled={saving}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="record-date">Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    id="record-date"
                    type="button"
                    variant="outline"
                    disabled={saving}
                    className="h-11 w-full justify-start px-4 text-base font-normal"
                  >
                    <CalendarDays className="opacity-60" />
                    {draft.date || "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-auto p-0">
                  <Calendar
                    mode="single"
                    autoFocus
                    selected={draft.date ? parseIsoDate(draft.date) : undefined}
                    onSelect={(date) => {
                      if (date) {
                        setDraft({ ...draft, date: toIsoDate(date) });
                      }
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="record-category">Category</Label>
            <CategorySelect
              id="record-category"
              categories={categories}
              value={draft.categoryId}
              disabled={saving}
              onChange={(categoryId) => setDraft({ ...draft, categoryId })}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="record-remarks">Remarks</Label>
            <Textarea
              id="record-remarks"
              value={draft.remarks}
              placeholder="Optional"
              disabled={saving}
              onChange={(event) => setDraft({ ...draft, remarks: event.target.value })}
            />
          </div>

          <div className="grid gap-2">
            <span className="text-sm leading-none font-medium">File</span>
            <FileDropField
              fileName={shownFileName}
              disabled={saving}
              onFileNameChange={(name) => {
                if (!name) {
                  setPending(null);
                  setRemoved(true);
                }
              }}
              onFileSelected={(payload) => {
                setPending(payload);
                if (payload) {
                  setRemoved(false);
                }
              }}
              onOpen={storedStillAttached ? () => void openStored() : undefined}
              onSaveCopy={storedStillAttached ? () => void saveCopyOfStored() : undefined}
              hint="Any file type. Drag it onto the box or choose it."
            />
          </div>
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
            {saving ? "Saving…" : editing ? "Save record" : "Create record"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
