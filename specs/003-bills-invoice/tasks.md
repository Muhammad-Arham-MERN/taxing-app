---
description: "Task list for Customer Bills and Invoices (Module 3)"
---

# Tasks: Customer Bills and Invoices (Module 3)

**Input**: Design documents from `/specs/003-bills-invoice/`
**Prerequisites**: [plan.md](./plan.md) (required), [spec.md](./spec.md) (required), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: The plan explicitly calls for **frontend Vitest** coverage (amount-in-words, the bill form, the bills table and the in-memory repository twin); those test tasks are included. Per the developer's standing direction there are **no automated backend tests** — the Rust command surface is verified end to end via `quickstart.md`.

**Constitution (non-negotiable, every new source file)**: open with `بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ`, close with `وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ`; put `وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ` at the crux logic (invoice-number allocation, the bill write transaction, the customer upsert, the invoice renderer, amount-in-words, the carry-across additions).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: `[US1]`…`[US4]` — maps to the user stories in spec.md
- Every task names its exact file path

## Path Conventions

Single desktop app at `tax-statements-analysis/`; frontend under `tax-statements-analysis/src/`, backend under `tax-statements-analysis/src-tauri/src/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: The one new dependency and the shared domain/format scaffolding every story builds on.

- [X] T001 Add `@react-pdf/renderer` to `tax-statements-analysis/package.json` and run `npm install` in `tax-statements-analysis/`
- [X] T002 [P] Extend `tax-statements-analysis/src/domain/types.ts` with `Customer`, `BillItem`, `Bill`, `NewBillItem`, `NewBill`, `BillUpdate`, `BillFilter`, `BillSummary` per [data-model.md](./data-model.md) §3
- [X] T003 [P] Add the company full name, signature-line text and invoice footer bank constants (Meezan, JS Bank) to `tax-statements-analysis/src/domain/identity.ts`
- [X] T004 [P] Add `formatPkr(amount)` (PKR label + comma thousands separators) to `tax-statements-analysis/src/lib/format.ts`, leaving the existing `formatAmount` (₨) untouched

**Checkpoint**: Dependency installed; shared types, constants and the bill amount formatter exist.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, store, command surface, repository seam and navigation that every story depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T005 [P] Add the version-2 DDL (`customers`, `bills`, `bill_items`, their indexes) and the `next_invoice_no` seed to `tax-statements-analysis/src-tauri/src/store/schema.rs` (data-model.md §1.2)
- [X] T006 Raise `SCHEMA_VERSION` to 2, make verification version-aware, and run the additive v1→v2 migration on read-write open in `tax-statements-analysis/src-tauri/src/store/mod.rs` (data-model.md §1.4)
- [X] T007 [P] Create `tax-statements-analysis/src-tauri/src/store/customers.rs` with `upsert_within(conn, customer)` (name `COLLATE NOCASE`, `ON CONFLICT DO UPDATE`) and `list(conn)`
- [X] T008 [P] Create `tax-statements-analysis/src-tauri/src/store/bills.rs`: `create` (invoice-number allocation from `next_invoice_no` + customer upsert + items, one transaction), `list` (`GROUP_CONCAT`/`SUM` + optional date/customer predicates, newest first), `get`, `update` (wholesale item replace, keeps invoice number), `delete`
- [X] T009 Add `ErrorKind::UnknownBill` and its `StoreError` → `CommandError` mapping in `tax-statements-analysis/src-tauri/src/commands/error.rs`
- [X] T010 Create `tax-statements-analysis/src-tauri/src/commands/bills.rs` with `create_bill`, `list_bills`, `get_bill`, `update_bill`, `delete_bill`, `list_customers`, and the raw-body `open_bill_invoice` / `save_bill_invoice_copy` (header `x-bill-invoice-meta`) — see [contracts/tauri-commands.md](./contracts/tauri-commands.md)
- [X] T011 [P] Extend `tax-statements-analysis/src-tauri/src/store/carry.rs` to copy customers → bills → bill_items and advance the invoice counter, and widen the empty-store check to include bills (data-model.md §5)
- [X] T012 Register `commands::bills` in `tax-statements-analysis/src-tauri/src/commands/mod.rs` and append the eight commands to `generate_handler!` in `tax-statements-analysis/src-tauri/src/lib.rs`
- [X] T013 [P] Add `BillRepository`, `CustomerRepository` and the bill/invoice error classes to `tax-statements-analysis/src/data/repositories.ts` per [contracts/bill-repository.md](./contracts/bill-repository.md)
- [X] T014 [P] Implement the in-memory plus Tauri twins for the new interfaces in `tax-statements-analysis/src/data/in-memory.ts` and `tax-statements-analysis/src/data/tauri.ts`
- [X] T015 Extend `tax-statements-analysis/src/components/providers/DataProvider.tsx` to inject `bills` and `customers` alongside the existing repositories
- [X] T016 Partition the navigation into a Statements group (Create/View Statements) and a Bills group (Create/View Bills) with a small divider in `tax-statements-analysis/src/App.tsx` (FR-001–FR-004)
- [X] T017 Add `tax-statements-analysis/src/components/bills/` and mount two placeholder bill panels in the Bills group of `src/App.tsx` so later stories fill them in

**Checkpoint**: The store migrates, the new commands answer, the seam is wired, and four tabs render — user stories can begin.

---

## Phase 3: User Story 1 - Create a Bill and Receive Its Invoice PDF (Priority: P1) 🎯 MVP

**Goal**: Compose a bill with one or more line items, see the auto item numbers, total and amount in words, and obtain the green one-page invoice PDF in the default PDF application.

**Independent Test**: Open Create Bill, enter one valid bill with two or more line items, confirm the Create Bill action was unavailable until every required entry was complete, and confirm a correct green invoice is produced with the header, customer block, five-column table, signature line and footer.

### Tests for User Story 1

- [X] T018 [P] [US1] Add `tax-statements-analysis/src/lib/amountInWords.test.ts` covering zero paisa, exact hundred/thousand/lakh/crore boundaries and "Only"
- [X] T019 [P] [US1] Add `tax-statements-analysis/src/components/bills/CreateBillForm.test.tsx` covering required-entry gating, "+" adding and renumbering items, and the live total/words
- [X] T020 [US1] Extend `tax-statements-analysis/src/data/repositories.test.ts` with B-01, B-02, B-04 (create, sequential invoice numbers, invalid rejection) — tests written first and failing

### Implementation for User Story 1

- [X] T021 [P] [US1] Create `tax-statements-analysis/src/lib/amountInWords.ts` (`amountInWordsPkr`, lakh/crore + paisa, "Only") with the crux marker
- [X] T022 [P] [US1] Create `tax-statements-analysis/src/domain/billValidation.ts` (zod: date, per-item details, per-item amount > 0, customer name required, ≥ 1 item, +92 wallet format) and export the form schema
- [X] T023 [P] [US1] Create `tax-statements-analysis/src/components/bills/BillInvoiceDocument.tsx` — the react-pdf invoice: header + scales logo (SVG path), customer block with invoice number/date beside it, the Item Number/Details/Amount(s)/Total/Amount in Words table, the bold centred signature line, and the bank/wallet footer; lets content flow to further pages when it overflows
- [X] T024 [US1] Create `tax-statements-analysis/src/lib/billInvoice.ts` exporting `renderBillInvoice(bill): Promise<Uint8Array>` and `billFileName(invoiceNo)` (`"INV-0001.pdf"`), with the crux marker
- [X] T025 [P] [US1] Create `tax-statements-analysis/src/components/bills/BillItemsEditor.tsx` — per-item Details/Amount, a "+" to add, a remove control (never the last item), auto item numbers, styled from the existing form components
- [X] T026 [US1] Create `tax-statements-analysis/src/components/bills/CreateBillForm.tsx` — the bill form (date, customer fields, wallet numbers, account holder default "Mumtaz Qureshi", `BillItemsEditor`), live total + amount in words, submit disabled until valid, double-submit guard, on success reset and open the invoice via `renderBillInvoice` + `bills.openInvoice`
- [X] T027 [US1] Render `CreateBillForm` in the Create Bill panel of `tax-statements-analysis/src/App.tsx` and bump the shared refresh key on create

**Checkpoint**: User Story 1 is fully functional and independently demonstrable — the MVP.

---

## Phase 4: User Story 2 - Review and Filter Bills (Priority: P2)

**Goal**: Review stored bills newest-first, filtered by an optional date range and/or a customer, with the list showing Customer Name, Date, Details and Amount.

**Independent Test**: Create bills for two customers across several dates; with no filters every bill appears newest first with the four columns; a date range narrows to that range; a customer narrows to that customer; the two combine; and typing part of a name offers matching customers.

> **Note**: US2 operates on stored bills, so it needs US1's create path (or seeded data) to be demonstrable; it introduces no changes to US1's code.

- [X] T028 [P] [US2] Create `tax-statements-analysis/src/components/bills/CustomerFilter.tsx` — a drop-down of `customers.list()` that also accepts typed text and filters as the practitioner types (FR-065)
- [X] T029 [P] [US2] Create `tax-statements-analysis/src/components/bills/BillFilters.tsx` — an **optional, clearable** From/To pair (reusing the existing Calendar/Popover pattern) plus `CustomerFilter`, emitting a `BillFilter`
- [X] T030 [P] [US2] Create `tax-statements-analysis/src/components/bills/BillsTable.tsx` — columns Customer Name, Date, Details, Amount; newest-first; the empty state; pagination; and a row "Open" action that renders and opens the invoice (`renderBillInvoice` + `bills.openInvoice`)
- [X] T031 [US2] Add `tax-statements-analysis/src/components/bills/BillsTable.test.tsx` covering the four columns, the empty state and pagination
- [X] T032 [US2] Extend `tax-statements-analysis/src/data/repositories.test.ts` with B-05–B-10 (filter combinations, reversed range) and B-16/B-17/B-19 (customer remembered, case-insensitive identity, survives bill deletion)
- [X] T033 [US2] Render the View Bills tab in `tax-statements-analysis/src/App.tsx` — a `ViewBillsTab` using `bills.list(filter)` driven by `BillFilters` and `BillsTable`, re-reading on the shared refresh key
- [X] T034 [US2] Ensure the Customer filter refreshes after a new bill/customer is saved by propagating the shared refresh key into `CustomerFilter`/`ViewBillsTab` in `tax-statements-analysis/src/App.tsx`

**Checkpoint**: Bills can be reviewed and filtered; US1 and US2 both work independently.

---

## Phase 5: User Story 3 - Open, Correct and Re-issue a Bill (Priority: P3)

**Goal**: Open a bill, correct its customer details and line items in place, keep the invoice number, regenerate the invoice, and download it.

**Independent Test**: Create a bill, open it from View Bills, change customer details and items, save, and confirm the same bill (not a new one) holds the new values with the same invoice number and a regenerated invoice, across a restart; download the invoice.

> **Note**: US3 edits stored bills, so it requires US1 (and is reached via US2's list).

- [X] T035 [US3] Create `tax-statements-analysis/src/components/bills/EditBillDialog.tsx` — prefill from `bills.get(id)`, edit customer/wallet/account fields and the line items via `BillItemsEditor`, save with `bills.update`, then regenerate and open the invoice; the save action stays disabled while the bill is invalid (FR-049) and abandoning changes nothing (FR-051)
- [X] T036 [US3] Add the row "Edit" action (opening `EditBillDialog`) and a row "Download invoice" action (`renderBillInvoice` + `bills.saveInvoiceCopy`) to `tax-statements-analysis/src/components/bills/BillsTable.tsx`
- [X] T037 [US3] Extend `tax-statements-analysis/src/data/repositories.test.ts` with B-11–B-13 (get bill with items, in-place update with renumbering, invoice number unchanged)
- [X] T038 [US3] Wire `EditBillDialog` into the View Bills tab in `tax-statements-analysis/src/App.tsx` and refresh the list after a saved edit

**Checkpoint**: Bills can be corrected and their invoices reissued.

---

## Phase 6: User Story 4 - Delete a Bill (Priority: P4)

**Goal**: Delete a bill after confirmation, remove it and its line items, and never reuse its invoice number.

**Independent Test**: Create a bill, delete it from View Bills after confirming, and confirm it disappears from every list, does not return after a restart, leaves statements untouched, and its invoice number is never issued again.

> **Note**: US4 deletes stored bills, so it requires US1 (and is reached via US2's list).

- [X] T039 [US4] Add a row "Delete" action with a confirmation dialog to `tax-statements-analysis/src/components/bills/BillsTable.tsx`, calling `bills.remove(id)` and refreshing the list (FR-053, FR-054)
- [X] T040 [US4] Extend `tax-statements-analysis/src/data/repositories.test.ts` with B-14/B-15 (delete then list; delete survives restart) and B-03 (a new bill never reuses a deleted bill's invoice number)
- [X] T041 [US4] Confirm deleting a bill leaves stored statements and the customer list untouched, and that all of a customer's bills may be deleted while the customer remains offered (FR-054, FR-069)

**Checkpoint**: All four user stories are independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Validation, standards compliance and the end-to-end acceptance pass.

- [X] T042 [P] Verify every new file under `tax-statements-analysis/src/` and `tax-statements-analysis/src-tauri/src/` carries the basmala header, the dua footer and a crux marker on the load-bearing logic (invoice allocation, bill write, customer upsert, invoice renderer, amount-in-words, carry additions)
- [X] T043 Run `npm test` in `tax-statements-analysis/` and fix every failure; confirm all existing Module 1/2 tests still pass
- [X] T044 Run `npm run build` (tsc + vite) in `tax-statements-analysis/` and `cargo check` in `tax-statements-analysis/src-tauri/`, fixing all type and compile errors
- [ ] T045 Verify the v1→v2 migration on a real Module 2 store: it opens, statements are intact, and the bills tables appear with no prompt (`specs/003-bills-invoice/quickstart.md` §4 cross-cutting)
- [ ] T046 Verify carry-across on a storage-location change moves customers, bills and line items and advances the invoice counter, leaving the old store file in place (`specs/003-bills-invoice/quickstart.md` §4 cross-cutting)
- [ ] T047 Walk the full `specs/003-bills-invoice/quickstart.md` acceptance walkthrough for all four stories, including invoice page-overflow, the never-reused invoice number and the side-by-side ₨/PKR amount presentations
- [ ] T048 Performance check via `tax-statements-analysis/src/components/bills/BillsTable.tsx`: with a large seeded set of bills, the View Bills list (with and without filters) renders in under 2 seconds

> **Implementation note (2026-09-19)**: T042 and T044 are complete — every new source file carries the basmala header, dua footer and crux markers; `npm run build` (tsc + vite) is clean and `cargo check` succeeds. T043: `npm test` passes 87 tests; the only failures are 4 **pre-existing** cases in `StatementsTable.test.tsx` (it renders `StatementsTable` without the `DataProvider` the component requires; the file is unmodified from `34bd3b2`), left in place as instructed. **T045–T048 remain open**: they require running the packaged application end to end, which was not available in the implementation environment.
>
> **Environment gotcha**: this shell had `NODE_ENV=production`, which makes npm omit devDependencies. Install with `$env:NODE_ENV='development'; npm ci --include=dev`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup; **blocks all user stories**.
- **User Stories (Phases 3–6)**: All depend on Foundational. US1 is the priority and the first value; US2, US3 and US4 each operate on stored bills, so in practice they need US1's create path (or seeded data) to be demonstrable.
- **Polish (Phase 7)**: Depends on all targeted stories being complete.

### User Story Dependencies

- **US1 (P1)**: After Foundational — no dependency on other stories. **MVP.**
- **US2 (P2)**: After Foundational — reads bills, so it needs US1's data to be exercised end to end; introduces no changes to US1 code.
- **US3 (P3)**: After Foundational — edits bills reached through US2's list; depends on US1 data.
- **US4 (P4)**: After Foundational — deletes bills reached through US2's list; depends on US1 data.

### Within Each User Story

- Tests are written first and must fail before the implementation task they cover.
- Validators/utilities before forms; the invoice document before the renderer helper; the renderer before the form that opens it.
- Core implementation before wiring into `App.tsx`.

### Parallel Opportunities

- **Setup**: T002, T003, T004 all touch different files — run together.
- **Foundational**: T005, T007, T008, T011, T013, T014 touch different files — runnable in parallel; T006/T009/T010/T012/T015/T016 serialise behind them.
- **US1**: T018/T019 tests and T021/T022/T023/T025 are separate files — run together; T024 → T026 then T027.
- **US2**: T028, T029, T030 are separate files — run together.
- **US3/US4**: single-file edits to `BillsTable.tsx`, so serialise.

---

## Parallel Example: User Story 1

```bash
# Independent files that can be built at the same time:
Task: "T021 amountInWords.ts"
Task: "T022 billValidation.ts"
Task: "T023 BillInvoiceDocument.tsx"
Task: "T025 BillItemsEditor.tsx"
Task: "T018 amountInWords.test.ts"
Task: "T019 CreateBillForm.test.tsx"
```

## Parallel Example: Foundational

```bash
Task: "T005 schema.rs (v2 DDL)"
Task: "T007 store/customers.rs"
Task: "T008 store/bills.rs"
Task: "T011 store/carry.rs (extend)"
Task: "T013 repositories.ts (seam interfaces)"
Task: "T014 in-memory.ts + tauri.ts (new twins)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup) and Phase 2 (Foundational).
2. Complete Phase 3 (US1).
3. **STOP and VALIDATE**: create a multi-item bill and confirm the green invoice opens correctly (quickstart.md Story 1).
4. This alone turns the application into a billing tool.

### Incremental Delivery

1. Setup + Foundational → foundation ready (store migrates, commands answer, four tabs render).
2. US1 → Composing and invoicing works → demo (MVP).
3. US2 → Review and customer filtering works → demo.
4. US3 → Corrections and reissue work → demo.
5. US4 → Deletion works → demo.
6. Polish → migration, carry-across, standards and the full acceptance pass.

Each story adds value without breaking the previous ones; statements are never touched.

---

## Notes

- `[P]` = different files, no dependency on an incomplete task.
- Tests are included only because the plan requests them; the **backend has none by the developer's direction**, which is why T043–T048 are manual acceptance tasks.
- Commit after each task or logical group; the repo convention is a co-author trailer on commits.
- Avoid the same file in two parallel tasks — `App.tsx` and `BillsTable.tsx` are edited by several stories and must be serialised across stories.
- The two riskiest unguarded items (the v1→v2 migration and the carry-across extension) are verified by T045/T046.
