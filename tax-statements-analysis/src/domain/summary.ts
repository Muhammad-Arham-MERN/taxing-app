// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import type { Statement, StatementSummary } from "@/domain/types";

export function isRangeValid(from: string, to: string): boolean {
  return from !== "" && to !== "" && from <= to;
}

export function filterByDateRange(
  statements: Statement[],
  from: string,
  to: string,
): Statement[] {
  if (!isRangeValid(from, to)) {
    return [];
  }
  return statements.filter((statement) => statement.date >= from && statement.date <= to);
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
export function summarize(statements: Statement[]): StatementSummary {
  let totalInflow = 0;
  let totalOutflow = 0;

  for (const statement of statements) {
    if (statement.type === "inflow") {
      totalInflow += statement.amount;
    } else {
      totalOutflow += statement.amount;
    }
  }

  return {
    totalInflow,
    totalOutflow,
    balance: totalInflow - totalOutflow,
  };
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
