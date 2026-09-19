// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import { useEffect, useMemo, useState } from "react";
import { RevealHeader } from "@/components/layout/RevealHeader";
import { DataProvider, useRepositories } from "@/components/providers/DataProvider";
import { THEME_STORAGE_KEY, ThemeProvider } from "@/components/providers/ThemeProvider";
import { StorageGate } from "@/components/storage/StorageGate";
import { StorageLocationDialog } from "@/components/storage/StorageLocationDialog";
import { CreateBillForm } from "@/components/bills/CreateBillForm";
import { ViewBillsTab } from "@/components/bills/ViewBillsTab";
import { CreateStatementForm } from "@/components/statements/CreateStatementForm";
import { createDefaultFilter, DateRangeFilter } from "@/components/statements/DateRangeFilter";
import { StatementsTable } from "@/components/statements/StatementsTable";
import { SummaryFooter } from "@/components/statements/SummaryFooter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HEADER_IDENTITY } from "@/domain/identity";
import { isRangeValid, summarize } from "@/domain/summary";
import type { Statement, StatementFilter, StorageState } from "@/domain/types";

const EMPTY_STATE: StorageState = { chosen: false, location: null, problem: null };

function ViewTab({
  refreshKey,
  onChanged,
}: {
  refreshKey: number;
  onChanged: () => void;
}) {
  const { statements } = useRepositories();
  const [filter, setFilter] = useState<StatementFilter>(() => createDefaultFilter());
  const [rows, setRows] = useState<Statement[]>([]);

  const rangeValid = isRangeValid(filter.from, filter.to);

  useEffect(() => {
    let active = true;

    if (!rangeValid) {
      setRows([]);
      return () => {
        active = false;
      };
    }

    statements
      .findByDateRange({ from: filter.from, to: filter.to })
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
  }, [statements, filter.from, filter.to, refreshKey, rangeValid]);

  const summary = useMemo(() => summarize(rows), [rows]);

  return (
    <section data-slot="view-panel" className="rounded-4xl border border-border bg-card/60 p-6">
      <h2 className="font-heading text-lg font-semibold">Review Statements</h2>

      <div className="mt-5 flex flex-col gap-5">
        <div className="rounded-2xl border border-border/60 bg-surface/60 p-5">
          <DateRangeFilter from={filter.from} to={filter.to} onChange={setFilter} />
        </div>

        <div className="rounded-2xl border border-border/60 bg-surface/60 p-5">
          <StatementsTable statements={rows} onChanged={onChanged} />
        </div>

        <SummaryFooter summary={summary} />
      </div>
    </section>
  );
}

function AppShell() {
  const { storage, storageState, refreshStorage } = useRepositories();
  const [refreshKey, setRefreshKey] = useState(0);
  const [chooserOpen, setChooserOpen] = useState(false);

  useEffect(() => {
    if (storageState === null) {
      void refreshStorage();
    }
  }, [storageState, refreshStorage]);

  // Nothing else is reachable until a usable store exists (FR-015).
  const ready = storageState?.chosen === true;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <RevealHeader
        profile={HEADER_IDENTITY}
        onChooseStorage={() => setChooserOpen(true)}
      />

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        {ready ? (
          <Tabs defaultValue="create-statement" className="items-center gap-8">
            {/* Two labelled groups — Statements and Bills — separated by a gap
                rather than a rule (FR-001–FR-003); the statements panels are
                unchanged. */}
            <div
              data-slot="nav-groups"
              className="flex flex-wrap items-start justify-center gap-10"
            >
              <div className="flex flex-col items-center gap-2">
                <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Statements
                </span>
                <TabsList>
                  <TabsTrigger value="create-statement">Create</TabsTrigger>
                  <TabsTrigger value="view-statements">View</TabsTrigger>
                </TabsList>
              </div>

              <div className="flex flex-col items-center gap-2">
                <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Bills
                </span>
                <TabsList>
                  <TabsTrigger value="create-bill">Create</TabsTrigger>
                  <TabsTrigger value="view-bills">View</TabsTrigger>
                </TabsList>
              </div>
            </div>

            <TabsContent value="create-statement" className="tab-content-enter w-full">
              <CreateStatementForm onCreated={() => setRefreshKey((key) => key + 1)} />
            </TabsContent>

            <TabsContent value="view-statements" className="tab-content-enter w-full">
              <ViewTab
                refreshKey={refreshKey}
                onChanged={() => setRefreshKey((key) => key + 1)}
              />
            </TabsContent>

            <TabsContent value="create-bill" className="tab-content-enter w-full">
              <CreateBillForm onCreated={() => setRefreshKey((key) => key + 1)} />
            </TabsContent>

            <TabsContent value="view-bills" className="tab-content-enter w-full">
              <ViewBillsTab
                refreshKey={refreshKey}
                onChanged={() => setRefreshKey((key) => key + 1)}
              />
            </TabsContent>
          </Tabs>
        ) : (
          <StorageGate
            state={storageState ?? EMPTY_STATE}
            onChoose={() => setChooserOpen(true)}
          />
        )}
      </main>

      <StorageLocationDialog
        open={chooserOpen}
        onOpenChange={setChooserOpen}
        storage={storage}
        hasCurrentStore={ready}
        onChanged={() => {
          void refreshStorage();
          setRefreshKey((key) => key + 1);
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey={THEME_STORAGE_KEY}>
      <DataProvider>
        <AppShell />
      </DataProvider>
    </ThemeProvider>
  );
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
