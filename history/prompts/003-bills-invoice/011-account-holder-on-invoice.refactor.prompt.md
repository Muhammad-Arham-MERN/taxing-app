---
id: 011
title: Account Holder Name Beside Wallet Columns
stage: refactor
date: 2026-09-19
surface: agent
model: unspecified
feature: 003-bills-invoice
branch: 003-bills-invoice
user: H.A.R
command: (ad-hoc)
labels: ["bills", "invoice-pdf", "footer"]
links:
  spec: specs/003-bills-invoice/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - tax-statements-analysis/src/components/bills/BillInvoiceDocument.tsx
 - specs/003-bills-invoice/spec.md
tests:
 - not run (frontend build/test denied earlier in the session)
---

## Prompt

also write beside jazzcash and easy paisa account holder name

## Response snapshot

The bill's account holder name was collected but never printed. It is now shown in the invoice footer beside the **Easypaisa** and **JazzCash** columns — under each heading, above that column's numbers, in a smaller muted line so it does not compete with the bold numbers. `footerAccount` style added; spec FR-033 and a clarification entry (2026-09-19) updated.

Interpretation noted to the client: "beside jazzcash and easy paisa" was read as the **invoice footer** (the form already places the Account Holder Name field in the same Payment Details grid as the two wallets). Offered to move/duplicate it in the form instead if that was the intent.

## Outcome

- ✅ Impact: the invoice now carries complete wallet details — holder name plus every number.
- 🧪 Tests: not run.
- 📁 Files: BillInvoiceDocument.tsx, spec.md.
- 🔁 Next prompts: run the build/tests and regenerate an invoice to eyeball the footer.
- 🧠 Reflection: the account holder name had no reader at all on the PDF, so the change needed a new line in the footer rather than a rearrangement.

## Evaluation notes (flywheel)

- Failure modes observed: none.
- Graders run and results (PASS/FAIL): not run.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): run the frontend suite.
