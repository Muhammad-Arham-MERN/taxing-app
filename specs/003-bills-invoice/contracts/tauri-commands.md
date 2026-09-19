# Contract: Tauri Command Surface (Module 3 — Bills and Invoices)

**Feature**: `003-bills-invoice` | **Date**: 2026-09-18
**Location**: `tax-statements-analysis/src-tauri/src/commands/`
**Extends**: Module 2's command surface (`specs/002-statements-persistence/contracts/tauri-commands.md`). The statement and storage commands are unchanged except where §5 notes.

All commands are invoked from the frontend through `invoke()` from `@tauri-apps/api/core`. Rust command and argument names are `snake_case`; JS keys are camelCase and Tauri maps them. Every command that touches the store goes through `AppState::with_connection`, so the storage gate (no usable store → `NoStorageLocationError`/problem error) applies to all of them unchanged.

---

## 1. Bills

### `create_bill`

- **Request** (JSON): `{ input: NewBill }` — `{ date, customer, jazzcash, easypaisa, accountHolder, items }`, where `customer` is `{ name, address, contactPerson, contactNumber, email, ntn }` and `items` is an array of `{ details, amount }`.
- **Response**: the stored `Bill` (with assigned `id`, `invoiceNo`, item `id`s and `position`s, and derived `total`).
- **Behaviour**: one transaction that (a) **allocates the invoice number** from `next_invoice_no` and increments the counter, (b) upserts the customer by name, (c) inserts the bill, (d) inserts the items with positions `1..n`. Any failure rolls the whole thing back.
- **Errors**: `ValidationError { fields }` · `NoStorageLocationError` · `StoreWriteFailedError`.
- **Postconditions**: durable before the promise resolves; no partial bill on interruption (FR-022); the invoice number is unique and its sequence value is now spent forever (FR-019, SC-021).

### `list_bills`

- **Request**: `{ from: string | null, to: string | null, customer: string | null }` — every field optional.
- **Response**: `BillSummary[]` — `{ id, invoiceNo, date, customerName, details, total }`, where `details` is the items' details joined with `"; "` in position order and `total` is their sum.
- **Behaviour**: `SELECT` with `GROUP_CONCAT`/`SUM`, ordering `occurred_on DESC, created_at DESC`. Predicates are added only when supplied: `occurred_on BETWEEN ?from AND ?to` (inclusive), `customer_name = ?customer`.
- **Errors**: `InvalidRangeError` when both bounds are given and `from > to` (FR-043).
- **Guarantee**: returns aggregate rows only — **no line-item rows are loaded** — so the list stays fast over thousands of bills (SC-011).

### `get_bill`

- **Request**: `{ id: string }`.
- **Response**: the full `Bill` — its customer, its wallet/account-holder fields, and its items with ids and positions.
- **Errors**: `UnknownBillError` · `NoStorageLocationError`.
- **Purpose**: opening a bill, editing it, and rendering its invoice.

### `update_bill`

- **Request** (JSON): `{ update: BillUpdate }` — `{ id, date, customer, jazzcash, easypaisa, accountHolder, items }`. Items are the full desired set (the store replaces them wholesale); `id` and `invoiceNo` are never changed here.
- **Response**: the stored `Bill` after the edit.
- **Behaviour**: one transaction that updates the bill row, deletes the bill's items and re-inserts the new set with positions `1..n`, and re-upserts the customer. The invoice number is untouched.
- **Errors**: `ValidationError { fields }` (same rules as create, FR-049) · `UnknownBillError` · `StoreWriteFailedError`.
- **Postconditions**: exactly one bill with that `id` exists afterwards (FR-048, SC-008); the invoice number is unchanged (SC-008); `updated_at` advances.

### `delete_bill`

- **Request**: `{ id: string }`.
- **Response**: nothing on success.
- **Behaviour**: `DELETE FROM bills WHERE id = ?`; `bill_items` rows go with it via `ON DELETE CASCADE`.
- **Errors**: `UnknownBillError` · `StoreWriteFailedError`.
- **Postconditions**: the bill and its items are gone (FR-054); no statement is affected; the invoice number is **not** freed (FR-019). The practitioner's confirmation is a UI responsibility (FR-053) — this command deletes once invoked.

---

## 2. Customers

### `list_customers`

- **Request**: none.
- **Response**: `Customer[]` — every remembered customer, ordered by name (case-insensitive).
- **Purpose**: feeds the View Bills **Customer filter** drop-down and its type-to-search (FR-065). The list is small and returned whole; the frontend filters it as the practitioner types.
- **Errors**: `NoStorageLocationError` only.

There is **no** create/delete customer command: customers are remembered as a side effect of saving a bill (FR-066, FR-069).

### `update_customer`

- **Request**: `{ customer: Customer }` — the whole customer record, including the password.
- **Response**: the stored `Customer`.
- **Purpose**: saves the customer's own details from the popup opened by clicking their name in View Bills (FR-070, FR-071). It upserts by name and does **not** touch any bill.
- **Errors**: `ValidationError { fields }` when the name is blank · `NoStorageLocationError`.

---

## 3. Invoice PDF transport

Both commands take the rendered PDF as the **raw request body** with the suggested file name in a JSON header, mirroring Module 2's `x-statement-meta` pattern. The frontend renders the invoice (`renderBillInvoice(bill)`), then calls one of these; **no command returns file contents**.

```ts
const meta = JSON.stringify({ fileName: `${bill.invoiceNo}.pdf` }); // e.g. "INV-0001.pdf"
await invoke("open_bill_invoice", bytes, { headers: { "x-bill-invoice-meta": meta } });
```

### `open_bill_invoice`

- **Request**: raw body = PDF bytes; header `x-bill-invoice-meta` = `{ fileName }`.
- **Response**: nothing on success.
- **Behaviour**: `temp::write_out(&state.run_folder, &file_name, &bytes)` then `app.opener().open_path(path, None)` — the same per-run temp folder, name sanitisation and OS hand-off used for statement attachments.
- **Errors**: `AttachmentWriteFailedError { reason }` (temp folder full/unwritable) · `AttachmentOpenFailedError { reason }` (nothing registered for PDFs / `SE_ERR_NOASSOC`).
- **Postconditions**: the stored bill is unchanged; nothing is written to the store.

### `save_bill_invoice_copy`

- **Request**: raw body = PDF bytes; header `x-bill-invoice-meta` = `{ fileName }`.
- **Response**: `string | null` — the destination path written, or `null` if the practitioner cancelled.
- **Behaviour**: `app.dialog().file().set_file_name(&file_name).blocking_save_file()`, then write the bytes there.
- **Errors**: `AttachmentWriteFailedError { reason }`.
- **Postconditions**: the stored bill is unchanged and the copied file is not managed afterwards.

---

## 4. Error taxonomy (additions)

One serialisable enum already exists (`commands::error::ErrorKind`). Module 3 adds one kind and reuses the rest.

| Error | Raised by | UI behaviour |
|---|---|---|
| `UnknownBillError` | `get_bill`, `update_bill`, `delete_bill` | The list is refreshed; the bill no longer exists. |
| `ValidationError { fields }` | `create_bill`, `update_bill` | Inline field messages; nothing written. *(existing kind)* |
| `InvalidRangeError` | `list_bills` | Range marked invalid; no rows. *(existing kind)* |
| `AttachmentWriteFailedError { reason }` | invoice open/save | Explained; store untouched. *(existing kind, reused for the invoice write)* |
| `AttachmentOpenFailedError { reason }` | `open_bill_invoice` | Explained; saving a copy still offered. *(existing kind)* |
| `NoStorageLocationError`, `StoreWriteFailedError` | all bill commands | Unchanged from Module 2. *(existing kinds)* |

---

## 5. Changes to existing commands

| Command | Change |
|---|---|
| store open / verify (internal) | **Version-aware** and **migrating**: a version-1 store is brought to version 2 additively on first read-write open (data-model §1.4). A version-2 store is used as is. |
| `assess_location` | A store is reported **empty** only when it holds no statements **and** no bills. |
| `set_storage_location` | When records are carried, it now carries **customers → bills → bill_items** and advances the destination's invoice counter, in addition to statements (data-model §5). Idempotent as before. |

---

## 6. Registration

New commands are appended to `generate_handler!` in `src-tauri/src/lib.rs`; the plugin order (single-instance first, then updater, dialog, opener) is unchanged.

```rust
tauri::generate_handler![
    // … existing Module 1/2 commands …
    commands::bills::create_bill,
    commands::bills::list_bills,
    commands::bills::get_bill,
    commands::bills::update_bill,
    commands::bills::delete_bill,
    commands::bills::list_customers,
    commands::bills::open_bill_invoice,
    commands::bills::save_bill_invoice_copy,
]
```

**Capabilities (`src-tauri/capabilities/default.json`)**: **no new entries.** As in Module 2, the dialog and opener plugins are driven from Rust inside these commands, so the frontend still receives no general-purpose open/save capability — it can only ask the backend to open or save *a bill's invoice*.
