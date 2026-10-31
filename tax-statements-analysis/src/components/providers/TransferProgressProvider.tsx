// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import { createContext, useContext, type ReactNode } from "react";
import { useTransferProgress } from "@/hooks/useTransferProgress";
import type { TransferProgress } from "@/domain/types";

const TransferContext = createContext<Record<string, TransferProgress>>({});

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/**
 * Supplies the live per-file transfer map to the whole application, so any table
 * row can ask whether its file is moving. Mounted inside `DataProvider` because
 * it reads the cloud repository from there.
 */
export function TransferProgressProvider({ children }: { children: ReactNode }) {
  const transfers = useTransferProgress();
  return <TransferContext.Provider value={transfers}>{children}</TransferContext.Provider>;
}

/**
 * The transfer for one row's file, or `null` when that file is not moving. The
 * `fileRef` is the file's object key, which the event's `id` matches.
 */
export function useTransfer(fileRef: string | null): TransferProgress | null {
  const transfers = useContext(TransferContext);
  if (!fileRef) {
    return null;
  }
  return transfers[fileRef] ?? null;
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
