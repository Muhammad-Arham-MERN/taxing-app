// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Download, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CategoryChip } from "@/components/clients/CategoryChip";
import { CategoryFilter } from "@/components/clients/CategoryFilter";
import { ClientRecordDialog } from "@/components/clients/ClientRecordDialog";
import { useRepositories } from "@/components/providers/DataProvider";
import type { Category, Client, ClientRecord } from "@/domain/types";
import { formatDate, formatOptional, parseIsoDate, toIsoDate } from "@/lib/format";

interface OptionalDateFieldProps {
  id: string;
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}

function OptionalDateField({ id, label, value, onChange, disabled }: OptionalDateFieldProps) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              id={id}
              type="button"
              variant="outline"
              disabled={disabled}
              className="h-11 w-44 justify-start px-4 text-base font-normal"
            >
              <CalendarDays className="opacity-60" />
              {value ?? "Any date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <Calendar
              mode="single"
              autoFocus
              selected={value ? parseIsoDate(value) : undefined}
              onSelect={(date) => {
                if (date) {
                  onChange(toIsoDate(date));
                }
              }}
            />
          </PopoverContent>
        </Popover>
        {value ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Clear ${label}`}
            disabled={disabled}
            onClick={() => onChange(null)}
          >
            <Trash2 aria-hidden="true" className="size-3.5" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export interface ClientRecordsViewProps {
  client: Client;
  refreshKey: number;
  onBack: () => void;
  /** A write happened, so other installed views should re-read. */
  onChanged: () => void;
}

/**
 * The table that opens when a client block is clicked (client request): that
 * client's own records, each with a name, date, remarks, category and optional
 * file. Searchable by name, remarks and file name; filterable by any number of
 * categories and by a date range; every row is editable and deletable.
 */
export function ClientRecordsView({
  client,
  refreshKey,
  onBack,
  onChanged,
}: ClientRecordsViewProps) {
  const { clientRecords, categories: categoryRepository } = useRepositories();
  const [rows, setRows] = useState<ClientRecord[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesKey, setCategoriesKey] = useState(0);
  const [query, setQuery] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ClientRecord | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ClientRecord | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    clientRecords
      .list(client.cnic)
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
  }, [clientRecords, client.cnic, refreshKey]);

  useEffect(() => {
    let active = true;
    categoryRepository
      .list()
      .then((result) => {
        if (active) {
          setCategories(result);
        }
      })
      .catch(() => {
        if (active) {
          setCategories([]);
        }
      });
    return () => {
      active = false;
    };
  }, [categoryRepository, categoriesKey]);

  const categoryById = useMemo(() => {
    const map = new Map<string, Category>();
    for (const category of categories) {
      map.set(category.id, category);
    }
    return map;
  }, [categories]);

  const rangeInvalid = from !== null && to !== null && from > to;

  const filtered = useMemo(() => {
    if (rangeInvalid) {
      return [];
    }
    const needle = query.trim().toLowerCase();
    return rows.filter((record) => {
      if (from !== null && record.date < from) {
        return false;
      }
      if (to !== null && record.date > to) {
        return false;
      }
      if (
        selectedCategories.length > 0 &&
        (record.categoryId === null || !selectedCategories.includes(record.categoryId))
      ) {
        return false;
      }
      if (!needle) {
        return true;
      }
      return (
        record.name.toLowerCase().includes(needle) ||
        (record.remarks ?? "").toLowerCase().includes(needle) ||
        (record.fileName ?? "").toLowerCase().includes(needle)
      );
    });
  }, [rows, query, selectedCategories, from, to, rangeInvalid]);

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(record: ClientRecord) {
    setEditing(record);
    setDialogOpen(true);
  }

  async function confirmDelete() {
    if (!pendingDelete) {
      return;
    }
    setBusy(true);
    try {
      await clientRecords.remove(pendingDelete.id);
      setPendingDelete(null);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  // ---- category management (shared list) ----------------------------------

  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [pendingCategoryDelete, setPendingCategoryDelete] = useState<Category | null>(null);

  async function runCategory(action: () => Promise<unknown>) {
    setCategoryError(null);
    setBusy(true);
    try {
      await action();
      setCategoriesKey((key) => key + 1);
    } catch (failure) {
      setCategoryError(
        failure instanceof Error ? failure.message : "That category could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      data-slot="client-records-panel"
      className="rounded-4xl border border-border bg-card/60 p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" size="sm" onClick={onBack}>
            ← Back
          </Button>
          <h2 className="font-heading text-lg font-semibold">{client.name}</h2>
        </div>
        <Button type="button" onClick={openCreate}>
          <Plus aria-hidden="true" />
          New record
        </Button>
      </div>

      <div className="mt-5 flex flex-col gap-5">
        <div className="rounded-2xl border border-border/60 bg-surface/60 p-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end">
            <div className="grid flex-1 gap-2">
              <Label htmlFor="records-search">Search</Label>
              <div className="flex items-center gap-2">
                <Search aria-hidden="true" className="size-4 opacity-60" />
                <Input
                  id="records-search"
                  value={query}
                  placeholder="Search by name, remarks or file name"
                  className="h-11 text-base md:text-base"
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <span className="text-sm leading-none font-medium">Category</span>
              <CategoryFilter
                categories={categories}
                selected={selectedCategories}
                busy={busy}
                onToggle={(id) =>
                  setSelectedCategories((current) =>
                    current.includes(id)
                      ? current.filter((entry) => entry !== id)
                      : [...current, id],
                  )
                }
                onCreate={(input) => void runCategory(() => categoryRepository.create(input))}
                onUpdate={(id, input) =>
                  void runCategory(() => categoryRepository.update(id, input))
                }
                onDelete={(category) => setPendingCategoryDelete(category)}
              />
            </div>

            <OptionalDateField id="records-from" label="From" value={from} onChange={setFrom} />
            <OptionalDateField id="records-to" label="To" value={to} onChange={setTo} />
          </div>

          {rangeInvalid ? (
            <p role="alert" className="mt-3 text-sm text-destructive">
              The From date must be on or before the To date.
            </p>
          ) : null}
          {categoryError ? (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {categoryError}
            </p>
          ) : null}
        </div>

        <div className="rounded-2xl border border-border/60 bg-surface/60 p-5">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {rows.length === 0 ? "No records yet." : "No records match that search."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Remarks</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="font-medium">{record.name}</TableCell>
                    <TableCell>{formatDate(record.date)}</TableCell>
                    <TableCell>{formatOptional(record.remarks)}</TableCell>
                    <TableCell>
                      <CategoryChip
                        category={record.categoryId ? categoryById.get(record.categoryId) : null}
                      />
                    </TableCell>
                    <TableCell>
                      {record.fileName ? (
                        <span className="flex items-center gap-2">
                          <button
                            type="button"
                            title="Open in your own application"
                            className="max-w-40 truncate underline-offset-4 hover:underline"
                            onClick={() => void clientRecords.openFile(record.id)}
                          >
                            {record.fileName}
                          </button>
                          <button
                            type="button"
                            aria-label="Save a copy"
                            title="Save a copy"
                            className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
                            onClick={() => void clientRecords.saveFileCopy(record.id)}
                          >
                            <Download className="size-3.5" />
                          </button>
                        </span>
                      ) : (
                        "None"
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openEdit(record)}
                        >
                          <Pencil className="size-3.5" />
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Delete record ${record.name}`}
                          onClick={() => setPendingDelete(record)}
                        >
                          <Trash2 aria-hidden="true" className="size-3.5 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      <ClientRecordDialog
        client={client}
        record={editing}
        categories={categories}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={onChanged}
      />

      {/* Every deletion is confirmed (client request). */}
      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this record?</DialogTitle>
            <DialogDescription>
              {pendingDelete ? `"${pendingDelete.name}"` : ""} and its file will be removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setPendingDelete(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => void confirmDelete()}
            >
              {busy ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pendingCategoryDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingCategoryDelete(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this category?</DialogTitle>
            <DialogDescription>
              {pendingCategoryDelete ? `"${pendingCategoryDelete.name}"` : ""} will be removed. Clients
              and records filed under it keep their data and simply lose the tag.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setPendingCategoryDelete(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => {
                const category = pendingCategoryDelete;
                setPendingCategoryDelete(null);
                if (category) {
                  void runCategory(() => categoryRepository.remove(category.id));
                }
              }}
            >
              {busy ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
