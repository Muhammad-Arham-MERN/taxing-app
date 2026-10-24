// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import { useCallback, useEffect, useState } from "react";
import { LuShieldCheck } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { SecretsDialog } from "@/components/onboarding/SecretsDialog";
import { useRepositories } from "@/components/providers/DataProvider";

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/**
 * Shows whether the cloud connection details are set and offers a **deliberate
 * re-paste** to replace them (FR-049).
 *
 * Secrets are never displayed — only whether they exist.
 */
export function SecretsStatus() {
  const { setup } = useRepositories();
  const [ready, setReady] = useState<boolean | null>(null);
  const [replacing, setReplacing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setReady((await setup.state()).secretsReady);
    } catch {
      setReady(false);
    }
  }, [setup]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (ready === null) {
    return null;
  }

  if (replacing) {
    return (
      <SecretsDialog
        replacing
        onSaved={() => {
          setReplacing(false);
          void refresh();
        }}
      />
    );
  }

  return (
    <section
      data-slot="secrets-status"
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-surface/60 p-4"
    >
      <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <LuShieldCheck aria-hidden="true" className="size-4 text-brand" />
        {ready
          ? "The cloud connection details are set up on this computer."
          : "The cloud connection details are not set up yet."}
      </span>
      <Button type="button" variant="outline" size="sm" onClick={() => setReplacing(true)}>
        {ready ? "Replace connection details" : "Set up connection details"}
      </Button>
    </section>
  );
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
