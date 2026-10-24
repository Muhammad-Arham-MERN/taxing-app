// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { SecretsDialog } from "@/components/onboarding/SecretsDialog";
import { StorageGate } from "@/components/storage/StorageGate";
import { useRepositories } from "@/components/providers/DataProvider";
import type { SetupState, StorageState } from "@/domain/types";

export interface SetupGateProps {
  storageState: StorageState;
  onChooseStorage: () => void;
  children: ReactNode;
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/**
 * The setup gate: the application's normal screens are shown **only** when both
 * `storageReady` and `secretsReady` are true (FR-005).
 *
 * A missing store shows the storage step first; once a store exists but the
 * secrets do not, the paste screen is shown. A failure keeps the gate open
 * (FR-047).
 */
export function SetupGate({ storageState, onChooseStorage, children }: SetupGateProps) {
  const { setup } = useRepositories();
  const [state, setState] = useState<SetupState | null>(null);

  const refresh = useCallback(async () => {
    try {
      setState(await setup.state());
    } catch {
      setState({ storageReady: false, secretsReady: false });
    }
  }, [setup]);

  // Re-read whenever the storage choice changes, so the gate advances as soon as
  // a store exists.
  useEffect(() => {
    void refresh();
  }, [refresh, storageState.chosen]);

  // Nothing is decided yet: show no screen rather than a wrong one.
  if (state === null) {
    return null;
  }

  if (state.storageReady && state.secretsReady) {
    return <>{children}</>;
  }

  if (!state.storageReady) {
    return <StorageGate state={storageState} onChoose={onChooseStorage} />;
  }

  return <SecretsDialog onSaved={() => void refresh()} />;
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
