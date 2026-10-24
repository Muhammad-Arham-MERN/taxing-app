// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
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
import { ClientCard } from "@/components/clients/ClientCard";
import { ClientRecordsView } from "@/components/clients/ClientRecordsView";
import { EditClientDialog } from "@/components/clients/EditClientDialog";
import { useRepositories } from "@/components/providers/DataProvider";
import type { Client } from "@/domain/types";

export interface ViewClientsTabProps {
  refreshKey: number;
  onChanged: () => void;
}

/** True when any of the client's fields contains the search text. */
function matches(client: Client, needle: string): boolean {
  if (!needle) {
    return true;
  }
  const haystack = [
    client.name,
    client.cnic,
    client.company ?? "",
    ...client.phones,
    ...client.whatsapps,
    ...client.emails,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/**
 * Every client the practitioner has recorded, shown as a grid of blocks (client
 * request). The search covers every field, and clicking a block opens that
 * client's records.
 */
export function ViewClientsTab({ refreshKey, onChanged }: ViewClientsTabProps) {
  const { clients: repository } = useRepositories();
  const [rows, setRows] = useState<Client[]>([]);
  const [query, setQuery] = useState("");
  const [openClient, setOpenClient] = useState<Client | null>(null);
  const [editing, setEditing] = useState<Client | null>(null);
  const [removing, setRemoving] = useState<Client | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    repository
      .list()
      .then((result) => {
        if (active) {
          setRows(result);
        }
      })
      .catch(() => {
        if (active) {
          setRows([]);
        }
      });
    return () => {
      active = false;
    };
  }, [repository, refreshKey]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((client) => matches(client, needle));
  }, [rows, query]);

  async function confirmRemove() {
    if (!removing) {
      return;
    }
    setBusy(true);
    try {
      await repository.remove(removing.cnic);
      setRemoving(null);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  if (openClient) {
    return (
      <ClientRecordsView
        client={openClient}
        refreshKey={refreshKey}
        onBack={() => setOpenClient(null)}
        onChanged={onChanged}
      />
    );
  }

  return (
    <section
      data-slot="view-clients-panel"
      className="rounded-4xl border border-border bg-card/60 p-6"
    >
      <h2 className="font-heading text-lg font-semibold">View Clients</h2>

      <div className="mt-5 flex flex-col gap-5">
        <div className="rounded-2xl border border-border/60 bg-surface/60 p-5">
          <div className="flex items-center gap-2">
            <Search aria-hidden="true" className="size-4 opacity-60" />
            <Input
              value={query}
              placeholder="Search by name, CNIC, company, phone, email…"
              className="h-11 text-base md:text-base"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-surface/60 p-5">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {rows.length === 0 ? "No clients yet." : "No clients match that search."}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {filtered.map((client) => (
                <ClientCard
                  key={client.cnic}
                  client={client}
                  onOpen={() => setOpenClient(client)}
                  onEdit={() => setEditing(client)}
                  onDelete={() => setRemoving(client)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <EditClientDialog
        client={editing}
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null);
          }
        }}
        onSaved={onChanged}
      />

      {/* Every deletion is confirmed (client request). */}
      <Dialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRemoving(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this client?</DialogTitle>
            <DialogDescription>
              {removing ? `${removing.name} (${removing.cnic})` : ""} and every contact value and
              record held for them will be removed. The cloud copy follows on the next Push.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setRemoving(null)}
            >
              Keep
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => void confirmRemove()}
            >
              {busy ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
