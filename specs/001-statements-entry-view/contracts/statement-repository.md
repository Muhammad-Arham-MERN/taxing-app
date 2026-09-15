# Contract: Data-Access Seam (Frontend Repository Interfaces)

**Feature**: `001-statements-entry-view` | **Date**: 2026-09-13
**Location**: `tax-statements-analysis/src/data/repositories.ts`
**Implementations**: `src/data/in-memory.ts` (Module 1, shipped) · future `src/data/tauri.ts` (Module 2)

---

## Why this contract exists

The spec forbids backend/storage work in Module 1, but the UI must behave end-to-end. This seam is the single boundary between UI and data. Every repository method is **`async`/`Promise`-returning even though the in-memory implementation resolves immediately** — this is deliberate: when the Tauri/SQLite implementation lands, components already `await` and need no change.

**Rule for implementers**: UI components MUST depend only on these interfaces (injected via `DataProvider`), never on a concrete implementation.

---

## `StatementRepository`

```ts
import type { NewStatement, Statement, StatementFilter } from "../domain/types";

export interface StatementRepository {
  /** Persist a new statement and return the stored record (with generated id/createdAt). */
  create(input: NewStatement): Promise<Statement>;

  /** All statements whose `date` is within [filter.from, filter.to], inclusive. */
  findByDateRange(filter: StatementFilter): Promise<Statement[]>;

  /** Every statement, newest first (diagnostics / future use). */
  listAll(): Promise<Statement[]>;
}
```

### `create(input)`

- **Input**: `NewStatement` — the validated form values: `{ date, type, nature, amount, remarks, fileName, fileRef }`.
- **Output**: the stored `Statement`, including server-side-assigned `id` and `createdAt`.
- **Errors**: `ValidationError` when input violates `domain/validation.ts`; `DuplicateSubmissionError` when an identical submission arrives while one is in flight (FR-016).
- **Preconditions**: caller has already validated with the shared zod schema (FR-013).
- **Postcondition**: the new statement is visible to `findByDateRange` (FR-014).

### `findByDateRange(filter)`

- **Input**: `StatementFilter` `{ from, to }`, both ISO `YYYY-MM-DD`.
- **Output**: statements with `filter.from <= date <= filter.to`, inclusive of both bounds (FR-018). Empty array when none match (FR-023).
- **Errors**: `InvalidRangeError` when `from > to` (FR-024).
- **Ordering**: most recent `date` first; `createdAt` breaks ties.
- **Result count**: unbounded — the UI paginates for display (research R6). Totals are computed over the full array, not the visible page.

### `listAll()`

- **Output**: every stored statement, newest first.
- **Use**: development/debug and future analytics; not used by the Module 1 UI directly.

---

## `BusinessProfileRepository`

```ts
export interface BusinessProfileRepository {
  /** Return the saved profile, or the default identity when none was ever saved (FR-028). */
  get(): Promise<BusinessProfile>;

  /** Persist the edited profile (FR-026, FR-027). */
  save(profile: BusinessProfile): Promise<BusinessProfile>;
}
```

- **`get()`**: never rejects for "no profile" — returns the default identity from `data-model.md`.
- **`save(profile)`**: replaces the stored profile; output is the persisted value; the UI re-renders the header from it immediately (FR-027).
- **Note**: Module 1's in-memory implementation does **not** survive an app restart. Cross-restart retention (FR-027, SC-006) is a property of the Module 2 persistence implementation; the contract requires it, Module 1 cannot demonstrate it.

---

## Error taxonomy

| Error | Raised by | UI behavior |
|-------|-----------|-------------|
| `ValidationError` | `create` | Inline field messages; statement not recorded (FR-013). |
| `DuplicateSubmissionError` | `create` | Submit stays disabled / no second record created (FR-016). |
| `InvalidRangeError` | `findByDateRange` | Range marked invalid; no rows, no totals (FR-024). |

`ValidationError` carries a field-keyed map (`{ [field]: message }`) so the form can surface messages next to inputs.

---

## Contract test cases (Vitest, run against the in-memory implementation)

| # | Case | Expected |
|---|------|----------|
| C-01 | `create` with valid input | resolves to a `Statement` with non-empty `id` and `createdAt` |
| C-02 | `create` then `findByDateRange` covering that date | created statement is present |
| C-03 | `findByDateRange` with bounds equal to a statement's date | statement is included (inclusive bounds) |
| C-04 | `findByDateRange` with `from > to` | rejects with `InvalidRangeError` |
| C-05 | `findByDateRange` on an empty range | resolves to `[]` |
| C-06 | `create` with `remarks`/`fileName` omitted | stored as `null` (renders `"None"`) |
| C-07 | `get()` on a fresh store | returns the default business identity |
| C-08 | `save()` then `get()` | returns the saved profile |
| C-09 | two `create` calls with identical payload rapidly | second rejects with `DuplicateSubmissionError` |
