// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import { LuHardDrive } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import type { StorageState } from "@/domain/types";

export interface StorageGateProps {
  state: StorageState;
  onChoose: () => void;
}

function messageFor(state: StorageState): { title: string; body: string } {
  switch (state.problem) {
    case "unreachable":
      return {
        title: "Your records cannot be reached",
        body:
          "The folder holding your records has moved, been renamed, or is on a drive that " +
          "is not connected. Nothing has been lost — point the application at it again to " +
          "carry on.",
      };
    case "not-a-store":
      return {
        title: "That is not your records file",
        body:
          "The file the application was pointed at is not one of its records files. It has " +
          "been left exactly as it was. Choose again to continue.",
      };
    case "damaged":
      return {
        title: "Your records file cannot be opened",
        body:
          "It appears to be damaged. It has been left exactly as it is, untouched, and " +
          "nothing has been written over it.",
      };
    case "unwritable":
      return {
        title: "That folder cannot be written to",
        body: "Choose a different folder to continue.",
      };
    default:
      return {
        title: "Welcome",
        body:
          "Before you can record anything, choose where your statements and their files " +
          "should be kept. Everything stays on this machine.",
      };
  }
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/**
 * Shown instead of the application while no usable store exists. Recording,
 * reviewing and editing are not merely disabled — they are not mounted at all
 * (FR-015).
 */
export function StorageGate({ state, onChoose }: StorageGateProps) {
  const { title, body } = messageFor(state);

  return (
    <section
      data-slot="storage-gate"
      className="rounded-4xl border border-border bg-card/60 p-8 text-center"
    >
      <LuHardDrive aria-hidden="true" className="mx-auto size-8 text-brand" />
      <h2 className="mt-4 font-heading text-lg font-semibold">{title}</h2>
      <p className="mx-auto mt-2 max-w-prose text-sm text-muted-foreground">{body}</p>

      {state.location ? (
        <p className="mt-3 text-xs break-all text-muted-foreground">{state.location.path}</p>
      ) : null}

      <div className="mt-6 flex justify-center">
        <Button type="button" size="lg" onClick={onChoose}>
          Choose Storage Directory
        </Button>
      </div>
    </section>
  );
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
