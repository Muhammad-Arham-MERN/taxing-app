// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import { useMemo, useRef, useState } from "react";
import { LuChevronsUpDown, LuTrash2 } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import type { Client, Customer } from "@/domain/types";

export interface ClientComboboxProps {
  clients: Client[];
  /**
   * Customers remembered from past bills, so a customer who is not a client can
   * still be picked by name (client request).
   */
  customers: Customer[];
  /**
   * The customer name as **typed**. It is free text: the practitioner may bill
   * someone who is not in any list at all (client request).
   */
  value: string;
  onValueChange: (value: string) => void;
  /** A client picked from the book — fills the customer's own details. */
  onSelectClient: (client: Client) => void;
  /** A remembered customer picked — fills the details saved with their past bill. */
  onSelectCustomer: (customer: Customer) => void;
  /** Asked to remove a client from the book (the caller confirms and calls the repository). */
  onRemove: (client: Client) => void;
  disabled?: boolean;
  placeholder?: string;
}

type Entry =
  | { kind: "client"; key: string; name: string; subtitle: string; client: Client }
  | { kind: "customer"; key: string; name: string; subtitle: string; customer: Customer };

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/**
 * A typeable customer-name field (client request). Any name can be typed in —
 * the bill is raised for a customer who need not exist as a client. Opening the
 * field offers both the client book and the customers remembered from past
 * bills, so an existing one can be picked in one go, which fills their details;
 * a client can also be removed from the book straight from here.
 */
export function ClientCombobox({
  clients,
  customers,
  value,
  onValueChange,
  onSelectClient,
  onSelectCustomer,
  onRemove,
  disabled = false,
  placeholder = "Type any name, or pick a client",
}: ClientComboboxProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  const entries = useMemo<Entry[]>(() => {
    const clientNames = new Set(clients.map((client) => client.name.toLowerCase()));
    const clientEntries: Entry[] = clients.map((client) => ({
      kind: "client",
      key: `client:${client.cnic}`,
      name: client.name,
      subtitle: client.cnic + (client.phones[0] ? ` · ${client.phones[0]}` : ""),
      client,
    }));
    const customerEntries: Entry[] = customers
      .filter((customer) => !clientNames.has(customer.name.toLowerCase()))
      .map((customer) => ({
        kind: "customer",
        key: `customer:${customer.name.toLowerCase()}`,
        name: customer.name,
        subtitle: customer.contactNumber ?? customer.email ?? "Billed before",
        customer,
      }));
    const all = [...clientEntries, ...customerEntries];
    const needle = value.trim().toLowerCase();
    if (!needle) {
      return all;
    }
    return all.filter(
      (entry) =>
        entry.name.toLowerCase().includes(needle) ||
        entry.subtitle.toLowerCase().includes(needle),
    );
  }, [clients, customers, value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* An anchor, not a trigger: the field must stay typeable, so clicking it
          must never toggle the list shut. */}
      <PopoverAnchor asChild>
        <div ref={anchorRef} className="relative flex items-center">
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
        // The list must stay open while the practitioner types or clicks inside
        // the field: focus never enters the content, so a focus change must not
        // dismiss it, and a press on the field itself must not either.
        onFocusOutside={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => {
          const target = event.target as Node | null;
          if (target && anchorRef.current?.contains(target)) {
            event.preventDefault();
          }
        }}
      >
        <div className="max-h-64 overflow-y-auto">
          {entries.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">
              {clients.length === 0 && customers.length === 0
                ? "No clients yet — you can still bill this customer by name."
                : "No match. Keep the name as it is to bill a customer who is not a client."}
            </p>
          ) : (
            entries.map((entry) => (
              <div
                key={entry.key}
                className="flex items-center gap-1 rounded-md px-1 hover:bg-accent"
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 flex-col items-start px-1.5 py-1.5 text-left"
                  onClick={() => {
                    if (entry.kind === "client") {
                      onSelectClient(entry.client);
                    } else {
                      onSelectCustomer(entry.customer);
                    }
                    setOpen(false);
                  }}
                >
                  <span className="w-full truncate text-sm font-medium">{entry.name}</span>
                  <span className="w-full truncate text-xs text-muted-foreground">
                    {entry.kind === "client" ? "Client" : "Customer"} · {entry.subtitle}
                  </span>
                </button>
                {entry.kind === "client" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Remove ${entry.client.name} from the client book`}
                    title="Remove this client from the book"
                    onClick={() => onRemove(entry.client)}
                  >
                    <LuTrash2 aria-hidden="true" className="text-destructive" />
                  </Button>
                ) : null}
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
