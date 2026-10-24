// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import { useCallback, useEffect, useState } from "react";
import { useRepositories } from "@/components/providers/DataProvider";
import { toast } from "@/hooks/useToast";
import type {
  CloudPhase,
  CloudStatus,
  CloudUsage,
  ObjectUsage,
  SyncOutcome,
  SyncOutcomeKind,
} from "@/domain/types";

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Short headline per outcome kind; the full message rides as the description. */
const OUTCOME_TITLES: Record<SyncOutcomeKind, string> = {
  success: "Cloud",
  "nothing-new": "Nothing new",
  "no-internet": "No internet",
  "secrets-unavailable": "Cloud not set up",
  "server-unavailable": "Cloud unavailable",
  other: "Cloud",
};

/**
 * Report one outcome as a toast, so the header never carries the message itself
 * (FR-033). The outcome still lands in the controller for the close-time dialog.
 */
function announceOutcome(outcome: SyncOutcome) {
  const variant =
    outcome.kind === "success"
      ? "success"
      : outcome.kind === "nothing-new"
        ? "default"
        : "destructive";
  toast({ title: OUTCOME_TITLES[outcome.kind], description: outcome.message, variant });
}

/** Everything the header, the close warning and the gauge need, in one object. */
export interface CloudSyncController {
  /** `idle` | `pushing` | `pulling` — drives the loader (R10). */
  phase: CloudPhase;
  /** Exactly one outcome per attempt, cleared before the next (FR-033). */
  outcome: SyncOutcome | null;
  status: CloudStatus | null;
  usage: CloudUsage | null;
  /** Oracle Object Storage usage (bucket bytes + files still to upload). */
  objectUsage: ObjectUsage | null;
  /** True while the close-time warning is asking what to do (FR-025). */
  closeWarningOpen: boolean;

  push: () => Promise<void>;
  pull: () => Promise<void>;
  /** Re-prove the cloud connection and re-establish it if it has dropped. */
  reconnect: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  refreshUsage: () => Promise<void>;
  refreshObjectUsage: () => Promise<void>;

  /** Push, show the outcome, then close (FR-026). */
  pushThenClose: () => Promise<void>;
  /** Close at once; the un-pushed work stays safe on this machine (FR-027/FR-028). */
  closeAnyway: () => Promise<void>;
  cancelClose: () => void;
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/**
 * The one place the cloud actions, the progress indicator, the automatic-pull
 * subscription and the close-time safeguard live together (research R6, R9, R10).
 *
 * `onPulled` is called after any pull that changed something — a background one
 * (via `cloud://pulled`) or a manual Sync — so the lists can reload without
 * polling and without touching an in-progress form (FR-023).
 */
export function useCloudSync({
  onPulled,
}: { onPulled?: () => void } = {}): CloudSyncController {
  const { cloud } = useRepositories();
  const [phase, setPhase] = useState<CloudPhase>("idle");
  const [outcome, setOutcome] = useState<SyncOutcome | null>(null);
  const [status, setStatus] = useState<CloudStatus | null>(null);
  const [usage, setUsage] = useState<CloudUsage | null>(null);
  const [objectUsage, setObjectUsage] = useState<ObjectUsage | null>(null);
  const [closeWarningOpen, setCloseWarningOpen] = useState(false);

  // One place that both records the outcome (for the close dialog) and shows it
  // (as a toast), so every attempt reports exactly once (FR-033).
  const report = useCallback((next: SyncOutcome) => {
    setOutcome(next);
    announceOutcome(next);
  }, []);

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await cloud.status());
    } catch {
      // No usable store yet: the gate deals with it, not this hook.
      setStatus(null);
    }
  }, [cloud]);

  const refreshUsage = useCallback(async () => {
    try {
      setUsage(await cloud.usage());
    } catch {
      setUsage(null);
    }
  }, [cloud]);

  const refreshObjectUsage = useCallback(async () => {
    try {
      setObjectUsage(await cloud.objectUsage());
    } catch {
      setObjectUsage(null);
    }
  }, [cloud]);

  // Initial read of the status and the storage figures.
  useEffect(() => {
    void refreshStatus();
    void refreshUsage();
    void refreshObjectUsage();
  }, [refreshStatus, refreshUsage, refreshObjectUsage]);

  // Automatic pulls (R9): refresh the lists and re-read the status.
  useEffect(() => {
    return cloud.onPulled(() => {
      onPulled?.();
      void refreshStatus();
    });
  }, [cloud, onPulled, refreshStatus]);

  const push = useCallback(async () => {
    setPhase("pushing");
    setOutcome(null);
    try {
      const result = await cloud.push();
      report(result.outcome);
      await refreshUsage();
      await refreshObjectUsage();
    } catch (error) {
      report({
        kind: "other",
        message:
          error instanceof Error ? error.message : "The exchange did not finish.",
      });
    } finally {
      setPhase("idle");
      await refreshStatus();
    }
  }, [cloud, report, refreshStatus, refreshUsage, refreshObjectUsage]);

  const pull = useCallback(async () => {
    setPhase("pulling");
    setOutcome(null);
    try {
      const result = await cloud.pull();
      report(result.outcome);
      if (result.changed) {
        onPulled?.();
      }
      await refreshUsage();
      await refreshObjectUsage();
    } catch (error) {
      report({
        kind: "other",
        message:
          error instanceof Error ? error.message : "The exchange did not finish.",
      });
    } finally {
      setPhase("idle");
      await refreshStatus();
    }
  }, [cloud, onPulled, report, refreshStatus, refreshUsage, refreshObjectUsage]);

  // Check the cloud connection and refresh the storage figures. Deliberately
  // does **not** push or pull: it only makes sure this computer is pointed at
  // the cloud and the gauges are current (FR-047 spirit, scoped to a check).
  const reconnect = useCallback(async () => {
    setPhase("reconnecting");
    setOutcome(null);
    try {
      const result = await cloud.reconnect();
      report({
        kind: result.connected ? "success" : "other",
        message: result.message,
      });
      setUsage(result.usage);
      setObjectUsage(result.objectUsage);
    } catch (error) {
      report({
        kind: "other",
        message:
          error instanceof Error ? error.message : "The connection could not be checked.",
      });
    } finally {
      setPhase("idle");
      await refreshStatus();
    }
  }, [cloud, report, refreshStatus]);

  // ── Close-time safeguard (R6, FR-025–FR-028) ──────────────────────────────
  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let unlisten: (() => void) | undefined;
    let disposed = false;

    void (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const disposer = await getCurrentWindow().onCloseRequested(async (event) => {
          const current = await cloud.status();
          if (!current.hasUnpushed) {
            return;
          }
          // Hold the close and ask; closing is still always offered.
          event.preventDefault();
          setCloseWarningOpen(true);
        });
        if (disposed) {
          disposer();
        } else {
          unlisten = disposer;
        }
      } catch {
        // Not running under Tauri (a browser or the test runner).
      }
    })();

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [cloud]);

  const destroyWindow = useCallback(async () => {
    if (!isTauriRuntime()) {
      return;
    }
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().destroy();
    } catch {
      // Nothing else to do; the window is still closable by hand.
    }
  }, []);

  const pushThenClose = useCallback(async () => {
    await push();
    await destroyWindow();
  }, [push, destroyWindow]);

  const closeAnyway = useCallback(async () => {
    setCloseWarningOpen(false);
    await destroyWindow();
  }, [destroyWindow]);

  const cancelClose = useCallback(() => setCloseWarningOpen(false), []);

  return {
    phase,
    outcome,
    status,
    usage,
    objectUsage,
    closeWarningOpen,
    push,
    pull,
    reconnect,
    refreshStatus,
    refreshUsage,
    refreshObjectUsage,
    pushThenClose,
    closeAnyway,
    cancelClose,
  };
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
