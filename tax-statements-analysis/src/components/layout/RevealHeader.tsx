// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import { motion } from "framer-motion";
import { LuScale } from "react-icons/lu";
import { ModeToggle } from "@/components/layout/ModeToggle";
import { Button } from "@/components/ui/button";
import type { BusinessProfile } from "@/domain/types";

export interface RevealHeaderProps {
  profile: BusinessProfile;
  onChooseStorage: () => void;
}

export function RevealHeader({ profile, onChooseStorage }: RevealHeaderProps) {
  return (
    <motion.header
      data-slot="reveal-header"
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-6 py-4"
    >
      <div className="flex items-center gap-3">
        <LuScale aria-hidden="true" className="size-7 shrink-0 text-brand" />
        <div className="flex flex-col">
          <span className="font-heading text-base font-semibold">{profile.brandName}</span>
          <span className="text-xs text-muted-foreground">{profile.location}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {profile.contacts.map((contact) => (
            <li key={contact}>{contact}</li>
          ))}
        </ul>
        <div className="flex items-center gap-2">
          <ModeToggle />
          {/* Replaces Module 1's Settings control, which is gone (FR-018, FR-053). */}
          <Button type="button" variant="outline" size="lg" onClick={onChooseStorage}>
            Choose Storage Directory
          </Button>
        </div>
      </div>
    </motion.header>
  );
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
