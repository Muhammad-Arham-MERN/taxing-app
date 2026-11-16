// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import { LuMinus, LuPlus } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Client } from "@/domain/types";

const FIELD_INPUT_CLASS = "h-11 text-base md:text-base";

/** The editable shape of a client; blank optionals are empty strings. */
export interface ClientDraft {
  cnic: string;
  name: string;
  company: string;
  address: string;
  contactPerson: string;
  ntn: string;
  password: string;
  phones: string[];
  whatsapps: string[];
  emails: string[];
}

export function emptyClientDraft(): ClientDraft {
  return {
    cnic: "",
    name: "",
    company: "",
    address: "",
    contactPerson: "",
    ntn: "",
    password: "",
    phones: [""],
    whatsapps: [""],
    emails: [""],
  };
}

export function draftFromClient(client: Client): ClientDraft {
  return {
    cnic: client.cnic,
    name: client.name,
    company: client.company ?? "",
    address: client.address ?? "",
    contactPerson: client.contactPerson ?? "",
    ntn: client.ntn ?? "",
    password: client.password ?? "",
    phones: client.phones.length > 0 ? [...client.phones] : [""],
    whatsapps: client.whatsapps.length > 0 ? [...client.whatsapps] : [""],
    emails: client.emails.length > 0 ? [...client.emails] : [""],
  };
}

/** Turn a draft back into the seam's `Client` (blank optionals become null). */
export function draftToClient(draft: ClientDraft): Client {
  return {
    cnic: draft.cnic.trim(),
    name: draft.name.trim(),
    company: draft.company.trim() || null,
    address: draft.address.trim() || null,
    contactPerson: draft.contactPerson.trim() || null,
    ntn: draft.ntn.trim() || null,
    password: draft.password.trim() || null,
    phones: draft.phones,
    whatsapps: draft.whatsapps,
    emails: draft.emails,
  };
}

interface ContactRowsProps {
  label: string;
  placeholder: string;
  values: string[];
  disabled: boolean;
  onChange: (values: string[]) => void;
}

/** A repeatable list of contact values: a client may have several of each. */
function ContactRows({ label, placeholder, values, disabled, onChange }: ContactRowsProps) {
  return (
    <div className="grid gap-2">
      <span className="text-sm leading-none font-medium">{label}</span>
      {values.map((value, index) => (
        <div key={index} className="flex items-center gap-2">
          <Input
            value={value}
            placeholder={placeholder}
            disabled={disabled}
            className={FIELD_INPUT_CLASS}
            onChange={(event) =>
              onChange(values.map((current, i) => (i === index ? event.target.value : current)))
            }
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            aria-label={`Remove this ${label.toLowerCase()}`}
            disabled={disabled || values.length === 1}
            onClick={() => onChange(values.filter((_, i) => i !== index))}
          >
            <LuMinus aria-hidden="true" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        disabled={disabled}
        onClick={() => onChange([...values, ""])}
      >
        <LuPlus aria-hidden="true" />
        Add {label.toLowerCase()}
      </Button>
    </div>
  );
}

export interface ClientFieldsProps {
  draft: ClientDraft;
  onChange: (next: ClientDraft) => void;
  disabled?: boolean;
  /** On an edit the CNIC — the client's identity — cannot be changed. */
  cnicReadOnly?: boolean;
}

/**
 * The client's own fields, shared by the Create tab and the edit dialog so the
 * two can never drift. The CNIC and name are required; company, the customer
 * details, password, numbers, WhatsApps and emails are optional and repeatable
 * (client request).
 *
 * The form is split into **two sections** — *Client Details* (who they are in the
 * book) and *Customer Details* (the same fields a bill carries) — so the two
 * are visually separated (client request).
 */
export function ClientFields({
  draft,
  onChange,
  disabled = false,
  cnicReadOnly = false,
}: ClientFieldsProps) {
  function patch(values: Partial<ClientDraft>) {
    onChange({ ...draft, ...values });
  }

  return (
    <div className="grid gap-6">
      <section className="grid gap-4" data-slot="client-details-section">
        <span className="text-sm leading-none font-medium text-muted-foreground">
          Client Details
        </span>
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="grid gap-2">
            <span className="text-sm leading-none font-medium">
              CNIC / ID <span className="text-destructive">*</span>
            </span>
            <Input
              value={draft.cnic}
              placeholder="e.g. 42101-1234567-1"
              disabled={disabled || cnicReadOnly}
              className={FIELD_INPUT_CLASS}
              onChange={(event) => patch({ cnic: event.target.value })}
            />
          </div>

          <div className="grid gap-2">
            <span className="text-sm leading-none font-medium">
              Client Name <span className="text-destructive">*</span>
            </span>
            <Input
              value={draft.name}
              placeholder="Who this client is"
              disabled={disabled}
              className={FIELD_INPUT_CLASS}
              onChange={(event) => patch({ name: event.target.value })}
            />
          </div>

          <div className="grid gap-2">
            <span className="text-sm leading-none font-medium">Company</span>
            <Input
              value={draft.company}
              placeholder="Optional"
              disabled={disabled}
              className={FIELD_INPUT_CLASS}
              onChange={(event) => patch({ company: event.target.value })}
            />
          </div>

          <div className="grid gap-2">
            <span className="text-sm leading-none font-medium">Password</span>
            <Input
              value={draft.password}
              placeholder="Optional"
              disabled={disabled}
              className={FIELD_INPUT_CLASS}
              onChange={(event) => patch({ password: event.target.value })}
            />
          </div>

          <ContactRows
            label="Phone Numbers"
            placeholder="+92 300 1234567"
            values={draft.phones}
            disabled={disabled}
            onChange={(phones) => patch({ phones })}
          />
          <ContactRows
            label="WhatsApp Numbers"
            placeholder="+92 300 1234567"
            values={draft.whatsapps}
            disabled={disabled}
            onChange={(whatsapps) => patch({ whatsapps })}
          />
          <ContactRows
            label="Emails"
            placeholder="name@example.com"
            values={draft.emails}
            disabled={disabled}
            onChange={(emails) => patch({ emails })}
          />
        </div>
      </section>

      <section className="grid gap-4" data-slot="customer-details-section">
        <span className="text-sm leading-none font-medium text-muted-foreground">
          Customer Details
        </span>
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="grid gap-2">
            <span className="text-sm leading-none font-medium">Customer Address</span>
            <Input
              value={draft.address}
              placeholder="Optional"
              disabled={disabled}
              className={FIELD_INPUT_CLASS}
              onChange={(event) => patch({ address: event.target.value })}
            />
          </div>

          <div className="grid gap-2">
            <span className="text-sm leading-none font-medium">Contact Person</span>
            <Input
              value={draft.contactPerson}
              placeholder="Optional"
              disabled={disabled}
              className={FIELD_INPUT_CLASS}
              onChange={(event) => patch({ contactPerson: event.target.value })}
            />
          </div>

          <div className="grid gap-2">
            <span className="text-sm leading-none font-medium">NTN Number</span>
            <Input
              value={draft.ntn}
              placeholder="Optional"
              disabled={disabled}
              className={FIELD_INPUT_CLASS}
              onChange={(event) => patch({ ntn: event.target.value })}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
