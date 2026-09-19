// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BillsTable } from "@/components/bills/BillsTable";
import { DataProvider } from "@/components/providers/DataProvider";
import { createInMemoryRepositories } from "@/data/in-memory";
import type { BillSummary } from "@/domain/types";

function renderTable(ui: ReactElement) {
  return render(
    <DataProvider repositories={createInMemoryRepositories()}>{ui}</DataProvider>,
  );
}

const rows: BillSummary[] = [
  {
    id: "b1",
    invoiceNo: "INV-0001",
    date: "2026-09-18",
    customerName: "Acme Traders",
    details: "Audit Fee",
    total: 1500,
  },
];

describe("BillsTable", () => {
  it("shows the four columns the client asked for", () => {
    renderTable(<BillsTable bills={rows} customers={[]} onChanged={() => {}} />);

    expect(
      screen.getByRole("columnheader", { name: "Customer Name" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Date" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Details" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Amount" })).toBeInTheDocument();
    expect(screen.getByText("Acme Traders")).toBeInTheDocument();
    expect(screen.getByText("PKR 1,500.00")).toBeInTheDocument();
  });

  it("shows a clear empty state when nothing matches", () => {
    renderTable(<BillsTable bills={[]} customers={[]} onChanged={() => {}} />);

    expect(screen.getByText("No bills for this selection.")).toBeInTheDocument();
  });
});

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
