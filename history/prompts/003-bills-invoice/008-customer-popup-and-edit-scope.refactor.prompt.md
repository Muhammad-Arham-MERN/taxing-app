---
id: 008
title: Customer Popup, Password and Bill Edit Scope
stage: refactor
date: 2026-09-19
surface: agent
model: unspecified
feature: 003-bills-invoice
branch: 003-bills-invoice
user: H.A.R
command: (ad-hoc)
labels: ["bills", "customers", "password", "schema-v3", "edit-scope"]
links:
  spec: specs/003-bills-invoice/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - tax-statements-analysis/src-tauri/src/store/schema.rs
 - tax-statements-analysis/src-tauri/src/store/mod.rs
 - tax-statements-analysis/src-tauri/src/store/customers.rs
 - tax-statements-analysis/src-tauri/src/commands/bills.rs
 - tax-statements-analysis/src-tauri/src/lib.rs
 - tax-statements-analysis/src/domain/types.ts
 - tax-statements-analysis/src/domain/billValidation.ts
 - tax-statements-analysis/src/data/repositories.ts
 - tax-statements-analysis/src/data/tauri.ts
 - tax-statements-analysis/src/data/in-memory.ts
 - tax-statements-analysis/src/components/bills/CustomerDialog.tsx
 - tax-statements-analysis/src/components/bills/BillsTable.tsx
 - tax-statements-analysis/src/components/bills/ViewBillsTab.tsx
 - tax-statements-analysis/src/components/bills/EditBillDialog.tsx
 - tax-statements-analysis/src/components/bills/CreateBillForm.tsx
 - tax-statements-analysis/src/components/bills/BillTextField.tsx
 - specs/003-bills-invoice/spec.md
 - specs/003-bills-invoice/data-model.md
 - specs/003-bills-invoice/contracts/tauri-commands.md
 - specs/003-bills-invoice/contracts/bill-repository.md
tests:
 - npm test — 91 passed (4 pre-existing StatementsTable failures unchanged)
 - npm run build (tsc + vite) — clean
 - cargo check — clean
---

## Prompt

also one more thing is needed, when View Bills field is opened all the items are shown it gives Edit option with option to edit everything, what we need to do is to remove from this all the "Customer Related Fields", which includes Customer address, person, details, NTN, number, etc

And then create a popup on clicking the name of a customer in View Bills Table to open a popup with all those 5 fields there with an option to edit, mainly for viewing and editing
also add 6th field to it called "Password" and save that field as well

(also, in the same turn) the regex is currently only added to jazzcash also add it to easypaisa

## Response snapshot

1. **Edit Bill no longer edits the customer's own details.** `EditBillDialog` renders only the customer's **name**; address, contact person, contact number, email, NTN and password were removed. Their values still travel with the update (they remain in the form's default values), so saving an edit never wipes them; switching the name to a customer billed before pulls that customer's saved details across, and a brand-new name starts them empty.
2. **Customer popup.** A new `CustomerDialog` opens when the customer's name is clicked in the View Bills list, showing the six fields for viewing and editing and saving through a new `update_customer` command / `CustomerRepository.update`. It writes only the customer record, never a bill.
3. **Password field.** Added to the `customers` table (schema v2 → v3, additive migration guarded by a `PRAGMA table_info` check), to the `Customer` type/serde, to the store's upsert/list/get, to the seam (Tauri + in-memory), and to the Create Bill "Customer Details" section so it is captured and auto-filled with the customer's other details.
4. **Easypaisa +92 rule.** `billValidation.ts` now uses one shared wallet rule for JazzCash and Easypaisa; the Easypaisa placeholder matches JazzCash.

Spec updated (Clarifications 2026-09-19, FR-008, FR-047, FR-070, FR-071, Customer entity); `data-model.md` (schema v3, migration, Customer type/attributes) and both contracts updated.

## Outcome

- ✅ Impact: a bill's edit is scoped to the bill; customer details have their own popup and a password; both wallet numbers validate the same way.
- 🧪 Tests: 91 passed (up from 90); 4 pre-existing StatementsTable failures unchanged; tsc + vite build clean; cargo check clean.
- 📁 Files: 5 Rust, 11 frontend, 4 spec/design docs.
- 🔁 Next prompts: re-release (0.1.2 after 0.1.1 ships) to deliver these changes.
- 🧠 Reflection: removing the detail fields from the edit form risked silently nulling the stored customer details on save, since the update upserts the customer by name; keeping them in the form's default values and merging on a name change avoids that.

## Evaluation notes (flywheel)

- Failure modes observed: the first wallet test timed out under the 5s default (typing through an onChange-validated form); given a 30s budget.
- Graders run and results (PASS/FAIL): Vitest 91/95 PASS (4 pre-existing); tsc + vite PASS; cargo check PASS.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): add a Vitest case covering the customer popup's save path.
