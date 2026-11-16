// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
/**
 * The View Bills Customer filter (FR-065).
 *
 * It reuses the **same component** as the Create Bill form's Customer Name field
 * (client request): a typeable picker over the client book and the customers
 * remembered from past bills. Picking an entry sets the filter to that name;
 * clearing it removes the filter. Removing a client from the book is not offered
 * here — that is a Create Bill concern.
 */
import { X } from "lucide-react";
import { ClientCombobox } from "@/components/clients/ClientCombobox";
import { Button } from "@/components/ui/button";
import type { Client, Customer } from "@/domain/types";

export interface CustomerFilterProps {
  clients: Client[];
  customers: Customer[];
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}

export function CustomerFilter({
  clients,
  customers,
  value,
  onChange,
  disabled = false,
}: CustomerFilterProps) {
  return (
    <div className="grid gap-2">
      <span className="text-sm leading-none font-medium">Customer</span>
      <div className="flex gap-2">
        <div className="flex-1">
          <ClientCombobox
            clients={clients}
            customers={customers}
            value={value ?? ""}
            onValueChange={(next) => onChange(next.trim().length > 0 ? next : null)}
            disabled={disabled}
            placeholder="All customers"
            ariaLabel="Customer filter"
          />
        </div>
        {value ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Clear customer"
            disabled={disabled}
            onClick={() => onChange(null)}
          >
            <X aria-hidden="true" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
