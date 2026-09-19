# Contract: Data-Access Seam — Bills and Customers (Frontend Repository Interfaces)

**Feature**: `003-bills-invoice` | **Date**: 2026-09-18
**Location**: `tax-statements-analysis/src/data/repositories.ts`
**Implementations**: `src/data/tauri.ts` (the running application) · `src/data/in-memory.ts` (test fixture only)

---

## Why this contract exists

Module 1 defined the seam so the UI could run end-to-end with an in-memory implementation; Module 2 added the real one behind the same interfaces with no component restructuring. Module 3 follows the same pattern: **components depend only on these interfaces**, injected through `DataProvider`, and never import `tauri.ts`. Both implementations must satisfy the new interfaces, because the in-memory twin is the only fixture the Vitest suite renders against.

The rule is unchanged and non-negotiable: a component never imports a concrete repository.

---

## `BillRepository`

```ts
import type {
  Bill, BillFilter, BillSummary, BillUpdate, NewBill,
} from "../domain/types";

export interface BillRepository {
  /** Persist a new bill; returns the stored record with its invoice number and item positions. */
  create(input: NewBill): Promise<Bill>;

  /** Bills matching the optional date range and optional customer, newest first (FR-038–FR-041). */
  list(filter: BillFilter): Promise<BillSummary[]>;

  /** One stored bill with its customer and items (FR-044). */
  get(id: string): Promise<Bill>;

  /** Update a bill in place, replacing its items; keeps id and invoice number (FR-048). */
  update(update: BillUpdate): Promise<Bill>;

  /** Delete a bill and its items (FR-053, FR-054). */
  remove(id: string): Promise<void>;

  /** Hand a rendered invoice PDF to the system's default PDF application (FR-034). */
  openInvoice(bytes: Uint8Array, fileName: string): Promise<void>;

  /** Save a rendered invoice PDF to a destination the practitioner picks (FR-035). */
  saveInvoiceCopy(bytes: Uint8Array, fileName: string): Promise<string | null>;
}
```

### `create(input)`

- **Postconditions**: durable before the promise resolves; the bill carries a **unique, never-reused** `invoiceNo` (FR-019); items carry contiguous positions from `1` (FR-014); the customer is remembered (FR-066).
- **Errors**: `ValidationError` (same required rules as the form, FR-021) · `StoreWriteFailedError`.
- **UI obligation**: on failure the form must not reset or behave as though the bill was created (FR-025).

### `list(filter)`

- **Input**: `{ from, to, customer }`, each nullable. All-null means every bill.
- **Output**: `BillSummary[]` — each already carrying `customerName`, `date`, `details` and `total` (FR-064).
- **Postconditions**: ordering is `date` descending, ties by recording order (FR-041); range bounds are inclusive (FR-040); no line-item rows are loaded (SC-011).
- **Errors**: `InvalidRangeError` when both bounds are set and `from > to` (FR-043).

### `get(id)`

- **Output**: the full `Bill`, including its items and the customer's remembered details.
- **Errors**: `UnknownBillError`. The caller refreshes its list and does not render a stale bill.

### `update(update)`

- **Postconditions**: the same `id` still exists exactly once — no additional bill (FR-048, SC-008); the `invoiceNo` is unchanged (SC-008); the items are exactly the set supplied, renumbered `1..n` (FR-015); the customer is re-upserted.
- **Errors**: `ValidationError` (FR-049) · `UnknownBillError` · `StoreWriteFailedError`.

### `remove(id)`

- **Postconditions**: the bill and its items are gone (FR-054); no statement is affected; the invoice number is not reused (FR-019).
- **Errors**: `UnknownBillError` · `StoreWriteFailedError`.
- **UI obligation**: confirmation precedes the call (FR-053).

### `openInvoice(bytes, fileName)` / `saveInvoiceCopy(bytes, fileName)`

- **Input**: the bytes produced by `renderBillInvoice(bill)` and a suggested file name (`"INV-0001.pdf"`).
- **Postconditions**: the stored bill is unchanged (nothing is persisted); `saveInvoiceCopy` returns the destination path or `null` when cancelled.
- **Errors**: `InvoiceWriteFailedError` · `InvoiceOpenFailedError` — the UI keeps the save action available when opening fails (mirrors Module 2 FR-075 reasoning).

---

## `CustomerRepository`

```ts
export interface CustomerRepository {
  /** Every remembered customer, for the View Bills filter (FR-065). */
  list(): Promise<Customer[]>;

  /** Save a customer's own details from the popup in View Bills (FR-070, FR-071). */
  update(customer: Customer): Promise<Customer>;
}
```

There is deliberately **no** `create`/`remove`: customers are remembered as a side effect of saving a bill (FR-066) and are never deleted (FR-069). `update` exists for the popup opened by clicking a customer's name (FR-070) and writes only the customer's own details — it never touches a bill.

---

## Injection (`DataProvider`)

`DataProvider`'s value grows by two entries:

```ts
{
  statements, storage,          // unchanged
  bills: BillRepository,
  customers: CustomerRepository,
}
```

The implementation is chosen once, exactly as today: an injected `repositories` prop for tests, else the Tauri implementation in the running application, else the in-memory twin. `useRepositories()` and its "must be inside the provider" guarantee are unchanged.

---

## Contract test cases

Module 2's cases C-01–C-25 remain valid against the statement/storage interfaces. The cases below cover the new interfaces. Cases marked *(memory)* are worth adding to the Vitest suite because the in-memory implementation also changes; the rest are exercised end to end (no automated backend tests, per the developer's direction).

| # | Case | Expected |
|---|------|----------|
| B-01 | `create` a valid bill with two items | same `id`; `invoiceNo` assigned; positions `1, 2`; `total` equals the sum (SC-003) |
| B-02 | `create` twice in succession | two distinct bills; invoice numbers sequential and different (FR-019) |
| B-03 | `remove` a bill, then `create` another | the new bill's number is **new**, never the deleted one (SC-021) |
| B-04 | `create` with a missing date / item details / item amount / customer name, or no items *(memory)* | rejects with `ValidationError`; nothing stored (FR-021) |
| B-05 | `list` with no filters | every bill, newest first (FR-039) |
| B-06 | `list` with a range only | exactly the bills inside it, inclusive, newest first (FR-040) |
| B-07 | `list` with a customer only | only that customer's bills, newest first, all dates (FR-040) |
| B-08 | `list` with a customer **and** a range | only that customer's bills inside the range (FR-040) |
| B-09 | `list` with `from > to` *(memory)* | rejects with `InvalidRangeError` (FR-043) |
| B-10 | `list` row contents | each row carries `customerName`, `date`, `details` (items joined) and `total` (FR-064) |
| B-11 | `get` a stored bill | items with positions `1..n` and the customer's details (FR-044) |
| B-12 | `update` with a changed item set of a different size | same `id` and `invoiceNo`; items renumbered `1..n`; total recomputed (FR-048, FR-015) |
| B-13 | `update` with `details`/`amount` changed on an existing item | values updated; no duplicate bill (SC-008) |
| B-14 | `remove` a bill, then `list` | the bill is absent (FR-054) |
| B-15 | `remove` a bill, then restart | the bill does not return (FR-055) |
| B-16 | save a bill for a new customer name, then `customers.list()` | the customer is offered (FR-066) |
| B-17 | type an existing customer name with different case *(memory)* | refers to the same customer; no second entry (FR-068) |
| B-18 | `update` a bill's customer details | the remembered customer's details are updated (FR-068) |
| B-19 | delete every bill for a customer, then `customers.list()` | the customer is still offered (FR-069) |
| B-20 | `create` a bill for a customer, then `get` it | the customer's remembered details are prefilled, and remain editable for that bill (FR-067) |
| B-21 | `openInvoice` with valid bytes | resolves; the stored bill is unchanged (nothing persisted) |
| B-22 | `saveInvoiceCopy` cancelled | resolves `null`; nothing written |
| B-23 | PDF for a bill whose items exceed a page | produced without losing or truncating content (FR-028, SC-006) |

**What is *not* covered here**: the v1→v2 store migration and the carry-across extension. Both are backend-only and, per the developer's direction, are verified by exercising the application (see `quickstart.md`); they are the subject of the plan's Objection 1.
