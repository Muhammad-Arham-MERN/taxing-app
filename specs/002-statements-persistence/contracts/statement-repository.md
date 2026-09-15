# Contract: Data-Access Seam (Frontend Repository Interfaces)

**Feature**: `002-statements-persistence` | **Date**: 2026-09-14
**Location**: `tax-statements-analysis/src/data/repositories.ts`
**Implementations**: `src/data/in-memory.ts` (Module 1 — retained for tests) · `src/data/tauri.ts` (**Module 2 — the running application**)

---

## Why this contract exists, and what changed

Module 1 defined this seam with an in-memory implementation so the UI could behave end-to-end with no backend. Module 2 adds the real implementation behind the same interfaces. That was the entire point of the seam, and it is why **no component needs restructuring** — they already `await` everything and already depend on interfaces rather than implementations.

Two things do change:

1. **The interfaces grow.** Module 1 had no editing, no attachment retrieval and no storage-location concept, because Module 1 could not do any of them.
2. **`in-memory.ts` must implement the additions too.** It is the fixture Module 1's Vitest suite runs against. Adding a method to an interface without implementing it there would break the existing tests, which are the frontend's only automated coverage and must keep passing. The in-memory implementation does the minimum to satisfy the new methods; it is never wired into the running application.

**Rule for implementers, unchanged**: UI components MUST depend only on these interfaces (injected via `DataProvider`), never on a concrete implementation.

---

## `StatementRepository`

```ts
import type {
  AttachmentRef, NewStatement, Statement, StatementFilter, StatementUpdate,
} from "../domain/types";

export interface StatementRepository {
  /** Module 1, unchanged. Persist a new statement; returns the stored record. */
  create(input: NewStatement): Promise<Statement>;

  /** Module 1, unchanged. Statements whose `date` is within [from, to], inclusive, newest first. */
  findByDateRange(filter: StatementFilter): Promise<Statement[]>;

  /** Module 1, unchanged. Every statement, newest first. */
  listAll(): Promise<Statement[]>;

  /** NEW. Update a stored statement in place; never creates a second record (FR-042). */
  update(update: StatementUpdate): Promise<Statement>;

  /** NEW. The exact stored contents of one statement's attachment (FR-036, FR-037). */
  getAttachment(statementId: string): Promise<AttachmentRef>;

  /** NEW. Write the attachment out and hand it to the OS (FR-065–FR-071). */
  openAttachment(statementId: string): Promise<void>;

  /** NEW. Save a copy of the attachment to a destination the practitioner picks (FR-072). */
  saveAttachmentCopy(statementId: string): Promise<string | null>;
}
```

### `create(input)`

Unchanged from Module 1. **Postcondition strengthened**: the record is durable before the promise resolves, and an interruption cannot leave a partial record (FR-005). The `DuplicateSubmissionError` guarantee (FR-007) moves from an in-process guard to the store, where it survives a restart.

### `findByDateRange(filter)`

Unchanged from Module 1 in signature, ordering and error behaviour. **Two guarantees are now real rather than theoretical**: the results are durable (FR-004), and no attachment contents are transported — the underlying query never reads the blob column (FR-029, SC-011). Callers may assume `fileName` is present but never the file itself.

### `update(update)`

- **Input**: `StatementUpdate` — `{ id, date, type, nature, amount, remarks, attachment }`, where `attachment` is `{ action: "keep" }`, `{ action: "remove" }`, or `{ action: "replace", fileName, bytes }`.
- **Output**: the stored `Statement` after the edit.
- **Postconditions**: the same `id` still exists exactly once — no additional record (FR-042, SC-008). With `keep`, the stored file is byte-identical to before (FR-033, FR-047). The change is durable across restarts (FR-043).
- **Errors**: `ValidationError` (same rules as creation, FR-044) · `UnknownStatementError` · `StoreWriteFailedError`.
- **Note for UI**: `keep` must be the default action when the practitioner only edits fields. Sending `replace` with re-read bytes would rewrite the blob for no reason, which FR-047 forbids in spirit if not in letter.

### `getAttachment(statementId)`

- **Output**: `{ fileName, bytes }` — complete and unchanged, for exactly one statement (FR-036).
- **Errors**: `UnknownStatementError` · `AttachmentMissingError` when the statement has no file.
- **Postcondition that matters**: fetching one statement's file must not load any other statement's file (FR-037). No bulk or "all attachments" method exists on this interface, deliberately.
- **Note**: the running UI does not call this for open/save — those go through the two methods below so large payloads stay on the Rust side. It exists because the capability is required, and it is what a viewer or exporter added later would build on.

### `openAttachment(statementId)`

- **Postconditions**: the file opens in the practitioner's preferred application for that type; the stored attachment and its statement are unchanged (SC-024).
- **Errors**: `AttachmentMissingError` · `AttachmentWriteFailedError` · `AttachmentOpenFailedError`.
- **UI obligation**: on `AttachmentOpenFailedError` the save action must remain available (FR-075). The UI must not treat a failed open as a dead end.

### `saveAttachmentCopy(statementId)`

- **Output**: the destination path, or `null` if the practitioner cancelled the prompt.
- **Postconditions**: the saved copy is identical to the stored attachment (SC-025); the store is unchanged and the application does not begin managing the copy (FR-073).

---

## `StorageRepository` (new)

The gate and the location lifecycle. Kept separate from `StatementRepository` because it has a different lifetime: it is consulted before any statement can be read or written.

```ts
export interface StorageRepository {
  /** Current state, including why an existing location is unusable. Drives the gate (FR-013–FR-015). */
  getState(): Promise<StorageState>;

  /** Open the OS folder picker. Resolves null when cancelled (FR-014, FR-024). */
  pickDirectory(): Promise<string | null>;

  /** Open the OS file picker to point at an existing store file (FR-057). */
  pickStoreFile(): Promise<string | null>;

  /** Inspect a candidate before accepting it: our store? risky location? empty? (FR-055, FR-059, FR-064). */
  assess(kind: "directory" | "file", path: string): Promise<LocationAssessment>;

  /** Commit the choice, and decide what happens to the records already in use (FR-019, FR-020). */
  setLocation(
    kind: "directory" | "file",
    path: string,
    carryAcross: CarryAcrossChoice,
  ): Promise<StorageState>;
}
```

**Ordering rule (FR-055, FR-061)**: the UI must call `assess` before `setLocation`. A warning returned by `assess` must be shown and confirmed before `setLocation` is called; a rejection means `setLocation` must not be called at all, and the practitioner stays exactly where they were.

**Gate rule (FR-015)**: while `getState().chosen` is `false`, `DataProvider` must not render the Create or View surfaces at all — not merely disable their buttons. There must be no path to `create` or `findByDateRange` before a location exists.

**Cancellation rule (FR-024)**: `pickDirectory` and `pickStoreFile` resolving `null` means nothing happened. The UI must not call `assess` or `setLocation` on `null`, and if no location existed before, the application remains unavailable.

---

## `BusinessProfileRepository` — removed

Module 1's interface is deleted, along with `SettingsDialog.tsx`. The header's brand name, location and contacts are fixed built-in values that cannot be updated (FR-053), so there is nothing to get or save. `DataProvider` no longer injects it, and the header renders from a constant.

---

## Injection

`DataProvider` injects `{ statements: new TauriStatementRepository(), storage: new TauriStorageRepository() }` in the running application, and the in-memory equivalents under test. Components never import `tauri.ts` directly.

---

## Contract test cases

Module 1's cases C-01 to C-09 (in the Module 1 contract) still apply and must keep passing against `in-memory.ts`. New cases below are stated as acceptance checks rather than Vitest cases, because the Tauri implementation requires a real webview and a real store; per the developer's direction there are no automated backend tests, so these are exercised end to end. Cases marked *(memory)* are worth adding to the existing suite because the in-memory implementation also changes.

| # | Case | Expected |
|---|------|----------|
| C-10 | `update` a stored statement's fields with `action: "keep"` | same `id`; no second record; values changed; durable after restart (FR-042, FR-043) |
| C-11 | `update` with `action: "remove"` | statement stored with no file; File column reads "None" (FR-040) |
| C-12 | `update` with `action: "replace"` | new name and contents stored; previous file no longer attached (FR-041) |
| C-13 | `update` that leaves the record invalid *(memory)* | rejects with `ValidationError`; stored record unchanged (FR-044) |
| C-14 | `update` that abandons before saving *(memory)* | stored record exactly as before (FR-046) |
| C-15 | `update` moving a date outside the shown range, then `findByDateRange` | the row no longer appears; totals exclude it (FR-048) |
| C-16 | `findByDateRange` over statements carrying large attachments | resolves without reading any file contents (FR-029, SC-011) |
| C-17 | `getAttachment` for a statement with no file | rejects with `AttachmentMissingError`; no other statement's file is read (FR-037) |
| C-18 | `getAttachment` then compare bytes to what was attached | byte-identical (SC-003) |
| C-19 | `getState` with no `settings.json` *(memory)* | `{ chosen: false, location: null, problem: null }` (FR-015) |
| C-20 | `setLocation` carrying records into a store that already holds them | 0 duplicates, 0 overwrites; totals correct (FR-063, SC-021) |
| C-21 | `setLocation` with `start-fresh` | new location holds none of the previous records; previous store file still exists (FR-020, FR-022) |
| C-22 | `assess` on a file that is not this application's store | `acceptable: false` with a reason; file bytes unchanged (FR-060, SC-020) |
| C-23 | `assess` on a valid but empty store file | `acceptable: true`, `isEmptyStore: true` (FR-064) |
| C-24 | `assess` on a cloud-synced, network or removable folder | `acceptable: true` with the matching `warning` (FR-055, SC-017) |
| C-25 | `pickDirectory` cancelled at first run *(memory)* | resolves `null`; state still `chosen: false`; nothing else available (FR-024) |
