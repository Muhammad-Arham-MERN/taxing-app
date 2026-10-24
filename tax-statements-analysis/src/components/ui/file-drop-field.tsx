// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import { useRef, useState } from "react";
import { cn } from "cn";
import { Download, ExternalLink, Upload, X } from "lucide-react";
import type { AttachmentPayload } from "@/domain/types";

export interface FileDropFieldProps {
  /** The shown file's name (a chosen one, or one already stored). */
  fileName: string | null;
  onFileNameChange: (fileName: string | null) => void;
  /** The chosen file's bytes, so they can be stored with the record. */
  onFileSelected?: (payload: AttachmentPayload | null) => void;
  /** Present when the shown file is already stored: open it in the system's app. */
  onOpen?: () => void;
  /** Present when the shown file is already stored: save a copy elsewhere. */
  onSaveCopy?: () => void;
  disabled?: boolean;
  /** The prompt inside the drop zone. */
  label?: string;
  hint?: string;
}

/**
 * A file field that accepts both a file-picker choice and a **drag-and-drop**
 * (client request). The drop handlers are plain DOM events, which is why the
 * window runs with `dragDropEnabled: false` — otherwise the webview swallows an
 * OS drop before the page ever sees it.
 */
export function FileDropField({
  fileName,
  onFileNameChange,
  onFileSelected,
  onOpen,
  onSaveCopy,
  disabled = false,
  label = "Choose a file, or drag it here",
  hint,
}: FileDropFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

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
      contentType: file.type || undefined,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
  }

  return (
    <div className="grid gap-2">
      <label
        data-slot="file-drop-field"
        data-dragging={dragging || undefined}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) {
            setDragging(true);
          }
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setDragging(false);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (disabled) {
            return;
          }
          const file = event.dataTransfer.files?.[0];
          if (file) {
            void handlePicked(file);
          }
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-surface/60 p-5 text-sm transition-colors hover:bg-muted/40 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50",
          dragging && "border-brand bg-brand/5",
        )}
      >
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
        <Upload aria-hidden="true" className="size-5 text-brand" />
        <span className="font-medium">
          {dragging ? "Drop the file here" : fileName ? "Choose a replacement, or drag one here" : label}
        </span>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </label>

      {fileName ? (
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="max-w-60 truncate">{fileName}</span>

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
            className="rounded-full p-0.5 hover:text-destructive"
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
