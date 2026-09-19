// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
/**
 * The View Bills list (FR-039–FR-044, FR-064).
 *
 * Columns are Customer Name, Date, Details and Amount, as the client asked, with
 * the per-row actions to open or download the invoice, correct the bill, or
 * delete it. Rows already carry their aggregates, so the list never loads the
 * line items themselves.
 */
import { useState } from "react";
import { Download, ExternalLink, Pencil, Trash2 } from "lucide-react";
import { CustomerDialog } from "@/components/bills/CustomerDialog";
import { EditBillDialog } from "@/components/bills/EditBillDialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { formatDate, formatPkr } from "@/lib/format";

export const BILLS_PAGE_SIZE = 25;

export interface BillsTableProps {
  bills: BillSummary[];
  /** The remembered customers, so clicking a name can open their details. */
  customers: Customer[];
  onChanged: () => void;
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
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((bill) => (
            <TableRow key={bill.id}>
              <TableCell>
                {/* Clicking the name opens the customer's own details. */}
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 text-left"
                  aria-label={`Customer ${bill.customerName}`}
                  onClick={() => setEditingCustomer(bill.customerName)}
                >
                  {bill.customerName}
                </Button>
              </TableCell>
              <TableCell>{formatDate(bill.date)}</TableCell>
              <TableCell>{bill.details}</TableCell>
              <TableCell className="text-right">{formatPkr(bill.total)}</TableCell>
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
