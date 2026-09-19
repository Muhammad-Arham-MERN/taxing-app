// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import type { BusinessProfile } from "@/domain/types";

/**
 * The header's identifying details, which are **fixed** (FR-053).
 *
 * They cannot be updated and are therefore not stored anywhere: there is no
 * settings dialog and no repository for them. Module 1's header-customisation
 * requirements are superseded by this module's FR-026/FR-027.
 */
export const HEADER_IDENTITY: BusinessProfile = {
  brandName: "M&M Tax Law Solutions",
  location: "Office no 8, 1st Floor, Pounch House Complex, Adam Jee Road, Rawalpindi",
  contacts: ["+92 334-5739614", "+92 312-5739614", "051-5910021"],
};

/** The full legal name used on the invoice's signature line (FR-032). */
export const COMPANY_FULL_NAME = "M&M Tax Law Solutions";

/** The account holder defaulted on every new bill (FR-010). */
export const DEFAULT_ACCOUNT_HOLDER = "Mumtaz Qureshi";

/**
 * The +92 examples shown for the wallet numbers — the default placeholder, and
 * the example in the validation message (client request, 2026-09-19).
 */
export const WALLET_PLACEHOLDERS = {
  jazzcash: "+923225739614",
  easypaisa: "+923125739614",
} as const;

/**
 * The invoice footer's fixed bank details (FR-033), shown as columns beside the
 * wallet numbers the bill carries (client change, 2026-09-19).
 */
export const BANK_DETAILS = [
  { heading: "Meezan Bank", value: "03090100464603" },
  { heading: "JS Bank", value: "0002717402 (M&M Tax Law Solutions)" },
] as const;

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
