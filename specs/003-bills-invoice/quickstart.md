# Quickstart: Customer Bills and Invoices (Module 3)

**Feature**: `003-bills-invoice` | **Date**: 2026-09-18 | **Plan**: [plan.md](./plan.md)

How to run the module, what to click to prove each story works, and where everything lands on disk. Per the developer's direction there are no automated backend tests, so this walkthrough **is** the acceptance procedure. The existing Vitest suite is the only automated coverage and must keep passing.

---

## 1. Prerequisites

- **Node.js + npm** and the **Rust toolchain (edition 2021, 1.77.2+)** — both already required by Module 2.
- **MSVC build tools** (a C compiler) — already required by Module 2 for `rusqlite`'s `bundled` SQLite. Unchanged; the shipped application still needs nothing on the practitioner's machine.
- **One new frontend dependency**: `@react-pdf/renderer` (added by `npm install`). No new Rust crate.

## 2. Run it

```bash
cd tax-statements-analysis
npm install
npm run tauri dev
```

Frontend tests (the only automated coverage):

```bash
npm test
```

## 3. Where things live on disk

| What | Where |
|---|---|
| Statements, bills, customers | The **same** store file the practitioner already chose — `tax-statements.sqlite` (or the file they adopted). Nothing new is created. |
| The remembered location | `%APPDATA%\com.har.tax-statements-analysis\settings.json` — unchanged, no new key. |
| Temporary copies of invoices while open | `%LOCALAPPDATA%\com.har.tax-statements-analysis\…\attachments\<run-id>\INV-0001.pdf` — the same per-run folder attachments use, cleared on the next launch. |
| A downloaded invoice | Wherever the practitioner chooses in the save prompt. |

The store is **version 2** after this module. A store created by Module 2 (version 1) is migrated additively the first time it is opened; no separate step is needed and its statements are untouched.

## 4. Acceptance walkthrough

### Story 1 — create a bill and get its invoice

1. Launch with an existing store. The statements are exactly as before.
2. Look at the navigation: **Create Statement / View Statements** — a small divider — **Create Bill / View Bills** (FR-001–FR-003). Nothing about the Statements screens changed.
3. Open **Create Bill**. The date shows today; the account holder shows "Mumtaz Qureshi"; the customer fields and one line item are present; **Create Bill** is disabled (FR-006, FR-010, FR-020).
4. Fill the date, customer name, and one item's details and amount. Watch the item number show `1`, the total appear in **PKR with commas** (e.g. `PKR 1,500.00`), and the total appear **in words** (FR-014, FR-017, FR-018, FR-026).
5. Press **"+"**: a second item appears, numbered `2`, and the total and words update (FR-013).
6. Clear the second item's details: **Create Bill** becomes disabled again. Fill it → enabled (FR-021). Try a zero amount → disabled (FR-021).
7. Press **Create Bill**. The bill is stored and its **green invoice PDF opens in the default PDF application** (FR-027, FR-034).
8. Read the invoice: the practice header; a customer block with the customer's details in one column and **Invoice Number + Date** beside it; a table headed **Item Number, Details, Amount(s), Total, Amount in Words**; bold centred **"For & On Behalf of M&M Tax Law Solutions \_\_\_\_\_"**; a footer with **Meezan: 03090100464603**, **JS Bank 0002717402 (M&M Tax Law Solutions)**, the JazzCash and Easypaisa numbers entered (FR-029–FR-033).
9. Confirm the form reset: date back to today, account holder back to default (FR-024).
10. **Close and reopen.** Open **View Bills** with no filters and find the bill unchanged, with the same invoice number (SC-002).
11. Disconnect from the network and repeat 3–10. Everything still works (SC-012).

**Check**: the invoice is one page for a typical bill; add enough items to overflow and confirm the invoice **continues onto further pages without losing any item** (FR-028, SC-006).

### Story 2 — review and filter bills

1. Create bills for two different customers across several dates.
2. Open **View Bills** with no filters. Every bill is listed **newest first**, each row showing **Customer Name, Date, Details and Amount** (FR-039, FR-064).
3. Set a From and To date. Only bills inside that inclusive range remain, newest first (FR-040).
4. Clear the dates and choose a **customer** from the filter. Only that customer's bills are listed, across all dates (FR-040).
5. Choose a customer **and** a date range. The list shows only that customer's bills inside the range (FR-040).
6. In the customer field, start typing a few letters: the remembered customers that match are offered (FR-065).
7. Choose a combination that matches nothing → the empty state is shown, not a blank gap (FR-042).
8. Set From later than To → the range is reported invalid (FR-043).
9. Clear both filters → all bills are listed again (FR-045).
10. Delete every bill of one customer, reopen the filter: that customer is **still offered**, and choosing them shows an empty list (FR-069).

### Story 3 — open, correct and reissue a bill

1. From **View Bills**, open a bill. Every value is prefilled and editable (FR-046).
2. Change the customer's address and one item's amount; **add** a third item and **remove** the second; save.
3. Confirm the same bill was updated — the bill count did not grow (SC-008) — the item numbers are `1, 2, 3` again with no gaps, the total and words reflect the new items, and the **invoice number is unchanged** (FR-015, FR-017, FR-048).
4. Open the invoice: it reflects the corrections (FR-036).
5. **Restart.** The corrections are still there (FR-050).
6. Open an edit, change something, then abandon it → the stored bill and its invoice are unchanged (FR-051).
7. Try saving an invalid edit → save is unavailable and nothing is written (FR-049).
8. Download the invoice, choose a destination, and confirm the saved file is the same invoice (FR-035). Cancel the prompt → nothing is written.

### Story 4 — delete a bill

1. From **View Bills**, delete a bill. You are asked to confirm first (FR-053).
2. The bill and its items disappear from the list (FR-054).
3. **Restart** → the bill does not return (FR-055).
4. Confirm the statements list is completely unaffected (FR-054).
5. Note the deleted bill's invoice number: create a new bill and confirm it gets a **new** number, never the deleted one (FR-019, SC-021).

### Cross-cutting

- **Existing store upgrade.** Point the application at a store created by Module 2 (version 1, statements only): it opens, the statements are intact, and the bills tables are created silently. No prompt, no data change (data-model §1.4).
- **Location change (carry-across).** With statements, bills and customers stored, change **Choose Storage Directory** and choose **bring records**: statements, bills and customers all move to the new location, totals unchanged, and the old store file is left in place (data-model §5). Repeat and choose **start fresh**: the new location holds none of the previous records.
- **Invoice number never reused.** Create, delete the highest-numbered bill, create another, and confirm the new number is greater — never the freed one (SC-021).
- **Amounts.** Compare a statement's amount (still shown with **₨**) and a bill's (shown with **PKR**): the two presentations coexist as the client asked (FR-026, SC-016).

## 5. Known bounds and gotchas

- **Customer identity is by name, case-insensitively.** "Acme" and "acme" are one customer, so two genuinely different customers sharing a name cannot both be held (FR-068, data-model §6). This is the spec's chosen identity rule.
- **`COLLATE NOCASE` is ASCII-only.** Names differing only by non-ASCII case are treated as distinct.
- **The invoice is never stored.** Deleting a bill deletes its data and therefore its invoice; nothing to clean up. Opening or downloading always renders afresh.
- **Invoice numbering format** is `INV-` + zero-padded four digits, growing naturally past 9999 (`INV-10000`).
- **`@react-pdf/renderer` uses a built-in typeface** (Helvetica) because the project's Geist ships as WOFF2, which the renderer does not accept. Confirm with the developer if a specific typeface is required.
- **Keep the store out of a synced folder** while testing — a cloud client rewriting files produces misleading results (unchanged from Module 2).
- **Don't copy the store while the application is running.** The rollback journal keeps the single `.db` a complete store, but copying a file mid-write is still copying a file mid-write.

## 6. When something goes wrong

| Symptom | Likely cause | Where to look |
|---|---|---|
| A version-1 store opens with no bills tables | Migration did not run | data-model §1.4 — reopen; the migration is idempotent |
| Create Bill stays disabled | A required entry (date, item details, item amount, customer name) is missing/invalid | FR-021; the disabled button is the intended behaviour |
| The invoice opens blank or will not open | No PDF handler registered, or the temp write failed | The error message is shown; use **download** to save the invoice instead |
| A customer is missing the filter | The customer was never saved with a bill | Customers are remembered only by saving a bill (FR-066) |
| Bills vanished after changing the storage folder | The location change was completed with **start fresh** | The previous store file still holds them — point the application at it again |
| An old store shows "not a store of this application" | The file is not this application's store, or is damaged | FR-059/FR-060 — the file was not modified |
