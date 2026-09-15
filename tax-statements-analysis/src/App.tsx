// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import { useEffect, useMemo, useState } from "react";
import { RevealHeader } from "@/components/layout/RevealHeader";
import { DataProvider, useRepositories } from "@/components/providers/DataProvider";
import { THEME_STORAGE_KEY, ThemeProvider } from "@/components/providers/ThemeProvider";
import { StorageGate } from "@/components/storage/StorageGate";
import { StorageLocationDialog } from "@/components/storage/StorageLocationDialog";
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
          <Tabs defaultValue="create" className="items-center gap-8">
            <TabsList>
              <TabsTrigger value="create">Create</TabsTrigger>
              <TabsTrigger value="view">View</TabsTrigger>
            </TabsList>

            <TabsContent value="create" className="tab-content-enter w-full">
              <CreateStatementForm onCreated={() => setRefreshKey((key) => key + 1)} />
            </TabsContent>

            <TabsContent value="view" className="tab-content-enter w-full">
              <ViewTab
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
