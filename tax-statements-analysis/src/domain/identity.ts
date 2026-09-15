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

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
