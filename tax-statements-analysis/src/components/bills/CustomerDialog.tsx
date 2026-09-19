// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
/**
 * The customer popup (client change, 2026-09-19).
 *
 * Clicking a customer's name in View Bills opens this so their own details —
 * address, contact person, contact number, email, NTN and password — can be
 * viewed and edited in one place. Saving updates the **customer** record; the
 * bills raised for them are untouched.
 */
import { useEffect, useState } from "react";
import { useRepositories } from "@/components/providers/DataProvider";
import { Button } from "@/components/ui/button";
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
import type { Customer } from "@/domain/types";

interface CustomerFields {
  address: string;
  contactPerson: string;
  contactNumber: string;
  email: string;
  ntn: string;
  password: string;
}

const EMPTY: CustomerFields = {
  address: "",
  contactPerson: "",
  contactNumber: "",
  email: "",
  ntn: "",
  password: "",
};

function fieldsFrom(customer: Customer): CustomerFields {
  return {
    address: customer.address ?? "",
    contactPerson: customer.contactPerson ?? "",
    contactNumber: customer.contactNumber ?? "",
    email: customer.email ?? "",
    ntn: customer.ntn ?? "",
    password: customer.password ?? "",
  };
}

const FIELDS: Array<{ key: keyof CustomerFields; id: string; label: string }> = [
  { key: "address", id: "customer-address", label: "Customer Address" },
  { key: "contactPerson", id: "customer-contact-person", label: "Contact Person" },
  { key: "contactNumber", id: "customer-contact-number", label: "Contact Number" },
  { key: "email", id: "customer-email", label: "Email" },
  { key: "ntn", id: "customer-ntn", label: "NTN Number" },
  { key: "password", id: "customer-password", label: "Password" },
];

export interface CustomerDialogProps {
  customer: Customer | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function CustomerDialog({
  customer,
  open,
  onOpenChange,
  onSaved,
}: CustomerDialogProps) {
  const { customers: repository } = useRepositories();
  const [fields, setFields] = useState<CustomerFields>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && customer) {
      setFields(fieldsFrom(customer));
      setError(null);
    }
  }, [open, customer]);

  // وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
  async function save() {
    if (!customer) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await repository.update({
        ...customer,
        address: fields.address.trim() || null,
        contactPerson: fields.contactPerson.trim() || null,
        contactNumber: fields.contactNumber.trim() || null,
        email: fields.email.trim() || null,
        ntn: fields.ntn.trim() || null,
        password: fields.password.trim() || null,
      });
      onSaved();
      onOpenChange(false);
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Unable to save the customer.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Customer details</DialogTitle>
          <DialogDescription>
            {customer ? customer.name : ""} — these details are remembered for this
            customer and used on their future bills.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 lg:grid-cols-2">
          {FIELDS.map((field) => (
            <div className="grid gap-2" key={field.key}>
              <Label htmlFor={field.id}>{field.label}</Label>
              <Input
                id={field.id}
                className="h-11 text-base md:text-base"
                value={fields[field.key]}
                disabled={saving}
                onChange={(event) =>
                  setFields((current) => ({ ...current, [field.key]: event.target.value }))
                }
              />
            </div>
          ))}
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
          <Button type="button" disabled={saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save customer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
