// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import type { StatementSummary } from "@/domain/types";
import { formatAmount } from "@/lib/format";

export interface SummaryFooterProps {
  summary: StatementSummary;
}

export function SummaryFooter({ summary }: SummaryFooterProps) {
  return (
    <dl
      data-slot="summary-footer"
      className="flex flex-wrap justify-end gap-x-12 gap-y-4 text-right"
    >
      <div className="flex flex-col items-end gap-1">
        <dt className="text-sm text-muted-foreground">Total In-Flow</dt>
        <dd className="text-xl font-medium text-brand">{formatAmount(summary.totalInflow)}</dd>
      </div>
      <div className="flex flex-col items-end gap-1">
        <dt className="text-sm text-muted-foreground">Total Out-Flow</dt>
        <dd className="text-xl font-medium">{formatAmount(summary.totalOutflow)}</dd>
      </div>
      <div className="flex flex-col items-end gap-1 border-l border-border pl-12">
        <dt className="text-sm text-muted-foreground">Balance</dt>
        <dd className="text-xl font-semibold">{formatAmount(summary.balance)}</dd>
      </div>
    </dl>
  );
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
