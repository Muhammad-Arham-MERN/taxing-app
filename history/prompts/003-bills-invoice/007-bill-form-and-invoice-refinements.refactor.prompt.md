---
id: 007
title: Bill Form and Invoice Refinements
stage: refactor
date: 2026-09-19
surface: agent
model: unspecified
feature: 003-bills-invoice
branch: 003-bills-invoice
user: H.A.R
command: (ad-hoc)
labels: ["bills", "invoice-pdf", "customer-autofill", "payment-details", "amount-in-words"]
links:
  spec: specs/003-bills-invoice/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - tax-statements-analysis/src/lib/amountInWords.ts
 - tax-statements-analysis/src/lib/amountInWords.test.ts
 - tax-statements-analysis/src/components/bills/BillInvoiceDocument.tsx
 - tax-statements-analysis/src/components/bills/CreateBillForm.tsx
 - tax-statements-analysis/src/components/bills/CreateBillForm.test.tsx
 - tax-statements-analysis/src/components/bills/EditBillDialog.tsx
 - tax-statements-analysis/src/components/bills/BillTextField.tsx
 - specs/003-bills-invoice/spec.md
 - specs/003-bills-invoice/research.md
tests:
 - npm test — 90 passed (4 pre-existing StatementsTable failures unchanged)
 - npm run build (tsc + vite) — clean
---

## Prompt

- currently only customer name are stored in Create bills section i want it so that customer details is stored as well for automatic input
- Also when creating the bill, it puts Jazzcash, easypaisa and account holder name in customer details, in the create bill tab, add another section called "Payment Details" that consists of these 3 categories
- Furthermore, the pdf structure has changed a bit, now put the "Amount in words" below table on the left side, and put here "For and on behalf of M&M Tax Law Solutions" and below it a large gap with a line on left side (with no markings of what this line is for) and a line on its right side (keep lines subtle) with a marking "Customer Acknowledgement"
- Also we need to change the amount in words scheme to english not urdu lakh crores

(second message) also one small thing, those points of optional fields that are not added in final pdf are shown as "None" in pdf, they should be called "N/A"

## Response snapshot

1. **Customer details reused.** `CreateBillForm` now loads the remembered customers, offers their names in a `<datalist>` on Customer Name, and — when the typed name matches a stored customer exactly — fills Address, Contact Person, Contact Number, Email and NTN automatically (still editable). `BillTextField` gained an optional `listId`.
2. **Payment Details section.** JazzCash Number, Easypaisa Number and Account Holder Name moved out of the customer block into their own "Payment Details" section; the customer's own fields now sit under "Customer Details". Applied to the Create form and mirrored in `EditBillDialog`.
3. **Invoice layout.** The table is now Item Number / Details / Amount(s) / Total; the amount in words moved below the table on the left; below it "For & On Behalf of M&M Tax Law Solutions" with a large gap, a subtle unlabelled line on the left, and a subtle line on the right labelled "Customer Acknowledgement".
4. **English numbering.** `amountInWordsPkr` now uses hundred/thousand/million/billion instead of lakh/crore; tests updated (a billion case added).
5. **"N/A" on the invoice.** Optional customer details not provided now read "N/A" on the invoice only; `formatOptional` ("None") is untouched everywhere else.

Spec updated: a `### Session 2026-09-19` clarifications block, and FR-009, FR-018, FR-030, FR-031, FR-032, FR-067. `research.md` R9 updated to record the numbering change.

## Outcome

- ✅ Impact: the bill form remembers and reuses customer details, payment fields are grouped, the invoice reflects the new layout, and amounts read in English.
- 🧪 Tests: 90 passed (up from 87); 4 pre-existing StatementsTable failures unchanged; build clean.
- 📁 Files: amountInWords(+test), BillInvoiceDocument, CreateBillForm(+test), EditBillDialog, BillTextField, spec.md, research.md.
- 🔁 Next prompts: visual check of a generated invoice; then re-release (0.1.1) to ship these changes.
- 🧠 Reflection: the customer-memory gap was an implementation gap, not a spec gap — FR-066/FR-067 already required it; FR-067 was sharpened to say the filling is automatic.

## Evaluation notes (flywheel)

- Failure modes observed: none new.
- Graders run and results (PASS/FAIL): Vitest 90/94 PASS (4 pre-existing); tsc + vite build PASS.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): add a Vitest case asserting the invoice prints "N/A" for an unfilled optional field.
