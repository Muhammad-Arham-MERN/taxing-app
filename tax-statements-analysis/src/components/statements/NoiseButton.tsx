// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "cn";

const NOISE_TEXTURE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E";

export interface NoiseButtonProps {
  children: ReactNode;
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
}

export function NoiseButton({
  children,
  type = "submit",
  disabled = false,
  className,
}: NoiseButtonProps) {
  return (
    <motion.button
      type={type}
      disabled={disabled}
      whileHover={disabled ? undefined : { scale: 1.02 }}
      whileTap={disabled ? undefined : { scale: 0.98 }}
      className={cn(
        "relative inline-flex h-11 items-center justify-center overflow-hidden rounded-full px-10 text-base font-semibold text-brand-foreground",
        "bg-brand transition-colors hover:bg-brand-hover",
        "focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-brand",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-25 mix-blend-overlay"
        style={{ backgroundImage: `url("${NOISE_TEXTURE}")`, backgroundSize: "160px 160px" }}
      />
      <span className="relative z-10">{children}</span>
    </motion.button>
  );
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
