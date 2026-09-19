// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
/**
 * Rendering a bill's invoice on demand (FR-027, FR-036).
 *
 * The invoice is a pure rendering of the bill's current values and is never
 * stored: every open or download renders it afresh, so it can never go stale
 * against the bill it belongs to (spec Clarifications, 2026-09-18). The bytes
 * are handed to the backend, which writes them out and opens or saves them.
 */
import { createElement, type ReactElement } from "react";
import { pdf, type DocumentProps } from "@react-pdf/renderer";
import { BillInvoiceDocument } from "@/components/bills/BillInvoiceDocument";
import type { Bill } from "@/domain/types";

/** The name an invoice travels under, e.g. "INV-0001.pdf". */
export function billFileName(invoiceNo: string): string {
  return `${invoiceNo}.pdf`;
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/** Render the bill's invoice to PDF bytes, ready to open or save. */
export async function renderBillInvoice(bill: Bill): Promise<Uint8Array> {
  // `pdf()` is typed for a `<Document>` element; our component renders one.
  const element = createElement(BillInvoiceDocument, {
    bill,
  }) as ReactElement<DocumentProps>;
  const blob = await pdf(element).toBlob();
  return new Uint8Array(await blob.arrayBuffer());
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
