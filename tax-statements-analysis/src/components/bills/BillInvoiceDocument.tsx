// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
/**
 * The invoice as a PDF document (FR-027–FR-033).
 *
 * The application's green colour scheme, its logo and name, rounded elements
 * and a legible typeface; a typical bill fits one page and a longer one flows
 * onto further pages without losing anything (spec Clarifications, 2026-09-18).
 * The footer is fixed, so the bank and wallet details appear on every page.
 */
import { Document, Page, Path, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import { BANK_DETAILS, COMPANY_FULL_NAME, HEADER_IDENTITY } from "@/domain/identity";
import type { Bill } from "@/domain/types";
import { formatPkr } from "@/lib/format";
import { amountInWordsPkr } from "@/lib/amountInWords";

const GREEN = "#38a800";
const GREEN_DARK = "#2b7a00";
const GREEN_TINT = "#eef8e6";
const INK = "#243b2b";
const MUTED = "#5b6b60";

/** The header's scales mark, redrawn as vector paths so the PDF needs no image. */
const LOGO_PATHS = [
  "M12 4v15",
  "M8.5 20.5h7",
  "M5 6.5h14",
  "M5 6.5l-2.4 5.2a2.4 2.4 0 0 0 4.8 0L5 6.5",
  "M19 6.5l-2.4 5.2a2.4 2.4 0 0 0 4.8 0L19 6.5",
];

const styles = StyleSheet.create({
  page: {
    padding: 36,
    paddingBottom: 120,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: INK,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: 2,
    borderBottomColor: GREEN,
    paddingBottom: 10,
  },
  brandName: { fontSize: 15, fontWeight: 700, color: GREEN_DARK },
  brandLine: { fontSize: 8.5, color: MUTED },
  title: {
    marginTop: 14,
    textAlign: "center",
    fontSize: 15,
    fontWeight: 700,
    color: GREEN_DARK,
    letterSpacing: 2,
  },
  customerBlock: {
    marginTop: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 24,
  },
  customerFields: { width: "62%", gap: 5 },
  field: { gap: 1 },
  label: { fontSize: 7.5, color: MUTED, textTransform: "uppercase", letterSpacing: 0.6 },
  value: { fontSize: 10 },
  invoiceFacts: { width: "34%", gap: 5, alignItems: "flex-end" },
  invoiceNo: { fontSize: 13, fontWeight: 700, color: GREEN_DARK },
  factValue: { fontSize: 10 },
  table: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: GREEN,
    borderRadius: 6,
    overflow: "hidden",
  },
  headRow: {
    flexDirection: "row",
    backgroundColor: GREEN,
    color: "#ffffff",
    fontWeight: 700,
    fontSize: 8.5,
  },
  headCell: { padding: 6 },
  row: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#cfe6c2" },
  cell: { padding: 6, fontSize: 9.5 },
  itemNo: { width: 60 },
  details: { width: 213 },
  amount: { width: 110, textAlign: "right" },
  total: { width: 140, textAlign: "right" },
  totalRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: GREEN,
    backgroundColor: GREEN_TINT,
    fontWeight: 700,
  },
  // Below the table: the amount in words on the left, then the practitioner's
  // signature line (unlabelled) beside the customer's acknowledgement line.
  belowTable: { marginTop: 16 },
  wordsBlock: { gap: 2 },
  wordsValue: { fontSize: 10 },
  signatureRow: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  signatureColumn: { width: "45%" },
  signatureName: { fontSize: 10, fontWeight: 700 },
  signatureNameSpacer: { height: 13 },
  signatureGap: { height: 96 },
  signatureLine: { borderTopWidth: 1, borderTopColor: "#c2d3b6" },
  signatureHint: { marginTop: 3, fontSize: 7.5, color: MUTED, textAlign: "center" },
  /**
   * A structural four-column footer: the two bank columns and the two wallet
   * columns line up, but no cell borders are drawn, so it does not read as a
   * table (client change, 2026-09-19).
   */
  footer: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    borderTopWidth: 1,
    borderTopColor: "#c2d3b6",
    paddingTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  footerColumn: { flexGrow: 1, flexBasis: 0, gap: 3 },
  footerHeading: { fontSize: 10.5, fontWeight: 700, color: GREEN_DARK },
  /** The account holder's name, written beside each wallet column. */
  footerAccount: { fontSize: 9.5, color: MUTED },
  footerValue: { fontSize: 10.5, fontWeight: 700, color: INK },
});

/** An optional customer detail that was never provided reads "N/A" on the invoice. */
function invoiceValue(value: string | null): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "N/A";
}

function CustomerField({ label, value }: { label: string; value: string | null }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{invoiceValue(value)}</Text>
    </View>
  );
}

function Logo() {
  return (
    <Svg viewBox="0 0 24 24" style={{ width: 26, height: 26 }}>
      {LOGO_PATHS.map((path) => (
        <Path
          key={path}
          d={path}
          fill="none"
          stroke={GREEN}
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </Svg>
  );
}

export interface BillInvoiceDocumentProps {
  bill: Bill;
}

export function BillInvoiceDocument({ bill }: BillInvoiceDocumentProps) {
  const words = amountInWordsPkr(Math.round(bill.total * 100));

  return (
    <Document
      title={`Invoice ${bill.invoiceNo}`}
      author={COMPANY_FULL_NAME}
      subject={`Bill/Invoice ${bill.invoiceNo}`}
    >
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.header}>
          <Logo />
          <View>
            <Text style={styles.brandName}>{HEADER_IDENTITY.brandName}</Text>
            <Text style={styles.brandLine}>{HEADER_IDENTITY.location}</Text>
            <Text style={styles.brandLine}>{HEADER_IDENTITY.contacts.join("  ·  ")}</Text>
          </View>
        </View>

        <Text style={styles.title}>Bill / Invoice</Text>

        <View style={styles.customerBlock}>
          <View style={styles.customerFields}>
            <View style={styles.field}>
              <Text style={styles.label}>Customer Name</Text>
              <Text style={[styles.value, { fontWeight: 700 }]}>{bill.customer.name}</Text>
            </View>
            <CustomerField label="Address" value={bill.customer.address} />
            <CustomerField label="Contact Person" value={bill.customer.contactPerson} />
            <CustomerField label="Contact Number" value={bill.customer.contactNumber} />
            <CustomerField label="Email" value={bill.customer.email} />
            <CustomerField label="NTN Number" value={bill.customer.ntn} />
          </View>

          <View style={styles.invoiceFacts}>
            <View style={styles.field}>
              <Text style={styles.label}>Invoice Number</Text>
              <Text style={styles.invoiceNo}>{bill.invoiceNo}</Text>
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Date</Text>
              <Text style={styles.factValue}>{bill.date}</Text>
            </View>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.headRow}>
            <Text style={[styles.headCell, styles.itemNo]}>Item Number</Text>
            <Text style={[styles.headCell, styles.details]}>Details</Text>
            <Text style={[styles.headCell, styles.amount]}>Amount(s)</Text>
            <Text style={[styles.headCell, styles.total]}>Total</Text>
          </View>

          {bill.items.map((item) => (
            <View style={styles.row} key={item.id} wrap={false}>
              <Text style={[styles.cell, styles.itemNo]}>{item.position}</Text>
              <Text style={[styles.cell, styles.details]}>{item.details}</Text>
              <Text style={[styles.cell, styles.amount]}>
                {formatPkr(item.amount)}
              </Text>
              <Text style={[styles.cell, styles.total]} />
            </View>
          ))}

          <View style={styles.totalRow}>
            <Text style={[styles.cell, styles.itemNo]} />
            <Text style={[styles.cell, styles.details]}>Total</Text>
            <Text style={[styles.cell, styles.amount]}>
              {formatPkr(bill.total)}
            </Text>
            <Text style={[styles.cell, styles.total]}>
              {formatPkr(bill.total)}
            </Text>
          </View>
        </View>

        <View style={styles.belowTable}>
          <View style={styles.wordsBlock}>
            <Text style={styles.label}>Amount in Words</Text>
            <Text style={styles.wordsValue}>{words}</Text>
          </View>

          <View style={styles.signatureRow}>
            <View style={styles.signatureColumn}>
              <Text style={styles.signatureName}>
                For &amp; On Behalf of {COMPANY_FULL_NAME}
              </Text>
              <View style={styles.signatureGap} />
              {/* Left line carries no caption: it is signed by hand. */}
              <View style={styles.signatureLine} />
            </View>

            <View style={styles.signatureColumn}>
              <View style={styles.signatureNameSpacer} />
              <View style={styles.signatureGap} />
              <View style={styles.signatureLine} />
              <Text style={styles.signatureHint}>Customer Acknowledgement</Text>
            </View>
          </View>
        </View>

        {/* Structural columns, no visible table: Meezan / JS Bank / Easypaisa / JazzCash. */}
        <View style={styles.footer} fixed>
          {BANK_DETAILS.map((bank) => (
            <View style={styles.footerColumn} key={bank.heading}>
              <Text style={styles.footerHeading}>{bank.heading}</Text>
              <Text style={styles.footerValue}>{bank.value}</Text>
            </View>
          ))}

          <View style={styles.footerColumn}>
            <Text style={styles.footerHeading}>Easypaisa</Text>
            <Text style={styles.footerAccount}>{bill.accountHolder}</Text>
            {bill.easypaisaNumbers.map((number) => (
              <Text style={styles.footerValue} key={number}>
                {number}
              </Text>
            ))}
          </View>

          <View style={styles.footerColumn}>
            <Text style={styles.footerHeading}>JazzCash</Text>
            <Text style={styles.footerAccount}>{bill.accountHolder}</Text>
            {bill.jazzcashNumbers.map((number) => (
              <Text style={styles.footerValue} key={number}>
                {number}
              </Text>
            ))}
          </View>
        </View>
      </Page>
    </Document>
  );
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
