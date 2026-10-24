// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import { useEffect, useMemo, useState } from "react";
import { BackupReminderDialog } from "@/components/layout/BackupReminderDialog";
import { RevealHeader } from "@/components/layout/RevealHeader";
import { DataProvider, useRepositories } from "@/components/providers/DataProvider";
import { THEME_STORAGE_KEY, ThemeProvider } from "@/components/providers/ThemeProvider";
import { SetupGate } from "@/components/onboarding/SetupGate";
import { CloseWarningDialog } from "@/components/cloud/CloseWarningDialog";
import { StorageLocationDialog } from "@/components/storage/StorageLocationDialog";
import { CreateBillForm } from "@/components/bills/CreateBillForm";
import { ViewBillsTab } from "@/components/bills/ViewBillsTab";
import { CreateClientForm } from "@/components/clients/CreateClientForm";
import { ViewClientsTab } from "@/components/clients/ViewClientsTab";
import { CreateStatementForm } from "@/components/statements/CreateStatementForm";
import { createDefaultFilter, DateRangeFilter } from "@/components/statements/DateRangeFilter";
import { StatementsTable } from "@/components/statements/StatementsTable";
import { SummaryFooter } from "@/components/statements/SummaryFooter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/toast";
import { HEADER_IDENTITY } from "@/domain/identity";
import { isRangeValid, summarize } from "@/domain/summary";
import { useBackupReminder } from "@/hooks/useBackupReminder";
import { useCloudSync } from "@/hooks/useCloudSync";
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

  // Automatic pulls refresh the installed lists through the existing refreshKey
  // (R9, FR-023): a background pull never touches an in-progress form, it only
  // reloads the tables.
  const bumpRefresh = () => setRefreshKey((key) => key + 1);
  const cloud = useCloudSync({ onPulled: bumpRefresh });
  const backup = useBackupReminder();

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
        cloud={ready ? cloud : null}
      />

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <SetupGate
          storageState={storageState ?? EMPTY_STATE}
          onChooseStorage={() => setChooserOpen(true)}
        >
          <Tabs defaultValue="create-statement" className="items-center gap-8">
            {/* Three labelled groups — Statements, Bills and Clients — separated
                by a gap rather than a rule (FR-001–FR-003). Each group is just a
                label and its own TabsList; Radix treats the triggers as one
                shared value. */}
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

              <div className="flex flex-col items-center gap-2">
                <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Clients
                </span>
                <TabsList>
                  <TabsTrigger value="create-client">Create</TabsTrigger>
                  <TabsTrigger value="view-clients">View</TabsTrigger>
                </TabsList>
              </div>
            </div>

            <TabsContent value="create-statement" className="tab-content-enter w-full">
              <CreateStatementForm onCreated={bumpRefresh} />
            </TabsContent>

            <TabsContent value="view-statements" className="tab-content-enter w-full">
              <ViewTab refreshKey={refreshKey} onChanged={bumpRefresh} />
            </TabsContent>

            <TabsContent value="create-bill" className="tab-content-enter w-full">
              <CreateBillForm onCreated={bumpRefresh} />
            </TabsContent>

            <TabsContent value="view-bills" className="tab-content-enter w-full">
              <ViewBillsTab refreshKey={refreshKey} onChanged={bumpRefresh} />
            </TabsContent>

            <TabsContent value="create-client" className="tab-content-enter w-full">
              <CreateClientForm onCreated={bumpRefresh} />
            </TabsContent>

            <TabsContent value="view-clients" className="tab-content-enter w-full">
              <ViewClientsTab refreshKey={refreshKey} onChanged={bumpRefresh} />
            </TabsContent>
          </Tabs>
        </SetupGate>
      </main>

      <StorageLocationDialog
        open={chooserOpen}
        onOpenChange={setChooserOpen}
        storage={storage}
        hasCurrentStore={ready}
        onChanged={() => {
          void refreshStorage();
          bumpRefresh();
        }}
      />

      {/* The close-time safeguard: warns, offers to push, and never traps the
          practitioner (FR-025–FR-028). */}
      <CloseWarningDialog
        open={cloud.closeWarningOpen}
        phase={cloud.phase}
        outcome={cloud.outcome}
        onPushThenClose={() => void cloud.pushThenClose()}
        onCloseAnyway={() => void cloud.closeAnyway()}
        onCancel={cloud.cancelClose}
      />

      {/* Once a calendar month, a nudge to back up the database file (client
          request). Only once a store exists, so the advice is accurate. */}
      <BackupReminderDialog
        open={backup.open && ready}
        onOpenChange={(open) => {
          if (!open) {
            backup.dismiss();
          }
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
      {/* Cloud outcomes surface here, so the header keeps its shape (FR-033). */}
      <Toaster />
    </ThemeProvider>
  );
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
