// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import { useRef } from "react";
import { ExternalLink, Download, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AttachmentPayload } from "@/domain/types";

export interface FileAttachmentFieldProps {
  fileName: string | null;
  onFileNameChange: (fileName: string | null) => void;
  /**
   * The chosen file's bytes, so they can be stored with the statement (FR-003).
   * Without this the file's *name* would be recorded and its contents lost.
   */
  onFileSelected?: (payload: AttachmentPayload | null) => void;
  /** Present when the shown file is already stored: open it in the system's app (FR-065). */
  onOpen?: () => void;
  /** Present when the shown file is already stored: save a copy elsewhere (FR-072). */
  onSaveCopy?: () => void;
  disabled?: boolean;
}

export function FileAttachmentField({
  fileName,
  onFileNameChange,
  onFileSelected,
  onOpen,
  onSaveCopy,
  disabled = false,
}: FileAttachmentFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function clearSelection() {
    onFileNameChange(null);
    onFileSelected?.(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  async function handlePicked(file: File | null) {
    if (!file) {
      clearSelection();
      return;
    }
    onFileNameChange(file.name);
    onFileSelected?.({
      fileName: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
  }

  return (
    <div className="flex min-h-11 flex-wrap items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        aria-label="Attach file"
        className="sr-only"
        disabled={disabled}
        onChange={(event) => {
          void handlePicked(event.target.files?.[0] ?? null);
        }}
      />
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        className="h-11 px-4 text-base"
        onClick={() => inputRef.current?.click()}
      >
        <Paperclip className="opacity-60" />
        {fileName ? "Replace file" : "Attach file"}
      </Button>

      {fileName ? (
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="max-w-40 truncate">{fileName}</span>

          {onOpen ? (
            <button
              type="button"
              aria-label="Open attached file"
              title="Open in your own application"
              disabled={disabled}
              className="rounded-full p-0.5 hover:text-foreground"
              onClick={onOpen}
            >
              <ExternalLink className="size-3.5" />
            </button>
          ) : null}

          {onSaveCopy ? (
            <button
              type="button"
              aria-label="Save a copy of the attached file"
              title="Save a copy"
              disabled={disabled}
              className="rounded-full p-0.5 hover:text-foreground"
              onClick={onSaveCopy}
            >
              <Download className="size-3.5" />
            </button>
          ) : null}

          <button
            type="button"
            aria-label="Remove attached file"
            disabled={disabled}
            className="rounded-full p-0.5 hover:text-foreground"
            onClick={clearSelection}
          >
            <X className="size-3.5" />
          </button>
        </span>
      ) : (
        <span className="text-sm text-muted-foreground">None</span>
      )}
    </div>
  );
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
