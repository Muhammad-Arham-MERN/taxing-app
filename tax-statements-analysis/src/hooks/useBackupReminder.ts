// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import { useEffect, useState } from "react";
import { todayIso } from "@/lib/format";

/** Where the last month a reminder was shown is remembered (this machine only). */
export const BACKUP_REMINDER_KEY = "tax-statements-backup-reminder";

/** The current month as `YYYY-MM`. */
function currentMonth(): string {
  return todayIso().slice(0, 7);
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/**
 * The monthly backup reminder (client request: "Every month the user is informed
 * via dialog box to backup their database file").
 *
 * It is purely a reminder — it copies nothing. The month it last appeared is kept
 * in `localStorage` (this machine only, never the store), so it shows once per
 * calendar month and never nags on every launch.
 */
export function useBackupReminder(): { open: boolean; dismiss: () => void } {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const month = currentMonth();
    let lastShown: string | null = null;
    try {
      lastShown = window.localStorage.getItem(BACKUP_REMINDER_KEY);
    } catch {
      // localStorage is unavailable; show it rather than skip it entirely.
    }
    if (lastShown !== month) {
      setOpen(true);
      try {
        window.localStorage.setItem(BACKUP_REMINDER_KEY, month);
      } catch {
        // Nothing to do; the reminder simply reappears next launch.
      }
    }
  }, []);

  return { open, dismiss: () => setOpen(false) };
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
