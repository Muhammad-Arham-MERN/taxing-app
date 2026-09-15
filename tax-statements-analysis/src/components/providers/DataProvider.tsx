// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import type { StatementRepository, StorageRepository } from "@/data/repositories";
import {
  createInMemoryRepositories,
  InMemoryBusinessProfileRepository,
  type Repositories,
} from "@/data/in-memory";
import { TauriStatementRepository, TauriStorageRepository } from "@/data/tauri";
import type { StorageState } from "@/domain/types";

interface DataContextValue {
  statements: StatementRepository;
  storage: StorageRepository;
  /** `null` until the first read of the storage state completes. */
  storageState: StorageState | null;
  refreshStorage: () => Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

/**
 * The running application talks to Rust; a plain browser (or the test runner)
 * falls back to the in-memory implementation, which is what lets `npm run dev`
 * work without the Tauri shell.
 */
function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function tauriRepositories(): Repositories {
  return {
    statements: new TauriStatementRepository(),
    storage: new TauriStorageRepository(),
    // The header's details are fixed and are never stored (FR-053), so this
    // remains an in-memory constant even in the running application.
    businessProfile: new InMemoryBusinessProfileRepository(),
  };
}

export function DataProvider({
  children,
  repositories,
}: {
  children: ReactNode;
  repositories?: Repositories;
}) {
  const [source] = useState<Repositories>(
    () => repositories ?? (isTauriRuntime() ? tauriRepositories() : createInMemoryRepositories()),
  );
  const [storageState, setStorageState] = useState<StorageState | null>(null);

  const refreshStorage = useCallback(async () => {
    setStorageState(await source.storage.getState());
  }, [source.storage]);

  return (
    <DataContext.Provider
      value={{
        statements: source.statements,
        storage: source.storage,
        storageState,
        refreshStorage,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useRepositories(): DataContextValue {
  const value = useContext(DataContext);
  if (!value) {
    throw new Error("useRepositories must be used within a DataProvider.");
  }
  return value;
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
