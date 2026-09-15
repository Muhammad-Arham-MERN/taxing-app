// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import { useMemo, useState } from "react";
import { flexRender } from "@tanstack/react-table";
import {
  getCoreRowModel,
  getPaginationRowModel,
  useLegacyTable,
  type LegacyColumnDef,
} from "@tanstack/react-table/legacy";
import { Download, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useRepositories } from "@/components/providers/DataProvider";
import { EditStatementDialog } from "@/components/statements/EditStatementDialog";
import type { Statement } from "@/domain/types";
import { formatAmount, formatDate, formatOptional } from "@/lib/format";

export const STATEMENTS_PAGE_SIZE = 25;

export interface StatementsTableProps {
  statements: Statement[];
  /** Called after a stored statement changes, so the list and totals re-read. */
  onChanged: () => void;
}

export function StatementsTable({ statements, onChanged }: StatementsTableProps) {
  const { statements: repository } = useRepositories();
  const [editing, setEditing] = useState<Statement | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  // وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
  /**
   * The File column shows the file's **name** and nothing else is fetched for
   * the list. Its contents are only touched when one is opened or saved, which
   * is why a range review stays fast however large the attachments are
   * (FR-029, FR-036).
   */
  async function openFile(statement: Statement) {
    setFileError(null);
    try {
      await repository.openAttachment(statement.id);
    } catch (error) {
      // Saving a copy stays available even when opening fails (FR-075).
      setFileError(error instanceof Error ? error.message : "That file could not be opened.");
    }
  }

  async function saveCopy(statement: Statement) {
    setFileError(null);
    try {
      await repository.saveAttachmentCopy(statement.id);
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "The copy could not be saved.");
    }
  }

  const columns = useMemo<LegacyColumnDef<Statement>[]>(
    () => [
      {
        accessorKey: "date",
        header: "Date",
        cell: ({ row }) => formatDate(row.original.date),
      },
      {
        accessorKey: "type",
        header: "Type",
        cell: ({ row }) => (row.original.type === "inflow" ? "In-Flow" : "Out-Flow"),
      },
      { accessorKey: "nature", header: "Nature" },
      {
        accessorKey: "remarks",
        header: "Remarks",
        cell: ({ row }) => formatOptional(row.original.remarks),
      },
      {
        accessorKey: "amount",
        header: "Amount",
        cell: ({ row }) => formatAmount(row.original.amount),
      },
      {
        accessorKey: "fileName",
        header: "File",
        cell: ({ row }) => {
          const { fileName } = row.original;
          if (!fileName) {
            return formatOptional(null);
          }
          return (
            <span className="flex items-center gap-2">
              <button
                type="button"
                title="Open in your own application"
                className="max-w-40 truncate underline-offset-4 hover:underline"
                onClick={() => void openFile(row.original)}
              >
                {fileName}
              </button>
              <button
                type="button"
                aria-label="Save a copy"
                title="Save a copy"
                className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
                onClick={() => void saveCopy(row.original)}
              >
                <Download className="size-3.5" />
              </button>
            </span>
          );
        },
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setEditing(row.original)}
          >
            <Pencil className="size-3.5" />
            Edit
          </Button>
        ),
      },
    ],
    // The handlers close over the repository, which is stable for the session.
    [repository],
  );

  const table = useLegacyTable({
    data: statements,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageIndex: 0, pageSize: STATEMENTS_PAGE_SIZE } },
  });

  const rows = table.getRowModel().rows;
  const pageCount = Math.max(table.getPageCount(), 1);
  const { pageIndex } = table.getState().pagination;

  return (
    <div className="flex flex-col gap-3">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="h-24 text-center text-muted-foreground"
              >
                No statements in this range.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {fileError ? (
        <p role="alert" className="text-sm text-destructive">
          {fileError}
        </p>
      ) : null}

      {pageCount > 1 ? (
        <div className="flex items-center justify-end gap-3">
          <span className="text-sm text-muted-foreground">
            Page {pageIndex + 1} of {pageCount}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="default"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="default"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}

      <EditStatementDialog
        statement={editing}
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null);
          }
        }}
        onSaved={onChanged}
      />
    </div>
  );
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
