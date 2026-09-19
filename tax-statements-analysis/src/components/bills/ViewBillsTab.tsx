// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
/**
 * The View Bills tab (FR-038–FR-044).
 *
 * Both filters are optional: with neither set every bill is listed, newest
 * first; a date range and a customer narrow it, and combine. The customer
 * options come from the customers remembered across past bills.
 */
import { useEffect, useState } from "react";
import { BillFilters } from "@/components/bills/BillFilters";
import { BillsTable } from "@/components/bills/BillsTable";
import { useRepositories } from "@/components/providers/DataProvider";
import type { BillFilter, BillSummary, Customer } from "@/domain/types";

const EMPTY_FILTER: BillFilter = { from: null, to: null, customer: null };

export interface ViewBillsTabProps {
  refreshKey: number;
  onChanged: () => void;
}

export function ViewBillsTab({ refreshKey, onChanged }: ViewBillsTabProps) {
  const { bills, customers: customerRepository } = useRepositories();
  const [filter, setFilter] = useState<BillFilter>(EMPTY_FILTER);
  const [rows, setRows] = useState<BillSummary[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  const rangeInvalid = Boolean(
    filter.from && filter.to && filter.from > filter.to,
  );

  useEffect(() => {
    let active = true;
    customerRepository
      .list()
      .then((list) => {
        if (active) {
          setCustomers(list);
        }
      })
      .catch(() => {
        if (active) {
          setCustomers([]);
        }
      });
    return () => {
      active = false;
    };
  }, [customerRepository, refreshKey]);

  useEffect(() => {
    let active = true;

    if (rangeInvalid) {
      setRows([]);
      return () => {
        active = false;
      };
    }

    bills
      .list(filter)
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
  }, [bills, filter, refreshKey, rangeInvalid]);

  return (
    <section
      data-slot="view-bills-panel"
      className="rounded-4xl border border-border bg-card/60 p-6"
    >
      <h2 className="font-heading text-lg font-semibold">Review Bills</h2>

      <div className="mt-5 flex flex-col gap-5">
        <div className="rounded-2xl border border-border/60 bg-surface/60 p-5">
          <BillFilters filter={filter} customers={customers} onChange={setFilter} />
          {rangeInvalid ? (
            <p role="alert" className="mt-3 text-sm text-destructive">
              The From date must be on or before the To date.
            </p>
          ) : null}
        </div>

        <div className="rounded-2xl border border-border/60 bg-surface/60 p-5">
          <BillsTable bills={rows} customers={customers} onChanged={onChanged} />
        </div>
      </div>
    </section>
  );
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
