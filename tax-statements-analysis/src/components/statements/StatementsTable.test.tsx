// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StatementsTable } from "@/components/statements/StatementsTable";
import { SummaryFooter } from "@/components/statements/SummaryFooter";
import { summarize } from "@/domain/summary";
import type { Statement } from "@/domain/types";

function makeStatement(overrides: Partial<Statement> = {}): Statement {
  return {
    id: overrides.id ?? "id",
    date: overrides.date ?? "2026-09-14",
    type: overrides.type ?? "inflow",
    nature: overrides.nature ?? "Audit Fee",
    amount: overrides.amount ?? 100,
    remarks: overrides.remarks ?? null,
    fileName: overrides.fileName ?? null,
    fileRef: null,
    createdAt: "2026-09-14T00:00:00.000Z",
  };
}

describe("StatementsTable", () => {
  it("renders each statement with ISO date and ₨ amount", () => {
    render(
      <StatementsTable
        statements={[makeStatement({ id: "s1", amount: 1234.5, nature: "Audit Fee" })]}
        onChanged={() => {}}
      />,
    );

    expect(screen.getByText("2026-09-14")).toBeInTheDocument();
    expect(screen.getByText("In-Flow")).toBeInTheDocument();
    expect(screen.getByText("Audit Fee")).toBeInTheDocument();
    expect(screen.getByText("₨ 1,234.50")).toBeInTheDocument();
  });

  it("renders None for missing remarks and file", () => {
    render(
      <StatementsTable
        statements={[makeStatement({ remarks: null, fileName: null })]}
        onChanged={() => {}}
      />,
    );

    expect(screen.getAllByText("None")).toHaveLength(2);
  });

  it("shows a clear empty state when nothing matches", () => {
    render(<StatementsTable statements={[]} onChanged={() => {}} />);

    expect(screen.getByText("No statements in this range.")).toBeInTheDocument();
  });

  it("paginates results beyond the page size", async () => {
    const user = userEvent.setup();
    const statements = Array.from({ length: 30 }, (_, index) =>
      makeStatement({ id: `s${index}`, nature: `Nature ${index}` }),
    );

    render(<StatementsTable statements={statements} onChanged={() => {}} />);

    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(26);

    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(6);
  });
});

describe("SummaryFooter", () => {
  it("renders the three totals with balance equal to inflow minus outflow", () => {
    const rows = [
      makeStatement({ id: "i1", type: "inflow", amount: 1000 }),
      makeStatement({ id: "o1", type: "outflow", amount: 250.5 }),
    ];

    render(<SummaryFooter summary={summarize(rows)} />);

    expect(screen.getByText("Total In-Flow")).toBeInTheDocument();
    expect(screen.getByText("₨ 1,000.00")).toBeInTheDocument();
    expect(screen.getByText("Total Out-Flow")).toBeInTheDocument();
    expect(screen.getByText("₨ 250.50")).toBeInTheDocument();
    expect(screen.getByText("Balance")).toBeInTheDocument();
    expect(screen.getByText("₨ 749.50")).toBeInTheDocument();
  });
});

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
