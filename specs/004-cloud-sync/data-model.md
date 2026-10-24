# Phase 1 Data Model: Offline Work — Communicate Live (Cloud Sync)

**Feature**: `004-cloud-sync` | **Date**: 2026-10-15 | **Plan**: [plan.md](./plan.md)

This document defines the shape of the store after this module, the file the cloud sync adds beside it, the values that cross the IPC boundary, and the rules the store enforces. It extends Module 3's model. The store's **tables for statements, customers, bills, bill items and wallets are unchanged in shape**; the only schema change is that **attachment bytes leave the store** so the synced copy stays text-only (R5). The store is now a **Turso local-first database** (R2), which is why its constraints are re-checked by the R1 spike before this migration is written.

Nothing derived is persisted: bill totals and amounts-in-words are computed; invoice PDFs are rendered on demand; the cloud copy is the *same* store synced, not a second model.

---

## 1. The store file

One database file — the **same** file Modules 2 and 3 introduced (`tax-statements.sqlite`), now opened through the Turso engine (R2). Its location is chosen by the practitioner and remembered in `settings.json` outside it.

### 1.1 Identity stamp and version

| Header field | Value | Purpose |
|---|---|---|
| `application_id` | `0x4D4D5453` ("MMTS"), unchanged | O(1) proof the file is this application's store (checked via `PRAGMA application_id`, R1). |
| `user_version` | `5` after this module | `1` statements; `2` customers/bills/items; `3` customer password; `4` bill wallets; **`5` attachment bytes moved out of the store**. |

Verification stays read-only before use: `application_id` matches, `user_version` is within `1..=SCHEMA_VERSION`, and the tables for that version exist. Older stores are migrated additively (§1.4).

### 1.2 Schema after migration (DDL)

The Module 2/3 tables are unchanged (`app_meta`, `statements`, `customers`, `bills`, `bill_items`, `bill_wallets`). Only `attachments` changes:

```sql
-- ── Module 2 (version 1) — attachments, RE-SHAPED at version 5 ──────────────
-- Before v5 the row held the bytes:
--   attachments(statement_id PK, file_name, byte_size, data BLOB)
-- From v5 the bytes live in the `attachments/` folder beside the store and the
-- row keeps only a reference. This is what keeps the synced store text-only.
CREATE TABLE IF NOT EXISTS attachments (
    statement_id  TEXT    PRIMARY KEY REFERENCES statements(id) ON DELETE CASCADE,
    file_name     TEXT    NOT NULL,
    byte_size     INTEGER NOT NULL,
    relative_path TEXT    NOT NULL   -- e.g. "attachments/<statement_id>.bin"
) STRICT;
```

Everything else is as Module 3 defined it (`app_meta`, `statements`, `customers`, `bills`, `bill_items`, `bill_wallets`), reproduced there and not restated here.

### 1.3 Why the shape is this way

- **Attachment bytes out of the store.** The store is now pushed to the cloud as a whole (R2). A BLOB in the store would sync, blowing the client's text-only, 5 GB rule (FR-039/FR-041/FR-042). Keeping only a reference keeps the synced copy small — and mirrors the future "reference synced, bytes stored cheaply elsewhere" module.
- **No cloud-only tables.** Because the *whole store* syncs, there is nothing to add for the cloud: the same `statements`/`bills`/`customers` rows are what travel. There is no shadow table, no mapping table and no change-queue table — conflict handling is the engine's (FR-019).
- **No `dirty`/sync bookkeeping in the store.** The un-pushed marker lives in `sync-state.json` beside `settings.json` (R8) so our own bookkeeping is not itself synced.

### 1.4 The additive migrations (… → 4 → 5)

Run on open while `user_version` is below the current version, inside one transaction, stamping `user_version` **last**:

1. **1 → 2 / 2 → 3 / 3 → 4**: unchanged from Module 3 (create tables, seed `next_invoice_no`, add `customers.password`, create `bill_wallets` and back-fill it).
2. **4 → 5 (new)**: for each existing `attachments` row, write its `data` BLOB to `attachments/<statement_id>.bin` beside the store (skip if the file already exists), then rebuild the table to the reference-only shape (§1.2) and copy the rows across. Idempotent: a row whose file already exists is left alone, and a re-run after an interruption completes the job.

Every step is idempotent, so an interrupted migration is completed by opening again. The R1 spike must confirm that the Turso engine performs the table rebuild, `PRAGMA table_info` and `PRAGMA user_version` write the migration depends on.

---

## 2. Files beside the store

| File | Where | Holds |
|---|---|---|
| `attachments/` folder | Beside the store file | One file per statement attachment, named `<statement_id>.bin` (R5). **Never synced.** |
| `sync-state.json` | `app.path().app_config_dir()`, beside `settings.json` | `{ "dirty": boolean, "lastPushedAt": string \| null }` — whether there are un-pushed changes and when the last push succeeded (R8). |
| `settings.json` | unchanged | The remembered store location only. |
| Windows Credential Manager *(not a file)* | The current Windows user's credential store | One generic credential per secret, under a fixed service prefix (for example `tax-statements-analysis/TURSO_AUTH_TOKEN`) (R4). **Never written to any file the application owns.** |

When the storage location changes, the carry-across moves **the store file and its `attachments/` folder together** (Module 2/3 carry extended); the empty-store check still counts records, not files.

---

## 3. Value types crossing the IPC boundary

These extend Module 3's `domain/types.ts`. Amounts still cross as major units; dates as ISO `YYYY-MM-DD` text.

```ts
// ---- new in Module 4 ------------------------------------------------------

/** Whether the secrets are set up, and whether un-pushed changes exist. */
export interface CloudStatus {
  configured: boolean;          // the secrets are present in the credential store (R4)
  hasUnpushed: boolean;         // the local dirty marker (R8)
  lastPushedAt: string | null;  // ISO timestamp, or null
  phase: CloudPhase;
}

export type CloudPhase = "idle" | "pushing" | "pulling";

/** What setup still needs; the application is usable only when both are true (FR-005). */
export interface SetupState {
  storageReady: boolean;        // a usable store has been chosen (Modules 1–3)
  secretsReady: boolean;        // the secrets are present in the credential store (R4)
}

/** The result of pasting an env file at onboarding (FR-044–FR-048). */
export interface SecretsPasteResult {
  ok: boolean;
  missing: string[];            // required keys that were absent or unreadable
  message: string;              // ready to show the practitioner
}

/** The one plain-language result of a Push or Sync (FR-033). */
export type SyncOutcomeKind =
  | "success"
  | "nothing-new"
  | "no-internet"
  | "secrets-unavailable"
  | "server-unavailable"
  | "other";

export interface SyncOutcome {
  kind: SyncOutcomeKind;
  message: string;              // ready to show the practitioner
  reason?: string | null;       // underlying detail for "other"
}

/** The result of one Push or Sync (progress precedes it, FR-036/FR-037). */
export interface SyncResult {
  outcome: SyncOutcome;
  changed: boolean;             // pull: did anything arrive? push: did anything send?
}

/** Turso Cloud storage headroom for the header gauge (FR-029–FR-032). */
export interface CloudUsage {
  usedBytes: number;
  allowanceBytes: number;       // the 5 GB allowance constant
  remainingBytes: number;
}
```

**Push/Sync return shape**: both `cloud_push` and `cloud_pull` return a `SyncResult`. A pull that brought changes also causes the `cloud://pulled` event (R9). `cloud_usage` returns `CloudUsage | null` (`null` = unavailable, FR-031).

---

## 4. Entity descriptions

### Local store (the synced database)

The one database file on each computer, holding statements, bills and customers. It is a **local-first Turso database** (R2): every read and write is local and fully usable offline; `push()`/`pull()` move changes through the central cloud copy. It remains the practitioner's working copy.

- **Lifecycle**: `created (schema migrated) ──used offline──▶ (unchanged) ──push()──▶ changes published ──pull()──▶ remote changes applied`. No operation requires the network.

### Attachment (re-shaped)

One file attached to a statement. Its **bytes** now live in the `attachments/` folder and its **reference row** lives in the store.

- **Attributes**: `statementId` (identity), `fileName`, `byteSize`, `relativePath`.
- **Invariant**: the row and the file agree; opening/saving a copy reads the file (R12). **Never synced** — the cloud copy never carries attachment bytes (FR-039/FR-041).
- **Lifecycle**: `added ──▶ opened/saved to disk ──▶ (statement deleted) removed with the statement`. Deleting a statement (not possible in the UI today) would remove the row by cascade and the file by the store layer.

### Central cloud copy

The single shared Turso Cloud database that every connected install syncs with (Clarifications Q1). It holds the **same text records** as each local store and has a finite allowance whose headroom the header shows. It is never the working copy.

### Cloud secrets

The connection details needed to reach the central copy and report its storage: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `TURSO_ORG`, `TURSO_DATABASE`, `TURSO_PLATFORM_TOKEN`.

- **Provenance**: the partner hands the practitioner an env file; the practitioner pastes its contents at onboarding, where it is parsed and validated (FR-044, FR-045, FR-048).
- **Home**: **Windows Credential Manager**, one generic credential per key under a fixed service prefix. Never in the store, `settings.json`, the installer, or any file the app writes (FR-046).
- **Read**: on demand, from the credential store, whenever the app syncs or asks for the storage figure (FR-047). Re-pasting replaces the values (FR-049).

### Setup gate

What must be satisfied before the application is usable (FR-005): `storageReady` (a usable store has been chosen — the existing Modules 1–3 gate) **and** `secretsReady` (the secrets are in the credential store). `SetupState` reports both; with either false, onboarding is shown instead of the application.

### Un-pushed changes

The fact that local writes have happened since the last successful push (R8). Drives the header's Push affordance and the close-time warning (FR-025).

### Sync outcome

The single plain-language result of a Push/Sync attempt — success, nothing new, no internet, secrets unavailable, server unavailable, or another failure (FR-033) — with nothing-new distinguished so a no-op is not mistaken for an error.

### Storage indicator / Progress indicator

As in the spec: the header's purple "Turso Cloud" gauge from the Usage API (R11), and the on-screen loader shown for the duration of an exchange and then replaced by the outcome (R10).

---

## 5. Carry-across (location change)

Extends Module 3's carry to move, in dependency order and each bill with its items in one transaction:

1. `customers` → 2. `bills` → 3. `bill_items` → 4. `bill_wallets` → 5. the `next_invoice_no` counter, and **now also 6. the `attachments/` folder** (copy the files and their reference rows; skip a statement whose file already exists in the destination).

A row already present in the destination is never altered, so the operation stays idempotent and resumable. Because the destination may be an existing store, a merge is required — copying the file wholesale is not possible.

---

## 6. Validation and enforcement

| Rule | Source FR | Enforcement |
|---|---|---|
| Every existing operation works offline | FR-001 | The Turso engine is local-first; no command requires the network |
| One central cloud; each computer its own store | FR-002 | All installs open a store against the same shared remote, read from the credential store (R2, R4) |
| Push does not alter local values | FR-008 | `push()` only transmits; the local rows are untouched |
| Push/Sync safe to repeat; no duplicates | FR-010, FR-015, FR-039 | The engine's own sync of the same rows; nothing app-level inserts copies |
| Conflicts settled by last push | FR-019, FR-043 | The engine's native rule; **no app merge code** |
| Deletions travel | FR-020 | A delete is an ordinary change the engine syncs |
| Malformed data cannot enter or publish | FR-011, FR-034 | Validation at the store boundary (Zod at the seam + `CHECK`/`NOT NULL` in the store) |
| Un-pushed changes detected | FR-025, FR-027 | The `sync-state.json` dirty marker, set on mutation, cleared on successful push (R8) |
| Closing never trapped | FR-028 | The close warning always offers "close anyway"; the changes stay local |
| Storage figure never wrong | FR-031 | `cloud_usage` returns `null` (unavailable) rather than a stale value when the API fails (R11) |
| Text-only cloud | FR-039, FR-041, FR-042 | Attachment bytes live outside the store (R5); no BLOB column exists |
| Setup requires the secrets | FR-005, FR-044, FR-047 | The `SetupState` gate; the application is not shown until `storageReady && secretsReady` |
| Env paste is validated | FR-045, FR-048 | Strict `KEY=VALUE` parse + a required-keys check; a bad paste saves nothing and names the problem |
| Secrets never reach a file the app owns | FR-046 | Only the credential-store writer touches them; nothing in `settings.json`, the store, or any file |
| Secrets are replaceable | FR-049 | Re-pasting overwrites the stored values |
| Amounts exact | SC-003 (Module 3) | Integer paisa throughout, unchanged |

---

## 7. Explicitly out of the model

- **Attachment bytes in the store or the cloud** — moved out at v5 (R5); files are the future module's subject.
- **Any change-queue, mapping or shadow table** — the whole store syncs and conflicts are the engine's (FR-019, FR-043).
- **A packaged or embedded credential** — the installer carries no secret; the values are pasted at onboarding and held in Windows Credential Manager (R4).
- **Server-side conflict UI** — last push wins, silently and deterministically (FR-019).
- **A general migration framework** — only the concrete additive steps are implemented, as in Module 3.
