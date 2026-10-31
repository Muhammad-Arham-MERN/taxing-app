// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import { useEffect, useState } from "react";
import { useRepositories } from "@/components/providers/DataProvider";
import type { TransferProgress } from "@/domain/types";

/** How long a finished transfer lingers before its loader is removed. */
const LINGER_MS = 800;

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/**
 * The live file transfers, keyed by object key.
 *
 * Subscribes once to the backend's `cloud://transfer` events and keeps the
 * latest update per file. A finished (or failed) transfer is held briefly so its
 * final state shows before the loader disappears. The map is exposed so a row
 * can look up its own transfer by `fileRef`.
 */
export function useTransferProgress(): Record<string, TransferProgress> {
  const { cloud } = useRepositories();
  const [transfers, setTransfers] = useState<Record<string, TransferProgress>>({});

  useEffect(() => {
    const timers = new Map<string, ReturnType<typeof setTimeout>>();

    const dispose = cloud.onTransfer((progress) => {
      const pending = timers.get(progress.id);
      if (pending) {
        clearTimeout(pending);
        timers.delete(progress.id);
      }

      setTransfers((current) => ({ ...current, [progress.id]: progress }));

      if (!progress.done) {
        return;
      }

      // Hold the final frame, then clear this file's loader.
      const timer = setTimeout(() => {
        timers.delete(progress.id);
        setTransfers((current) => {
          const next = { ...current };
          delete next[progress.id];
          return next;
        });
      }, LINGER_MS);
      timers.set(progress.id, timer);
    });

    return () => {
      dispose();
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, [cloud]);

  return transfers;
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
