# Phase 1 Data Model: Local Statement Persistence and Editing (Module 2)

**Feature**: `002-statements-persistence` | **Date**: 2026-09-14 | **Plan**: [plan.md](./plan.md)

This document defines the shape of the store file, the value types that cross the IPC boundary, and the rules the store enforces. It is the contract between the Rust backend and the frontend seam.

Two things are deliberately **not** in the store: the business profile (FR-053 — header details are fixed built-in values and cannot be updated) and anything derived (totals and balance are computed, never persisted).

---

## 1. The store file

One SQLite database file. Its location is chosen by the practitioner and remembered outside it.

### 1.1 Identity stamp

Written when the store is created, checked whenever a file is opened or adopted (FR-059, R6):

| Header field | Value | Purpose |
|---|---|---|
| `application_id` | `0x4D4D5453` ("MMTS") | O(1) proof the file is this application's store, not merely a SQLite file. |
| `user_version` | `1` (current schema version) | Lets a future version recognise the shape it is looking at. No migration is implemented — the developer deferred upgrades to a later module. |

`application_id` lives in the file header that SQLite reserves for application file formats, so it is readable without parsing any table. A SQLite file belonging to another program has a different or zero `application_id` and is rejected.

### 1.2 Schema (DDL)

```sql
PRAGMA application_id = 0x4D4D5453;
PRAGMA user_version   = 1;

-- Free-form store metadata: creator version, creation timestamp, and anything
-- a later version needs without changing the schema.
CREATE TABLE app_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
) STRICT;

CREATE TABLE statements (
    id           TEXT    PRIMARY KEY,                       -- UUID v4, assigned once, never reused
    occurred_on  TEXT    NOT NULL,                          -- ISO YYYY-MM-DD
    kind         TEXT    NOT NULL CHECK (kind IN ('inflow','outflow')),
    nature       TEXT    NOT NULL,
    amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),  -- paisa; never a float (R11)
    remarks      TEXT,                                       -- NULL when not provided
    created_at   TEXT    NOT NULL,                           -- ISO 8601; ordering tie-break
    updated_at   TEXT    NOT NULL                            -- ISO 8601; differs from created_at after an edit
) STRICT;

-- At most one attachment per statement, so the statement id is the key.
-- `data` is LAST and is never selected by a list query: SQLite reads a row's
-- overflow pages only when it must advance past the overflowing column, which is
-- what makes FR-029/FR-030/SC-011 structural rather than a coding convention.
CREATE TABLE attachments (
    statement_id TEXT    PRIMARY KEY REFERENCES statements(id) ON DELETE CASCADE,
    file_name    TEXT    NOT NULL,                           -- original name, with extension
    byte_size    INTEGER NOT NULL,                           -- exact length of `data`
    data         BLOB    NOT NULL
) STRICT;

CREATE INDEX idx_statements_range ON statements(occurred_on DESC, created_at DESC);
```

`STRICT` tables are used because the bundled SQLite (3.53.x) supports them and they turn a whole class of type-confusion defects into immediate errors — the accuracy half of Constitution Principle II.

### 1.3 Why the shape is this way

- **The blob is in its own table and last.** A range review must load zero attachment contents (FR-029, SC-011). Keeping `data` out of the list query's reach makes that a property of the schema. Any future column appended after `data` would silently break it — noted here so a later change does not do it by accident.
- **One row per attachment, not a list.** The spec allows at most one attachment per statement (FR-003, assumption).
- **`byte_size` is stored, not derived.** It is needed by the carrier/apk-style pre-flight before a blob is read, and it lets the UI show a size without touching contents.
- **No `deleted` column and no delete statement anywhere.** FR-050 forbids deleting a statement entirely, so there is no soft-delete flag to maintain either.
- **No totals are stored.** FR-032 derives them from the retrieved rows so they can never disagree with the list.

---

## 2. The remembered location

A single small file, `settings.json`, in `app.path().app_config_dir()` — the only thing this module keeps outside the store (R8):

```json
{
  "storageLocation": {
    "kind": "directory",       // "directory" | "file"
    "path": "D:\\TaxRecords"
  }
}
```

| Field | Rules |
|---|---|
| `kind` | `"directory"` when the practitioner chose a folder and the store was created inside it; `"file"` when they adopted an existing store file. Determines whether the store file name is generated or already exists (FR-016, FR-062). |
| `path` | Absolute. For `kind: "directory"` it is the folder; for `kind: "file"` it is the file itself. |

**Absence of this file, or absence of the key, is the "no location chosen" state** — which is what FR-015's gate is built on. There is no default location and no inferred one (FR-014).

If the path is present but unreachable at startup, the application reports it and does **not** substitute an empty store (FR-025). If it is present but the file is damaged, likewise (FR-056).

---

## 3. Value types crossing the IPC boundary

These are the shapes shared by the Tauri commands and the frontend seam. They extend Module 1's `domain/types.ts`; `Statement`, `NewStatement`, `StatementFilter` and `StatementSummary` keep their existing shape so no component changes.

```ts
// ---- existing, unchanged -------------------------------------------------
export type StatementType = "inflow" | "outflow";

export interface Statement {
  id: string;
  date: string;             // ISO YYYY-MM-DD
  type: StatementType;
  nature: string;
  amount: number;           // major units at the boundary; stored as integer paisa
  remarks: string | null;
  fileName: string | null;
  fileRef: string | null;   // Module 1 reserved this; Module 2 leaves it null (the blob is keyed by statement id)
  createdAt: string;
}

export type NewStatement = Omit<Statement, "id" | "createdAt">;
export interface StatementFilter { from: string; to: string; }
export interface StatementSummary { totalInflow: number; totalOutflow: number; balance: number; }

// ---- new in Module 2 -----------------------------------------------------

/** An edit: the statement's identity plus the values that may change (FR-038–FR-041). */
export interface StatementUpdate {
  id: string;
  date: string;
  type: StatementType;
  nature: string;
  amount: number;
  remarks: string | null;
  /** How the attachment changes. */
  attachment:
    | { action: "keep" }                                  // leave the stored file untouched (FR-033)
    | { action: "remove" }                                // FR-040
    | { action: "replace"; fileName: string; bytes: Uint8Array };  // FR-041
}

/** What the practitioner has pointed the application at. */
export interface StorageLocation {
  kind: "directory" | "file";
  path: string;
}

/** The gate the frontend renders from (FR-013, FR-015, FR-017). */
export interface StorageState {
  chosen: boolean;
  location: StorageLocation | null;
  /** Set when a remembered location cannot be used; the UI must offer a re-choice (FR-023, FR-025, FR-056). */
  problem: "unreachable" | "not-a-store" | "damaged" | "unwritable" | null;
}

/** What the practitioner chooses to do with existing records (FR-019, FR-020). */
export type CarryAcrossChoice = "bring" | "start-fresh";

/** Result of inspecting a location before adopting it (FR-055, FR-059, FR-064). */
export interface LocationAssessment {
  acceptable: boolean;
  /** A location whose folder is cloud-synced, on a network share, or removable (FR-055). */
  warning: "cloud-synced" | "network" | "removable" | null;
  /** Present when a chosen file is not this application's store (FR-060). */
  rejection: string | null;
  /** True when an adopted store file is valid but holds no statements (FR-064). */
  isEmptyStore: boolean;
}
```

**Amounts at the boundary**: the frontend keeps using major units (`amount: number`, e.g. `1500.50`). The Rust side converts to and from integer paisa exactly once, at the store edge. No component or form logic changes (R11).

---

## 4. Entity descriptions

### Statement

A single recorded financial transaction. Key attributes: `id` (stable), `date`, `type`, `nature`, `amount`, optional `remarks`, optional attachment, `createdAt`, `updatedAt`.

- **Identity**: a UUID assigned once at creation, never reused and never regenerated. This is what makes a carry-across idempotent (FR-063) and an edit update-in-place rather than a duplicate (FR-042).
- **Relationships**: optionally one `Attached File` (1:1). No relationship to any profile — profiles are not stored.
- **Lifecycle / state transitions**:

  ```text
  (draft in the form)──create──▶ Stored ──edit──▶ Stored (same id, updated_at changes)
                                    │
                                    └──── no other transition exists ────
  ```

  There is no `Deleted` state (FR-050) and no `Archived` state.

### Attached File

An optional supporting document belonging to exactly one statement.

- **Attributes**: original `file_name` (with extension), `byte_size`, complete `data` as a BLOB.
- **Lifecycle**: `None ──attach──▶ Present ──replace──▶ Present (new name, size, contents)`, or `Present ──remove──▶ None`.
- **Invariant**: unless the practitioner replaces or removes it, an edit leaves the stored blob byte-for-byte unchanged (FR-033, FR-047). Editing metadata must never rewrite `data`.
- **Retrieval**: exact bytes only, one statement at a time (FR-036, FR-037). Never included in a list (FR-029).

### Storage location

Where the records live: either a directory the practitioner chose (in which a store file is created and named by the application) or a store file they already held (adopted in place, per the developer's decision of 2026-09-14).

- **Lifecycle**: `Not chosen ──▶ Chosen ──▶ Chosen (changed, records brought across or deliberately not)`.
- **Invariant**: the store file previously in use is **never deleted** (FR-022). No path in the application deletes a store file, including a rejected one.

### Store file

The single self-contained file holding the whole stored data set. It is normally created by the application; it may also be one the practitioner already holds — a backup, or a file recovered after a machine is rebuilt — in which case it is adopted and becomes the working store (FR-057, FR-062).

---

## 5. Validation and enforcement

| Rule | Source FR | Enforcement |
|---|---|---|
| Only one store in use at a time | FR-054 | Single-instance plugin holds a process-level mutex before any store is opened |
| Store is ours and readable | FR-059, FR-060 | Read-only open + `application_id` + `user_version` + table existence (R6) |
| Rejected file left untouched | FR-060, SC-020 | The verification path opens read-only and holds no write handle |
| A statement is complete or absent | FR-005, FR-007 | One transaction per write; rollback on drop (R4) |
| Statement id unique and stable | FR-042, FR-063 | UUID primary key, generated once, never regenerated |
| Nature belongs to the chosen type | FR-045 | Reused Module 1 zod rule at the seam; the store never sees an invalid pair |
| Amount is a positive 2-dp value | FR-039, FR-044 | Module 1 zod rule; converted to integer paisa before insert |
| Range bounds inclusive, `from <= to` | FR-027, FR-034 | `WHERE occurred_on BETWEEN ?1 AND ?2`, with the reversed case rejected at the seam |
| Range review loads no file contents | FR-029, SC-011 | List query never selects `attachments.data` (R3) |
| File contents fetched one at a time | FR-036, FR-037 | Separate command keyed by statement id; no bulk fetch exists |
| Carry-across never duplicates or overwrites | FR-063, SC-021 | `INSERT ... ON CONFLICT(id) DO NOTHING` semantics per statement; no `UPDATE` of an existing row (R7) |
| Interrupted carry-across loses nothing | FR-021 | Source opened read-only and never modified; per-statement transactions make the run resumable |
| No store file is ever deleted | FR-022 | No delete path exists in `store/` for a store file |
| Temporary copies cleared, never while in use | FR-069, FR-070 | Per-run folder; other runs cleared best-effort, tolerating `ERROR_SHARING_VIOLATION`/`ACCESS_DENIED` (R10) |
| Chosen location may be risky | FR-055 | Classification by volume root + drive type + sync-root check; warn, then proceed on confirmation (R9) |

**Precision invariant (SC-002, SC-004)**: totals are summed from the retrieved rows as integers (paisa) and converted for display, so `balance == totalInflow - totalOutflow` holds exactly for every rendered set. An empty set yields `{ 0, 0, 0 }` (FR-033).

---

## 6. Explicitly out of the model

- **Business profile** — not stored; header values are constants (FR-053).
- **Schema migration** — `user_version` is stamped so a future version has what it needs; no migration logic is written now (developer deferral).
- **Encryption at rest** — not part of this module; the store is protected by the machine account only.
- **Audit history of edits** — the spec requires edits to persist, not to be versioned. Only `updated_at` records that an edit happened.
- **Statement deletion** — no delete operation, no cascade for statements (the attachment's `ON DELETE CASCADE` exists for schema hygiene and is unreachable from any command).
