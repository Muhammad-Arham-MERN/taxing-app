// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
/**
 * The View Bills list (FR-039–FR-044, FR-064).
 *
 * Columns are Customer Name, Date, Details and Amount, as the client asked, with
 * the per-row actions to open or download the invoice, correct the bill, or
 * delete it. Rows already carry their aggregates, so the list never loads the
 * line items themselves.
 */
import { useRef, useState } from "react";
import { Download, ExternalLink, Pencil, Trash2 } from "lucide-react";
import { CustomerDialog } from "@/components/bills/CustomerDialog";
import { EditBillDialog } from "@/components/bills/EditBillDialog";
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
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useRepositories } from "@/components/providers/DataProvider";
import type { BillSummary, Customer } from "@/domain/types";
import { billFileName, renderBillInvoice } from "@/lib/billInvoice";
import { formatDate, formatPkr, parseIsoDate, toIsoDate, todayIso } from "@/lib/format";
import { cn } from "@/lib/utils";

export const BILLS_PAGE_SIZE = 25;

export interface BillsTableProps {
  bills: BillSummary[];
  /** The remembered customers, so clicking a name can open their details. */
  customers: Customer[];
  onChanged: () => void;
}

/**
 * The View Bills **Status** cell (client request): a red **Unpaid** / green
 * **Paid · date** toggle. Clicking flips the status; hovering a paid bill opens a
 * calendar so the paid date can be chosen. It is the only place a bill's status
 * is set — never the create or edit forms.
 */
function BillStatusCell({
  bill,
  onSetPaid,
}: {
  bill: BillSummary;
  onSetPaid: (id: string, paidOn: string | null) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const paid = bill.paidOn !== null;

  /**
   * Open the calendar on hover, but keep it open while the pointer is over the
   * button **or the calendar itself**, and only close a moment after it leaves
   * both. Without this the calendar closes the instant the pointer leaves the
   * button, so a date can never actually be clicked.
   */
  function hoverOpen() {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setOpen(true);
  }

  function hoverClose() {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
    }
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null;
      setOpen(false);
    }, 150);
  }

  async function set(paidOn: string | null) {
    if (busy) {
      return;
    }
    setBusy(true);
    setOpen(false);
    try {
      await onSetPaid(bill.id, paidOn);
    } finally {
      setBusy(false);
    }
  }

  const button = (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={busy}
      aria-pressed={paid}
      aria-label={
        paid ? `Mark bill ${bill.invoiceNo} unpaid` : `Mark bill ${bill.invoiceNo} paid`
      }
      onClick={() => void set(paid ? null : todayIso())}
      className={cn(
        "gap-1.5 rounded-full border font-medium transition-all duration-300 active:scale-95",
        paid
          ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 dark:text-emerald-400"
          : "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 rounded-full transition-colors duration-300",
          paid ? "bg-emerald-500" : "bg-destructive",
        )}
      />
      {paid ? `Paid · ${formatDate(bill.paidOn ?? "")}` : "Unpaid"}
    </Button>
  );

  if (!paid) {
    return button;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        {/* Opening is governed by hover, not click, so a click can still toggle
            the status back to unpaid. */}
        <span className="inline-flex" onMouseEnter={hoverOpen} onMouseLeave={hoverClose}>
          {button}
        </span>
      </PopoverAnchor>
      <PopoverContent
        align="end"
        className="w-auto p-0"
        onMouseEnter={hoverOpen}
        onMouseLeave={hoverClose}
      >
        <Calendar
          mode="single"
          autoFocus
          selected={bill.paidOn ? parseIsoDate(bill.paidOn) : undefined}
          onSelect={(date) => {
            if (date) {
              void set(toIsoDate(date));
            }
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

export function BillsTable({ bills, customers, onChanged }: BillsTableProps) {
  const { bills: repository } = useRepositories();
  const [page, setPage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<BillSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  const selectedCustomer =
    customers.find(
      (customer) =>
        customer.name.toLowerCase() === (editingCustomer ?? "").toLowerCase(),
    ) ?? null;

  const pageCount = Math.max(1, Math.ceil(bills.length / BILLS_PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = bills.slice(
    safePage * BILLS_PAGE_SIZE,
    safePage * BILLS_PAGE_SIZE + BILLS_PAGE_SIZE,
  );

  // وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
  /** Render the invoice from the stored bill on demand, then hand it to the OS. */
  async function openInvoice(bill: BillSummary) {
    setError(null);
    try {
      const stored = await repository.get(bill.id);
      const bytes = await renderBillInvoice(stored);
      await repository.openInvoice(bytes, billFileName(stored.invoiceNo));
    } catch (openError) {
      setError(
        openError instanceof Error ? openError.message : "That invoice could not be opened.",
      );
    }
  }

  async function downloadInvoice(bill: BillSummary) {
    setError(null);
    try {
      const stored = await repository.get(bill.id);
      const bytes = await renderBillInvoice(stored);
      await repository.saveInvoiceCopy(bytes, billFileName(stored.invoiceNo));
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "That invoice could not be saved.",
      );
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await repository.remove(pendingDelete.id);
      setPendingDelete(null);
      onChanged();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : "That bill could not be deleted.",
      );
    } finally {
      setDeleting(false);
    }
  }

  /** Flip a bill's paid status from the Status column (client request). */
  async function setPaid(id: string, paidOn: string | null) {
    setError(null);
    try {
      await repository.setPaid(id, paidOn);
      onChanged();
    } catch (paidError) {
      setError(
        paidError instanceof Error
          ? paidError.message
          : "That bill's status could not be changed.",
      );
    }
  }

  if (bills.length === 0) {
    return (
      <p data-slot="bills-empty" className="text-sm text-muted-foreground">
        No bills for this selection.
      </p>
    );
  }

  return (
    <div className="grid gap-4" data-slot="bills-table">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Customer Name</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Details</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((bill) => (
            <TableRow key={bill.id}>
              <TableCell>
                {/* Clicking the name opens the customer's own details. The name
                    is truncated so a long one cannot widen the table. */}
                <Button
                  type="button"
                  variant="link"
                  className="h-auto max-w-[180px] p-0 text-left"
                  aria-label={`Customer ${bill.customerName}`}
                  title={bill.customerName}
                  onClick={() => setEditingCustomer(bill.customerName)}
                >
                  <span className="block truncate">{bill.customerName}</span>
                </Button>
              </TableCell>
              <TableCell>{formatDate(bill.date)}</TableCell>
              <TableCell>
                <span className="block max-w-[220px] truncate" title={bill.details}>
                  {bill.details}
                </span>
              </TableCell>
              <TableCell className="text-right">{formatPkr(bill.total)}</TableCell>
              <TableCell>
                <BillStatusCell bill={bill} onSetPaid={setPaid} />
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Open invoice ${bill.invoiceNo}`}
                    onClick={() => void openInvoice(bill)}
                  >
                    <ExternalLink aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Download invoice ${bill.invoiceNo}`}
                    onClick={() => void downloadInvoice(bill)}
                  >
                    <Download aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Edit bill ${bill.invoiceNo}`}
                    onClick={() => {
                      setEditingId(bill.id);
                      setEditOpen(true);
                    }}
                  >
                    <Pencil aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete bill ${bill.invoiceNo}`}
                    onClick={() => setPendingDelete(bill)}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {pageCount > 1 ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {safePage + 1} of {pageCount}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={safePage === 0}
              onClick={() => setPage((current) => Math.max(0, current - 1))}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <EditBillDialog
        billId={editingId}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={onChanged}
      />

      <CustomerDialog
        customer={selectedCustomer}
        open={editingCustomer !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditingCustomer(null);
          }
        }}
        onSaved={onChanged}
      />

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
            <DialogTitle>Delete this bill?</DialogTitle>
            <DialogDescription>
              {pendingDelete
                ? `Invoice ${pendingDelete.invoiceNo} for ${pendingDelete.customerName} will be removed, along with its items and its invoice. Its invoice number will not be reused.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={deleting}
              onClick={() => setPendingDelete(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting}
              onClick={() => void confirmDelete()}
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
