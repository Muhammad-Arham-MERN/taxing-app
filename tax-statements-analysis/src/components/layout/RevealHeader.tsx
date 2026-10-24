// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import { motion } from "framer-motion";
import { cn } from "cn";
import { LuRefreshCw, LuScale } from "react-icons/lu";
import { ModeToggle } from "@/components/layout/ModeToggle";
import { CloudActions } from "@/components/cloud/CloudActions";
import { ObjectStorageGauge, StorageGauge } from "@/components/cloud/StorageGauge";
import { Button } from "@/components/ui/button";
import type { CloudSyncController } from "@/hooks/useCloudSync";
import type { BusinessProfile } from "@/domain/types";

export interface RevealHeaderProps {
  profile: BusinessProfile;
  onChooseStorage: () => void;
  /** The cloud actions, gauge and outcome — omitted when there is no store yet. */
  cloud?: CloudSyncController | null;
}

export function RevealHeader({ profile, onChooseStorage, cloud }: RevealHeaderProps) {
  return (
    <motion.header
      data-slot="reveal-header"
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="flex flex-col gap-3 border-b border-border px-6 py-4"
    >
      {/* The top: the company's name and where it is. */}
      <div className="flex items-center gap-3">
        <LuScale aria-hidden="true" className="size-7 shrink-0 text-brand" />
        <div className="flex flex-col">
          <span className="font-heading text-base font-semibold">{profile.brandName}</span>
          <span className="text-xs text-muted-foreground">{profile.location}</span>
        </div>
      </div>

      {/* Below it: the contact numbers on the left, everything else on the right,
          with the space between them in the middle. */}
      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {profile.contacts.map((contact) => (
            <li key={contact}>{contact}</li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          {/* The purple "Turso Cloud" storage gauge, refreshed after every
              Push/Sync (FR-029, FR-030), with a Reconnect action beside it for
              when the connection has dropped (FR-047). */}
          {cloud ? (
            <div className="flex items-center gap-4">
              <StorageGauge usage={cloud.usage} />
              <ObjectStorageGauge usage={cloud.objectUsage} />
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                disabled={cloud.phase !== "idle" || cloud.status?.configured === false}
                aria-label="Reconnect"
                title="Reconnect to the cloud"
                onClick={() => void cloud.reconnect()}
              >
                <LuRefreshCw
                  aria-hidden="true"
                  className={cn("size-4", cloud.phase === "reconnecting" && "animate-spin")}
                />
              </Button>
            </div>
          ) : null}

          {/* Push and Sync, each icon-only with a spinner while it runs (FR-006,
              FR-013, FR-033, FR-036). */}
          {cloud ? <CloudActions controller={cloud} /> : null}

          <ModeToggle />

          {/* Replaces Module 1's Settings control, which is gone (FR-018, FR-053). */}
          <Button type="button" variant="outline" size="lg" onClick={onChooseStorage}>
            Storage Directory
          </Button>
        </div>
      </div>
    </motion.header>
  );
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
