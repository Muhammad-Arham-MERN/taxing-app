// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import { useRef, useState } from "react";
import { cn } from "cn";
import { LuKeyRound, LuUpload } from "react-icons/lu";
import { SyncProgress } from "@/components/cloud/SyncProgress";
import { useRepositories } from "@/components/providers/DataProvider";

export interface SecretsDialogProps {
  /** Called only after the cloud connection has been proven, so the caller can
   * re-read setup state and unlock the application (FR-005, FR-047). */
  onSaved: () => void;
  /** True when replacing values that are already stored (FR-049). */
  replacing?: boolean;
}

/** Which step of the exchange is running, so the loader can be exact. */
type Phase = "idle" | "reading" | "connecting";

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/**
 * The env-file onboarding screen (FR-044, FR-045, FR-048).
 *
 * The practitioner picks the file their partner gave them. The application reads
 * it, extracts the required values itself, stores them in Windows Credential
 * Manager, and then **proves the cloud is reachable** before unlocking the
 * application (FR-005). A failure names exactly what is wrong and saves nothing.
 */
export function SecretsDialog({ onSaved, replacing = false }: SecretsDialogProps) {
  const { setup } = useRepositories();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const busy = phase !== "idle";

  async function handleFile(file: File) {
    setError(null);

    let text: string;
    setPhase("reading");
    try {
      text = await file.text();
    } catch {
      setError("That file could not be read. Choose it again.");
      setPhase("idle");
      return;
    }

    try {
      const saved = await setup.saveSecrets(text);
      if (!saved.ok) {
        setError(saved.message);
        return;
      }

      // Saved. Now prove the cloud is reachable; only then is the app usable.
      setPhase("connecting");
      const connected = await setup.connect();
      if (!connected.ok) {
        setError(`${connected.message} Check the file and choose it again.`);
        return;
      }

      onSaved();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "The connection details could not be saved.",
      );
    } finally {
      setPhase("idle");
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  return (
    <section
      data-slot="secrets-dialog"
      className="rounded-4xl border border-border bg-card/60 p-8 text-center"
    >
      <LuKeyRound aria-hidden="true" className="mx-auto size-8 text-brand" />
      <h2 className="mt-4 font-heading text-lg font-semibold">
        {replacing ? "Replace the cloud connection details" : "Set up the cloud connection"}
      </h2>
      <p className="mx-auto mt-2 max-w-prose text-sm text-muted-foreground">
        Choose the env file your partner gave you. The values are saved only in Windows
        Credential Manager — never in a file this application owns, and never shown again.
      </p>

      <label
        data-slot="secrets-file-picker"
        data-dragging={dragging || undefined}
        onDragOver={(event) => {
          event.preventDefault();
          if (!busy) {
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
          if (busy) {
            return;
          }
          const file = event.dataTransfer.files?.[0];
          if (file) {
            void handleFile(file);
          }
        }}
        className={cn(
          "mx-auto mt-5 flex max-w-xl cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-surface/60 p-6 text-sm transition-colors hover:bg-muted/40 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50",
          dragging && "border-brand bg-brand/5",
        )}
      >
        <LuUpload aria-hidden="true" className="size-5 text-brand" />
        <span className="font-medium">
          {dragging ? "Drop the env file here" : "Choose the env file, or drag it here"}
        </span>
        <span className="text-xs text-muted-foreground">
          <code>TURSO_DATABASE_URL</code> and <code>TURSO_AUTH_TOKEN</code> are required.
          Adding <code>TURSO_ORG</code>, <code>TURSO_DATABASE</code> and{" "}
          <code>TURSO_PLATFORM_TOKEN</code> also enables the cloud storage gauge, and the{" "}
          <code>OCI_S3_*</code> values enable file storage.
        </span>
        <input
          ref={inputRef}
          type="file"
          accept=".env,.txt,text/plain"
          aria-label="Env file"
          className="sr-only"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void handleFile(file);
            }
          }}
        />
      </label>

      <div className="mt-5 flex min-h-6 items-center justify-center">
        {busy ? (
          <SyncProgress
            label={phase === "connecting" ? "Connecting to the cloud…" : "Reading the file…"}
          />
        ) : error ? (
          <p role="alert" className="max-w-prose text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
