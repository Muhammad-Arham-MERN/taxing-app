// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { useRepositories } from "@/components/providers/DataProvider";
import {
  ClientFields,
  draftToClient,
  emptyClientDraft,
  type ClientDraft,
} from "@/components/clients/ClientFields";

export interface CreateClientFormProps {
  onCreated?: () => void;
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/**
 * Record a client (client request). The **CNIC and the name are required**;
 * company, password, phone numbers, WhatsApp numbers, emails and the category
 * are optional, and a client may carry several of each contact value.
 *
 * Saving a CNIC that is already held **merges** rather than replaces — the name
 * stays as first written and every new contact value joins the list.
 */
export function CreateClientForm({ onCreated }: CreateClientFormProps) {
  const { clients } = useRepositories();

  const [draft, setDraft] = useState<ClientDraft>(() => emptyClientDraft());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const ready = draft.cnic.trim() !== "" && draft.name.trim() !== "";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!ready || submitting) {
      return;
    }
    setSubmitting(true);
    setError(null);
    setSaved(null);
    try {
      const client = await clients.create(draftToClient(draft));
      setDraft(emptyClientDraft());
      setSaved(`${client.name} (${client.cnic}) saved.`);
      onCreated?.();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "The client could not be saved.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <section
        data-slot="create-client-panel"
        className="rounded-4xl border border-border bg-card/60 p-6"
      >
        <h2 className="font-heading text-lg font-semibold">Create Clients</h2>

        <div className="mt-5 rounded-2xl border border-border/60 bg-surface/60 p-5">
          <ClientFields draft={draft} onChange={setDraft} disabled={submitting} />
        </div>

        <div className="mt-6 flex flex-col items-center gap-3">
          <Button type="submit" size="lg" disabled={!ready || submitting}>
            {submitting ? "Saving…" : "Create"}
          </Button>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {saved ? (
            <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">
              {saved}
            </p>
          ) : null}
        </div>
      </section>
    </form>
  );
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
