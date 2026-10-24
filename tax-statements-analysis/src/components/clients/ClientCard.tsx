// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import { useState, type ReactNode } from "react";
import { Eye, EyeOff, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Client } from "@/domain/types";

function joined(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "None";
}

interface DetailProps {
  label: string;
  children: ReactNode;
}

function Detail({ label, children }: DetailProps) {
  return (
    <div className="min-w-0">
      <dt className="text-xs tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="truncate">{children}</dd>
    </div>
  );
}

export interface ClientCardProps {
  client: Client;
  /** The block as a whole is the click target that opens the client's records. */
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/**
 * One client as an auto-height block that fills its grid column (client
 * request). Two blocks sit per row and together span the whole container. The
 * name sits at the top; the rest is laid out three details per row. The password
 * stays hidden until the eye is pressed. The whole block opens the client's
 * records on a click, while Edit and Delete are their own controls.
 */
export function ClientCard({ client, onOpen, onEdit, onDelete }: ClientCardProps) {
  const [revealed, setRevealed] = useState(false);
  const hasPassword = Boolean(client.password && client.password.trim());

  return (
    <article
      data-slot="client-card"
      role="button"
      tabIndex={0}
      aria-label={`Open ${client.name}'s records`}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className="client-card flex w-full cursor-pointer flex-col rounded-3xl border border-border bg-card p-4 text-left"
    >
      <header className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 flex-1 truncate font-heading text-base font-semibold">
          {client.name}
        </h3>
        <div
          className="flex shrink-0 gap-1"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Edit ${client.name}`}
            onClick={onEdit}
          >
            <Pencil aria-hidden="true" className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete ${client.name}`}
            onClick={onDelete}
          >
            <Trash2 aria-hidden="true" className="size-3.5 text-destructive" />
          </Button>
        </div>
      </header>

      <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-3 text-sm">
        <Detail label="CNIC">{client.cnic}</Detail>
        <Detail label="Company">{client.company ?? "None"}</Detail>
        <Detail label="Phone">{joined(client.phones)}</Detail>
        <Detail label="WhatsApp">{joined(client.whatsapps)}</Detail>
        <Detail label="Email">{joined(client.emails)}</Detail>

        <Detail label="Password">
          {hasPassword ? (
            <span className="flex items-center gap-1.5">
              <span className="min-w-0 truncate">
                {revealed ? client.password : "••••••••"}
              </span>
              <button
                type="button"
                aria-label={revealed ? "Hide password" : "Show password"}
                title={revealed ? "Hide password" : "Show password"}
                className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:text-foreground"
                onClick={(event) => {
                  event.stopPropagation();
                  setRevealed((value) => !value);
                }}
              >
                {revealed ? (
                  <EyeOff aria-hidden="true" className="size-3.5" />
                ) : (
                  <Eye aria-hidden="true" className="size-3.5" />
                )}
              </button>
            </span>
          ) : (
            "None"
          )}
        </Detail>
      </dl>
    </article>
  );
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
