---
id: 009
title: Multi-Wallet Numbers, Nav Groups and Payment Footer
stage: refactor
date: 2026-09-19
surface: agent
model: unspecified
feature: 003-bills-invoice
branch: 003-bills-invoice
user: H.A.R
command: (ad-hoc)
labels: ["bills", "invoice-pdf", "wallets", "schema-v4", "navigation"]
links:
  spec: specs/003-bills-invoice/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - tax-statements-analysis/src-tauri/src/store/schema.rs
 - tax-statements-analysis/src-tauri/src/store/mod.rs
 - tax-statements-analysis/src-tauri/src/store/bills.rs
 - tax-statements-analysis/src-tauri/src/store/carry.rs
 - tax-statements-analysis/src-tauri/src/commands/bills.rs
 - tax-statements-analysis/src/domain/types.ts
 - tax-statements-analysis/src/domain/identity.ts
 - tax-statements-analysis/src/domain/billValidation.ts
 - tax-statements-analysis/src/data/in-memory.ts
 - tax-statements-analysis/src/components/bills/WalletNumbersEditor.tsx
 - tax-statements-analysis/src/components/bills/CreateBillForm.tsx
 - tax-statements-analysis/src/components/bills/EditBillDialog.tsx
 - tax-statements-analysis/src/components/bills/BillInvoiceDocument.tsx
 - tax-statements-analysis/src/components/bills/BillTextField.tsx
 - tax-statements-analysis/src/App.tsx
 - specs/003-bills-invoice/spec.md
 - specs/003-bills-invoice/data-model.md
tests:
 - cargo check — clean
 - frontend build/tests NOT run (the command was denied this turn)
---

## Prompt

make a few more changes

1. Right now the tabs are Create Bill, View Bill, Create Statement, View Statements, you should change the ui a bit, such that the the line difference should be changed to a gap, and should contain 2 section of "Create" and "View" separately for Bils and Statements, on top of these tabs in same container should be written Statements, and Billss separately, to keep UI clean
2. change the pdf ui a bit too, give some more space for signatures
3. Add an option to Jazzcash and Easypaisa with a plus icon to add more phone numbers
  - in the frontend the digital banks and banks view should be in same footer but design should be changed a little
  - there should be non visible, but a structural table there, that should not look like a table, with a column "Meezan Bank", "JS Bank", "Easypaisa" and "Jazzcash"
  - The meezan bank number should be below this meezan bank table column item, js bank number below it, and multiple easy paisa and jazzcash numbers below it as per the numbers as many user wants
  - The text should be nice font, big so it is good and readable, and bold for visibility

(also) always keep +923225739614 as default placeholder for jazzcash and +923125739614 for easy paisa

## Response snapshot

1. **Navigation regrouped.** `App.tsx` now renders two labelled groups inside the same container — "Statements" and "Bills" — each containing its own "Create"/"View" `TabsList`, separated by a gap rather than the old dividing rule.
2. **Wallet numbers become lists.** Schema v3 → v4 adds `bill_wallets (bill_id, kind, position, number)`, mirroring `bill_items`; the migration copies each bill's legacy single `jazzcash`/`easypaisa` value into it. `Bill`/`NewBill`/`BillUpdate` now carry `jazzcashNumbers[]`/`easypaisaNumbers[]`; the store inserts, loads, replaces and (in the carry-across) copies them; the command validates each given number as +92. A new `WalletNumbersEditor` gives each wallet a "+" to add as many numbers as wanted.
3. **Invoice footer rebuilt** as four aligned structural columns (Meezan Bank, JS Bank, Easypaisa, JazzCash) with no table borders, bold larger text; the signature gap grew from 54 to 96 and the page's bottom padding from 64 to 120.
4. **Default placeholders** `+923225739614` (JazzCash) and `+923125739614` (Easypaisa) added to `identity.ts` as `WALLET_PLACEHOLDERS`, used both as the input placeholder and in the validation message (frontend and backend).

Spec updated (Clarifications 2026-09-19 ×5, FR-001/FR-002/FR-003, FR-009, FR-033) and `data-model.md` (schema v4, `bill_wallets`, migration, Bill type).

## Outcome

- ✅ Impact: the nav reads as two clean groups; a bill can carry any number of wallet numbers; the invoice footer presents banks and wallets as aligned columns with more signing room.
- 🧪 Tests: `cargo check` clean. **The frontend build and test run were not performed** — the `npm run build` command was denied by the user this turn, so the TypeScript changes are unverified.
- 📁 Files: 5 Rust, 10 frontend, 2 spec/design docs.
- 🔁 Next prompts: run `npm run build` and `npm test` to verify the TypeScript changes; then re-release.
- 🧠 Reflection: moving the wallet numbers to their own table (rather than a delimited column) keeps them ordered and lets the carry-across copy them like line items, at the cost of a real v4 migration that must copy the legacy values.

## Evaluation notes (flywheel)

- Failure modes observed: the frontend build was denied mid-turn, so the changes could not be compiled or tested; flagged rather than assumed to work.
- Graders run and results (PASS/FAIL): cargo check PASS; frontend build/test NOT RUN.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): run the frontend build and tests, then a generated invoice to eyeball the four-column footer.
