// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { LuLoader } from "react-icons/lu";
import { Button } from "@/components/ui/button";

export interface CreationLock {
  /** True while a file-based entry is being written. */
  locked: boolean;
  /** Mark the start of a write; returns a token to pass back to `end`. */
  begin: (label?: string) => number;
  /** Mark the end of the write that owns `token`. */
  end: (token: number) => void;
  /** Force-release every held lock — the overlay's Cancel action. */
  release: () => void;
}

/** Used when no provider is mounted (unit tests render forms on their own). */
const NOOP: CreationLock = {
  locked: false,
  begin: () => 0,
  end: () => {},
  release: () => {},
};

const CreationLockContext = createContext<CreationLock | null>(null);

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/**
 * Blocks the whole interface while a record with a file is being written, so a
 * slow save cannot be interrupted and the same entry cannot be created twice.
 *
 * A form calls `begin()` before it awaits the store and `end(token)` when the
 * write settles. While a write is in flight a full-screen overlay (below
 * dialogs) covers the tabs, the other forms and every header action, with a
 * Cancel that releases the wait if a save takes too long.
 */
export function CreationLockProvider({ children }: { children: ReactNode }) {
  // A set of live tokens rather than a flag: cancelling clears every token, and a
  // late `end()` from a cancelled write can never release a newer one.
  const [tokens, setTokens] = useState<ReadonlySet<number>>(() => new Set());
  const [label, setLabel] = useState("Creating…");
  const nextToken = useRef(0);

  const begin = useCallback((nextLabel?: string) => {
    const token = nextToken.current;
    nextToken.current += 1;
    if (nextLabel) {
      setLabel(nextLabel);
    }
    setTokens((current) => {
      const next = new Set(current);
      next.add(token);
      return next;
    });
    return token;
  }, []);

  const end = useCallback((token: number) => {
    setTokens((current) => {
      if (!current.has(token)) {
        return current;
      }
      const next = new Set(current);
      next.delete(token);
      return next;
    });
  }, []);

  const release = useCallback(() => {
    setTokens((current) => (current.size === 0 ? current : new Set()));
  }, []);

  const value = useMemo<CreationLock>(
    () => ({ locked: tokens.size > 0, begin, end, release }),
    [tokens, begin, end, release],
  );

  return (
    <CreationLockContext.Provider value={value}>
      {children}
      {tokens.size > 0 ? <CreationLockOverlay label={label} onCancel={release} /> : null}
    </CreationLockContext.Provider>
  );
}

/** The lock, or a harmless no-op when no provider is mounted. */
export function useCreationLock(): CreationLock {
  return useContext(CreationLockContext) ?? NOOP;
}

function CreationLockOverlay({ label, onCancel }: { label: string; onCancel: () => void }) {
  return (
    <div
      data-slot="creation-lock-overlay"
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="fixed inset-0 z-40 flex items-center justify-center bg-background/60 p-4 backdrop-blur-sm"
    >
      <div className="flex max-w-sm flex-col items-center gap-3 rounded-2xl border border-border bg-card px-6 py-5 text-center shadow-lg">
        <LuLoader aria-hidden="true" className="size-6 animate-spin text-brand" />
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">
          Large files can take a moment. Please wait and don't switch tabs until it
          finishes.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
