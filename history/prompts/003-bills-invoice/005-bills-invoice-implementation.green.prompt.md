---
id: 005
title: Bills and Invoices Implementation
stage: green
date: 2026-09-19
surface: agent
model: unspecified
feature: 003-bills-invoice
branch: 003-bills-invoice
user: H.A.R
command: /sp.implement
labels: ["implementation", "module-3", "bills", "invoices", "pdf", "sqlite-migration", "react-pdf"]
links:
  spec: specs/003-bills-invoice/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - tax-statements-analysis/src-tauri/src/store/schema.rs
 - tax-statements-analysis/src-tauri/src/store/mod.rs
 - tax-statements-analysis/src-tauri/src/store/customers.rs
 - tax-statements-analysis/src-tauri/src/store/bills.rs
 - tax-statements-analysis/src-tauri/src/store/carry.rs
 - tax-statements-analysis/src-tauri/src/commands/bills.rs
 - tax-statements-analysis/src-tauri/src/commands/error.rs
 - tax-statements-analysis/src-tauri/src/commands/mod.rs
 - tax-statements-analysis/src-tauri/src/lib.rs
 - tax-statements-analysis/src/domain/types.ts
 - tax-statements-analysis/src/domain/identity.ts
 - tax-statements-analysis/src/domain/billValidation.ts
 - tax-statements-analysis/src/lib/format.ts
 - tax-statements-analysis/src/lib/amountInWords.ts
 - tax-statements-analysis/src/lib/billInvoice.ts
 - tax-statements-analysis/src/data/repositories.ts
 - tax-statements-analysis/src/data/tauri.ts
 - tax-statements-analysis/src/data/in-memory.ts
 - tax-statements-analysis/src/data/repositories.test.ts
 - tax-statements-analysis/src/components/providers/DataProvider.tsx
 - tax-statements-analysis/src/components/bills/BillInvoiceDocument.tsx
 - tax-statements-analysis/src/components/bills/BillItemsEditor.tsx
 - tax-statements-analysis/src/components/bills/BillTextField.tsx
 - tax-statements-analysis/src/components/bills/CreateBillForm.tsx
 - tax-statements-analysis/src/components/bills/EditBillDialog.tsx
 - tax-statements-analysis/src/components/bills/BillsTable.tsx
 - tax-statements-analysis/src/components/bills/BillFilters.tsx
 - tax-statements-analysis/src/components/bills/CustomerFilter.tsx
 - tax-statements-analysis/src/components/bills/ViewBillsTab.tsx
 - tax-statements-analysis/src/App.tsx
 - tax-statements-analysis/package.json
 - specs/003-bills-invoice/tasks.md
tests:
 - npm test (Vitest) — 87 passed; 4 pre-existing StatementsTable failures left as instructed
 - npm run build (tsc + vite) — clean
 - cargo check — clean
---

## Prompt

/sp.implement

## Response snapshot

Implemented Module 3 across the backend and frontend. **Rust**: schema v2 (`customers`, `bills`, `bill_items` + `next_invoice_no` counter) with a version-aware, additive v1→v2 migration on open; `store/customers.rs` (NOCASE upsert/list); `store/bills.rs` (invoice-number allocation inside the create transaction, SQL-aggregated list with optional date/customer filters, get/update/delete, wholesale item replace); `store/carry.rs` extended to move customers → bills → items and advance the counter; `commands/bills.rs` with 8 commands (raw-body invoice open/save via `x-bill-invoice-meta`); `ErrorKind::UnknownBill`; all registered in `lib.rs`. **Frontend**: bill domain types/constants, `formatPkr`, `amountInWordsPkr`, zod `billValidation`, the react-pdf `BillInvoiceDocument`, `renderBillInvoice`, `BillItemsEditor`, `CreateBillForm`, `BillFilters`/`CustomerFilter`/`BillsTable`/`EditBillDialog`/`ViewBillsTab`, the repository seam + Tauri/in-memory implementations + DataProvider, and the four-tab navigation partition. Tests: `amountInWords.test.ts`, `CreateBillForm.test.tsx`, `BillsTable.test.tsx`, and contract cases B-01…B-19 added to `repositories.test.ts`. `npm run build` and `cargo check` are clean; 87 Vitest tests pass.

## Outcome

- ✅ Impact: Module 3 (Bills & Invoices) is implemented end to end; 44 of 48 tasks complete.
- 🧪 Tests: Vitest 87 passed (4 pre-existing failures in `StatementsTable.test.tsx` left untouched per the client); tsc/vite build clean; cargo check clean.
- 📁 Files: 9 Rust files and 23 frontend files created or changed (see front matter).
- 🔁 Next prompts: run the packaged application to complete T045–T048 (migration, carry-across, quickstart walkthrough, list performance).
- 🧠 Reflection: The two consequential decisions held up in code — invoice numbering allocated inside the create transaction, and the location-change carry extended to customers/bills so a move cannot drop the billing record. The environment's `NODE_ENV=production` silently omitted devDependencies and had to be overridden to run the suite; worth remembering for this machine.

## Evaluation notes (flywheel)

- Failure modes observed: (1) npm omitted devDependencies under `NODE_ENV=production`, breaking `vitest` until reinstalled with `--include=dev`; (2) `pdf()` required a `ReactElement<DocumentProps>` cast; (3) 4 pre-existing StatementsTable test failures, unrelated to Module 3.
- Graders run and results (PASS/FAIL): build PASS; cargo check PASS; Vitest 87/91 PASS (4 pre-existing FAIL, left as instructed).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): add a DataProvider wrapper to `StatementsTable.test.tsx` (a one-line-per-render fix) when the client is ready, so the suite is fully green.
