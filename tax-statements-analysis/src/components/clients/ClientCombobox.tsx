// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import { useMemo, useState } from "react";
import { LuChevronsUpDown, LuTrash2 } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import type { Client } from "@/domain/types";

export interface ClientComboboxProps {
  clients: Client[];
  /**
   * The customer name as **typed**. It is free text: the practitioner may bill
   * someone who is not in the client book at all (client request).
   */
  value: string;
  onValueChange: (value: string) => void;
  /** A client picked from the book — fills the customer's own details. */
  onSelect: (client: Client) => void;
  /** Asked to remove a client from the book (the caller confirms and calls the repository). */
  onRemove: (client: Client) => void;
  disabled?: boolean;
  placeholder?: string;
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/**
 * A typeable customer-name field (client request). Any name can be typed in —
 * the bill is raised for a customer who need not exist as a client, and is
 * remembered only in the bills' own customer list. Opening the field also offers
 * the client book so an existing client can be picked in one go, which fills
 * their details; a client can also be removed from the book straight from here.
 */
export function ClientCombobox({
  clients,
  value,
  onValueChange,
  onSelect,
  onRemove,
  disabled = false,
  placeholder = "Type any name, or pick a client",
}: ClientComboboxProps) {
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const needle = value.trim().toLowerCase();
    if (!needle) {
      return clients;
    }
    return clients.filter(
      (client) =>
        client.name.toLowerCase().includes(needle) ||
        client.cnic.toLowerCase().includes(needle),
    );
  }, [clients, value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* An anchor, not a trigger: the field must stay typeable, so clicking it
          must never toggle the list shut. */}
      <PopoverAnchor asChild>
        <div className="relative flex items-center">
          <Input
            value={value}
            aria-label="Customer Name"
            placeholder={placeholder}
            disabled={disabled}
            className="h-11 pr-9 text-base md:text-base"
            onChange={(event) => {
              onValueChange(event.target.value);
              if (!open) {
                setOpen(true);
              }
            }}
            onFocus={() => {
              if (!disabled) {
                setOpen(true);
              }
            }}
          />
          <LuChevronsUpDown
            aria-hidden="true"
            className="pointer-events-none absolute right-3 size-4 opacity-60"
          />
        </div>
      </PopoverAnchor>

      <PopoverContent
        align="start"
        className="w-80 p-1"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="max-h-64 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">
              {clients.length === 0
                ? "No clients yet — you can still bill this customer by name."
                : "No client matches. Keep the name as it is to bill a customer who is not a client."}
            </p>
          ) : (
            filtered.map((client) => (
              <div
                key={client.cnic}
                className="flex items-center gap-1 rounded-md px-1 hover:bg-accent"
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 flex-col items-start px-1.5 py-1.5 text-left"
                  onClick={() => {
                    onSelect(client);
                    setOpen(false);
                  }}
                >
                  <span className="w-full truncate text-sm font-medium">{client.name}</span>
                  <span className="w-full truncate text-xs text-muted-foreground">
                    {client.cnic}
                    {client.phones[0] ? ` · ${client.phones[0]}` : ""}
                  </span>
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Remove ${client.name} from the client book`}
                  title="Remove this client from the book"
                  onClick={() => onRemove(client)}
                >
                  <LuTrash2 aria-hidden="true" className="text-destructive" />
                </Button>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
