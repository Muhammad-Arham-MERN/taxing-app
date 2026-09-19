# Phase 1 Data Model: Customer Bills and Invoices (Module 3)

**Feature**: `003-bills-invoice` | **Date**: 2026-09-18 | **Plan**: [plan.md](./plan.md)

This document defines the shape of the store file after this module, the value types that cross the IPC boundary, and the rules the store enforces. It extends Module 2's model; the statement tables are reproduced only so the migration and foreign-key ordering are unambiguous.

Nothing derived is persisted: a bill's **total** and its **amount in words** are computed from the line items, and the **invoice PDF** is rendered on demand and never stored (spec Clarifications; FR-027).

---

## 1. The store file

One SQLite database file — the **same** file Module 2 introduced (`tax-statements.sqlite`), not a second one. Its location is chosen by the practitioner and remembered in `settings.json` outside it.

### 1.1 Identity stamp and version

| Header field | Value | Purpose |
|---|---|---|
| `application_id` | `0x4D4D5453` ("MMTS"), unchanged | O(1) proof the file is this application's store. |
| `user_version` | `4` after this module | `1` is a statements-only store; `2` adds customers, bills and line items; `3` adds the customer's password; `4` adds the bill's wallet numbers. |

A store is verified **read-only** before use: `application_id` must match, `user_version` must be within `1..=SCHEMA_VERSION`, and the tables required for that version must exist. Older stores are migrated additively (R4, §1.4); a store already at the current version is used as is.

### 1.2 Schema after migration (DDL)

```sql
-- ── Module 2 (version 1), unchanged ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS statements (
    id           TEXT    PRIMARY KEY,
    occurred_on  TEXT    NOT NULL,
    kind         TEXT    NOT NULL CHECK (kind IN ('inflow','outflow')),
    nature       TEXT    NOT NULL,
    amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
    remarks      TEXT,
    created_at   TEXT    NOT NULL,
    updated_at   TEXT    NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS attachments (
    statement_id TEXT    PRIMARY KEY REFERENCES statements(id) ON DELETE CASCADE,
    file_name    TEXT    NOT NULL,
    byte_size    INTEGER NOT NULL,
    data         BLOB    NOT NULL          -- last column; never selected by a list query
) STRICT;

CREATE INDEX IF NOT EXISTS idx_statements_range
    ON statements(occurred_on DESC, created_at DESC);

-- ── Module 3 (version 2), new ──────────────────────────────────────────────

-- One row per customer the practitioner has billed. Identity is the name
-- (FR-068); COLLATE NOCASE makes "Acme" and "acme" the same customer.
CREATE TABLE IF NOT EXISTS customers (
    name           TEXT COLLATE NOCASE PRIMARY KEY,
    address        TEXT,
    contact_person TEXT,
    contact_number TEXT,
    email          TEXT,
    ntn            TEXT,
    password       TEXT,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
) STRICT;

-- One row per bill. No total column: the total is SUM(bill_items.amount_minor).
CREATE TABLE IF NOT EXISTS bills (
    id             TEXT    PRIMARY KEY,               -- UUID v4, assigned once
    invoice_no     TEXT    NOT NULL UNIQUE,           -- "INV-0001", shown and printed
    invoice_seq    INTEGER NOT NULL UNIQUE,           -- 1, 2, 3 … never reused
    occurred_on    TEXT    NOT NULL,                  -- ISO YYYY-MM-DD
    customer_name  TEXT    NOT NULL COLLATE NOCASE
                           REFERENCES customers(name),
    jazzcash       TEXT,                              -- NULL when not provided
    easypaisa      TEXT,                              -- NULL when not provided
    account_holder TEXT    NOT NULL,                  -- defaults to "Mumtaz Qureshi"
    created_at     TEXT    NOT NULL,
    updated_at     TEXT    NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS idx_bills_range
    ON bills(occurred_on DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bills_customer
    ON bills(customer_name, occurred_on DESC, created_at DESC);

-- One row per line item. `position` IS the item number shown (FR-014).
CREATE TABLE IF NOT EXISTS bill_items (
    id           TEXT    PRIMARY KEY,
    bill_id      TEXT    NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
    position     INTEGER NOT NULL CHECK (position > 0),
    details      TEXT    NOT NULL,
    amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
    UNIQUE (bill_id, position)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_bill_items_bill
    ON bill_items(bill_id, position);

-- One row per wallet number the bill carries, in the order entered. A bill may
-- have as many JazzCash and Easypaisa numbers as the practitioner wants.
CREATE TABLE IF NOT EXISTS bill_wallets (
    bill_id  TEXT    NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
    kind     TEXT    NOT NULL CHECK (kind IN ('jazzcash','easypaisa')),
    position INTEGER NOT NULL CHECK (position > 0),
    number   TEXT    NOT NULL,
    PRIMARY KEY (bill_id, kind, position)
) STRICT;

-- Invoice-number counter. Monotonic; never decremented (R3).
INSERT INTO app_meta(key, value) VALUES ('next_invoice_no', '1')
    ON CONFLICT(key) DO NOTHING;
```

### 1.3 Why the shape is this way

- **Same file, new tables.** FR-056 requires bills in the same store as statements; a second file would break "one copy is the whole backup" and the location-change promise.
- **No stored total.** SC-003 requires the displayed total to equal the sum of the line items exactly; deriving it makes disagreement impossible.
- **`position` is the item number.** FR-014/FR-015 need contiguous 1..n numbering and renumbering after a removal; recomputing positions from the array on every write achieves both without a second column that could drift.
- **`amount_minor` is integer paisa.** Same reasoning as Module 2 (R11): decimal totals and their words must be exact.
- **`invoice_seq` is stored beside `invoice_no`.** The integer gives ordering and uniqueness; the formatted string is what the practitioner sees and the invoice prints. Both are `UNIQUE`.
- **`ON DELETE CASCADE` on `bill_items → bills`** makes deleting a bill one statement (FR-053). It is the only cascade, and it is reachable — unlike the statements cascade Module 2 decided no command uses.
- **The customer FK is `NO ACTION`.** Customers are never deleted (FR-069), so there is nothing to cascade to.
- **`COLLATE NOCASE` on both sides of the customer key.** The parent key's collation is what SQLite uses for foreign-key matching, so the child column carries the same collation to keep the relationship well-formed and case-insensitive.

### 1.4 The additive migrations (1 → 2 → 3 → 4)

Run on open while `user_version` is below the current version: for a version-1 store, execute the new `CREATE TABLE`/`CREATE INDEX` statements (all `IF NOT EXISTS`) and seed `next_invoice_no` with `ON CONFLICT DO NOTHING`; for a store below version 3, add the `customers.password` column — guarded by a `PRAGMA table_info` check, because SQLite has no `ADD COLUMN IF NOT EXISTS` and a store migrated from version 1 already has it from the DDL; and for a store below version 4, create `bill_wallets` and **copy each bill's single legacy `jazzcash`/`easypaisa` value into it**. Stamp `user_version` **last**. Every step is idempotent, so an interrupted migration is completed simply by opening again, and a store already at the current version is not touched. The order `customers → bills → bill_items` is not required for creation, but it is for the carry-across (§5).

---

## 2. The remembered location

Unchanged from Module 2: `settings.json` in `app.path().app_config_dir()` holds the single `storageLocation` value. **No new setting is added** — bills live in the same store, so they need no separate location.

---

## 3. Value types crossing the IPC boundary

These extend Module 1/2's `domain/types.ts`. Amounts cross as **major units** (`number`, e.g. `1500.5`); the Rust side converts to and from integer paisa exactly once, at the store edge.

```ts
// ---- new in Module 3 -----------------------------------------------------

/** A previously billed customer, remembered in the store (FR-066, FR-069). */
export interface Customer {
  name: string;                 // identity; matched case-insensitively
  address: string | null;
  contactPerson: string | null;
  contactNumber: string | null;
  email: string | null;
  ntn: string | null;
  password: string | null;
}

/** One piece of work on a bill. `position` is the item number shown. */
export interface BillItem {
  id: string;
  position: number;             // 1-based, contiguous
  details: string;
  amount: number;               // major units; stored as integer paisa
}

/** A stored bill with its customer and its line items (from get_bill). */
export interface Bill {
  id: string;
  invoiceNo: string;            // "INV-0001"
  date: string;                 // ISO YYYY-MM-DD
  customer: Customer;
  jazzcashNumbers: string[];    // as many as the practitioner entered
  easypaisaNumbers: string[];
  accountHolder: string;        // defaults to "Mumtaz Qureshi"
  items: BillItem[];
  total: number;                // derived: sum of items, for display/invoice
  createdAt: string;
}

/** An item as entered on the form (no id/position yet — the store assigns them). */
export interface NewBillItem {
  details: string;
  amount: number;
}

export interface NewBill {
  date: string;
  customer: Customer;           // name required; other fields optional
  jazzcashNumbers: string[];    // as many as the practitioner entered
  easypaisaNumbers: string[];
  accountHolder: string;
  items: NewBillItem[];
}

/** An edit: the bill's identity plus everything that may change (FR-047). */
export interface BillUpdate {
  id: string;
  date: string;
  customer: Customer;
  jazzcashNumbers: string[];    // as many as the practitioner entered
  easypaisaNumbers: string[];
  accountHolder: string;
  items: NewBillItem[];         // replaces the stored items wholesale
}

/** The View Bills filter. Both bounds and the customer are optional (FR-038). */
export interface BillFilter {
  from: string | null;
  to: string | null;
  customer: string | null;
}

/** A View Bills row — already carries what the table shows (FR-064, R7). */
export interface BillSummary {
  id: string;
  invoiceNo: string;
  date: string;
  customerName: string;
  details: string;              // the items' details joined with "; "
  total: number;                // sum of the bill's items
}
```

**Amounts and dates at the boundary** are unchanged from Module 2: ISO `YYYY-MM-DD` text compared lexicographically, and major-unit numbers converted to paisa once in Rust.

---

## 4. Entity descriptions

### Bill

A customer invoice raised by the practitioner.

- **Attributes**: `id` (stable UUID), `invoiceNo` (sequential, unique, never reused), `invoiceSeq`, `date`, `customer` (name + details), `jazzcash`, `easypaisa`, `accountHolder`, one or more line items, derived `total`, `createdAt`, `updatedAt`.
- **Relationships**: exactly one **Customer** (by name); one or more **Line Items** (1:N, ordered); no attachments.
- **Lifecycle**:

  ```text
  (draft in the form)──create──▶ Stored ──edit──▶ Stored (same id, same invoiceNo, items replaced, updated_at changes)
                                    │
                                    └──delete──▶ Deleted (row and items removed; invoice number stays spent)
  ```

  There is no archive/admin state. Deletion is the only terminal transition and it is the only thing in the module that removes a bill.

### Line Item

One piece of work on a bill.

- **Attributes**: `id`, `position` (1-based, contiguous, also the displayed item number), `details`, `amount` (positive paisa).
- **Lifecycle**: `added ──▶ renumbered (on insert/removal above it) ──▶ replaced (whole set rewritten on edit)`.
- **Invariant**: a bill always has at least one item (FR-016/FR-021); positions are always `1..n` with no gaps or duplicates (FR-014).

### Customer

A person or business the practitioner has billed, identified by name.

- **Attributes**: `name` (identity, case-insensitive), `address`, `contactPerson`, `contactNumber`, `email`, `ntn`, `password`, `createdAt`, `updatedAt` — all optional except the name. The details are edited from the customer popup in View Bills (FR-070); a bill's edit no longer touches them (FR-047).
- **Lifecycle**:

  ```text
  (absent) ──name first entered on a bill──▶ Remembered ──details changed on a later bill──▶ Remembered (updated)
                                                  │
                                                  └──── no deletion exists (FR-069) ────
  ```

  A customer survives the deletion of every bill raised for them.

### Invoice

The rendered artefact, **not a stored entity**. It is produced by the frontend from a `Bill`'s current values whenever the bill is created, opened, downloaded, or an edit is saved, then handed to the backend to write to the OS temp folder and open, or to save to a chosen path. Because nothing is stored, it can never be stale (FR-027, FR-036).

---

## 5. Carry-across (location change)

When the practitioner changes the storage location and chooses to bring their records, Module 2's carry is extended to move, **in dependency order** and each bill with its items in one transaction:

1. `customers` (skip a name already present),
2. `bills` (skip an `id` already present),
3. `bill_items` (only for bills that were copied; skip an `id` already present),
4. the `next_invoice_no` counter — the destination's counter is advanced to at least the source's, so copied invoice numbers can never be reissued.

The empty-store assessment is widened: a store is **empty** only when it holds no statements **and** no bills.

A row already present in the destination is never altered, so the operation remains idempotent and resumable (Module 2 R7). Copying customers before bills is mandatory — the foreign key requires the parent row to exist.

---

## 6. Validation and enforcement

| Rule | Source FR | Enforcement |
|---|---|---|
| Date required; item details required; item amount required and > 0; customer name required; ≥ 1 item | FR-021 | Zod schema at the seam **and** `CHECK (amount_minor > 0)` / `NOT NULL` in the store |
| Create action unavailable while any required entry is missing/invalid | FR-020 | `disabled={!isValid}` on the submit button, `mode: "onChange"` |
| Item numbers 1..n, contiguous, no duplicates | FR-014, FR-015 | `position` recomputed from the item array on every write; `UNIQUE(bill_id, position)` |
| Invoice number unique and **never reused** | FR-019, SC-021 | Monotonic `next_invoice_no` counter, incremented in the create transaction; `UNIQUE` on `invoice_no`/`invoice_seq`; deletion never decrements |
| Bill + its items written atomically | FR-022 | One transaction per create/update; rolls back on drop |
| Edit updates in place, keeps the invoice number, adds no bill | FR-048 | `UPDATE bills ... WHERE id = ?`; items deleted and re-inserted; no insert of a new bill row |
| Deleting a bill removes its items and nothing else | FR-053, FR-054 | `DELETE FROM bills WHERE id = ?`, `ON DELETE CASCADE` for items; statements untouched |
| Customer remembered and kept current | FR-066, FR-068 | `INSERT ... ON CONFLICT(name) DO UPDATE` inside the bill's transaction |
| Customer never deleted | FR-069 | No delete path exists in `store/customers.rs` or `store/bills.rs` |
| Range and customer filters combine, both optional | FR-038–FR-040 | Predicates added to the list query only when supplied |
| List shows Customer Name, Date, Details, Amount without loading item rows | FR-064, SC-011 | `GROUP_CONCAT`/`SUM` in SQL; the query returns aggregate rows only |
| Range review ordering newest-first, stable | FR-041 | `ORDER BY occurred_on DESC, created_at DESC` |
| Amounts exact | SC-003, SC-016 | Integer paisa throughout; `formatPkr` for display |
| Totals derived, never stored | SC-003 | No total column exists |

---

## 7. Explicitly out of the model

- **Stored invoice PDF** — the invoice is rendered on demand; nothing is persisted (FR-027).
- **Stored bill total / amount in words** — both derived (SC-003).
- **Attachments on bills** — bills carry line items only; the attachment model belongs to statements.
- **Customer deletion or editing outside a bill** — a customer's details change only by saving a bill (FR-066/FR-068); there is no customer-management screen.
- **A general schema-migration framework** — only the concrete v1→v2 additive step is implemented; the developer's broader policy remains deferred (Module 2 assumptions).
- **Statement changes** — the statement tables, their behaviour and their `₨` presentation are untouched (FR-061, FR-062).
