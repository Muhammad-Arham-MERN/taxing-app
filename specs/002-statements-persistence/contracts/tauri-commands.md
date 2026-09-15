# Contract: Tauri Command Surface (Module 2 — implemented)

**Feature**: `002-statements-persistence` | **Date**: 2026-09-14
**Location**: `tax-statements-analysis/src-tauri/src/commands/`
**Status**: ✅ **Implemented by this module.** This supersedes Module 1's document of the same name, which was a deferred sketch.

---

## Relationship to Module 1's sketch

| Module 1 sketch | Module 2 reality |
|---|---|
| `create_statement`, `list_statements` | Kept — same names, same shapes. |
| `get_business_profile`, `save_business_profile` | **Dropped.** The header's brand name, location and contacts are fixed built-in values that cannot be updated (FR-053), so there is nothing to persist. |
| "Statement files copied into an app-managed folder; `fileRef` holds the relative path" | **Superseded.** Attachment contents are stored as BLOBs inside the store, and `fileRef` stays `null` (FR-003, FR-011). |
| "SQLite database file in the OS app-data directory" | **Superseded.** The practitioner chooses the location; nothing is chosen for them (FR-013, FR-014). |
| — | New: editing, location management, carry-across, and attachment open/save. |

All commands are invoked from the frontend through `invoke()` from `@tauri-apps/api/core`, with `serde`-serialised payloads. Rust command and argument names are `snake_case`; JS keys are camelCase and Tauri performs the mapping.

---

## 1. Storage location and the gate

### `get_storage_state`

- **Request**: none.
- **Response**: `StorageState` — `{ chosen, location, problem }`.
- **Purpose**: drives the gate. Called on startup; while `chosen` is `false` the frontend must expose no other capability (FR-015, SC-006).
- **Errors**: none. Problems are reported *inside* `problem` (`"unreachable"`, `"not-a-store"`, `"damaged"`, `"unwritable"`) rather than as a rejection, because the frontend must render them as a state, not a failure (FR-023, FR-025, FR-056).

### `pick_directory`

- **Request**: none.
- **Response**: `string | null` — the chosen folder path, or `null` if the practitioner cancelled.
- **Purpose**: opens the OS folder picker from Rust. Nothing is pre-selected (FR-014).
- **Errors**: `IoError`.
- **Note**: cancelling returns `null`; the caller must treat that as "nothing changed" (FR-024).

### `pick_store_file`

- **Request**: none.
- **Response**: `string | null` — the chosen file path, or `null` if cancelled.
- **Purpose**: opens the OS file picker so the practitioner can point at a store file they already hold (FR-057).
- **Errors**: `IoError`.

### `assess_location`

- **Request**: `{ kind: "directory" | "file", path: string }`.
- **Response**: `LocationAssessment` — `{ acceptable, warning, rejection, isEmptyStore }`.
- **Purpose**: everything that must be known *before* a location is accepted, in one round trip: whether a file is genuinely this application's store (FR-059), why not if it is not (FR-060), whether the folder is cloud-synced / on a network share / removable so the warning can be shown first (FR-055), and whether a valid store is simply empty (FR-064).
- **Postconditions**: **read-only.** No write handle is opened on the path, so a rejected file is left byte-for-byte unchanged (FR-060, SC-020).
- **Errors**: none for a bad file — rejection is a normal outcome carried in `rejection`. `IoError` only when the path cannot be inspected at all.

### `set_storage_location`

- **Request**: `{ kind: "directory" | "file", path: string, carryAcross: "bring" | "start-fresh" }`.
- **Response**: `StorageState` (the new state).
- **Purpose**: commits the choice — creates the store in a chosen folder (FR-016), or adopts an existing store file (FR-062) — and, when a store is already in use, either carries the previous records into it or deliberately leaves them behind (FR-019, FR-020).
- **Preconditions**: the caller has already called `assess_location` and, where a warning was returned, the practitioner has confirmed (FR-055). Calling this on a file the assessment rejected is an error, not a silent accept.
- **Postconditions**: `get_storage_state` reports the new location. The previously used store file still exists and is unmodified in every case (FR-022). The new location is remembered (FR-017).
- **Errors**: `NotAStoreError { reason }` · `StoreDamagedError` · `LocationUnwritableError` · `InvalidCarryAcrossError` (a `carryAcross` choice supplied when no store was in use) · `CarryAcrossInterruptedError { copied, remaining }` (FR-021 — the store in use is left usable, and the operation is safe to repeat).
- **Idempotency**: repeating a carry-across is safe. A statement already present in the destination is skipped and never altered (FR-063, SC-021), so an interrupted run is resumed by simply running it again.

---

## 2. Statements

### `create_statement`

- **Request**: `{ input: NewStatement }` — `{ date, type, nature, amount, remarks, fileName, fileRef }`.
- **Response**: the stored `Statement`, with the assigned `id` and `createdAt`.
- **Errors**: `ValidationError { fields }` · `DuplicateSubmissionError` · `NoStorageLocationError` · `StoreWriteFailedError`.
- **Postconditions**: written in a single transaction together with the attachment; an interruption leaves no partial statement (FR-005). On failure the caller must not report success nor reset the form (FR-006).

### `list_statements`

- **Request**: `{ from: string, to: string }` (ISO `YYYY-MM-DD`, inclusive).
- **Response**: `Statement[]`, newest first, ties broken by `createdAt`.
- **Errors**: `InvalidRangeError` when `from > to` (FR-034).
- **Guarantee**: **no attachment contents are read**, not merely "not returned" — the query never selects the blob column, so a range review stays fast however large the attachments are (FR-029, FR-030, SC-011, SC-015). Each row carries `fileName` only.

### `update_statement`

- **Request**: `{ update: StatementUpdate }` — the statement's identity plus the fields that may change, and an `attachment` action of `keep` / `remove` / `replace`.
- **Response**: the stored `Statement` after the edit.
- **Errors**: `ValidationError { fields }` · `UnknownStatementError` · `StoreWriteFailedError`.
- **Postconditions**: exactly one row with that `id` exists afterwards — an edit never adds a record (FR-042, SC-008). With `keep`, the stored blob is untouched and byte-identical (FR-033, FR-047). `updatedAt` advances.

### `get_attachment` — REMOVED (2026-09-15)

**This command does not exist.** It was specified as a primitive for FR-036/FR-037 and
then dropped during implementation, because nothing needed it: opening and saving a file
both run entirely inside Rust and return no contents. Removing it means **a file never
crosses the IPC boundary on the way out at all**.

Its requirement is met by `open_attachment` and `save_attachment_copy` below, which fetch
exactly one statement's file and hand it straight to the operating system or to disk.

### How files cross the boundary (added 2026-09-15)

Attachment contents are never JSON-encoded in **either** direction:

- **Into Rust** — `create_statement` and `update_statement` accept the bytes as a **raw
  request body**, with the statement's own fields in an `x-statement-meta` header:
  ```ts
  await invoke("create_statement", attachment.bytes, {
    headers: { "x-statement-meta": JSON.stringify({ input, fileName }) },
  });
  ```
  With no file attached, the call is ordinary JSON, because there is nothing to protect.
  `AttachmentAction::Replace` therefore carries only the file's **name**; its bytes arrive
  in the body.
- **Out of Rust** — not at all. No command returns file contents.

Sending them as JSON would turn each byte into a decimal number and inflate a 50 MB scan
into roughly 200 MB of text travelling through the webview.

---

## 3. Attachments

### `open_attachment`

- **Request**: `{ statementId: string }`.
- **Response**: nothing on success.
- **Purpose**: implements FR-065–FR-071 — writes the attachment to a temporary file in the application's per-run folder, then hands that path to the OS so it opens in the practitioner's preferred application.
- **Postconditions**: the stored attachment is unchanged (FR-073, SC-024). The temporary copy is complete and identical to what was attached, and carries the original name and extension (FR-068, FR-074).
- **Errors**: `AttachmentMissingError` · `AttachmentWriteFailedError { reason }` (temporary folder full or unwritable) · `AttachmentOpenFailedError { reason }` (nothing registered for the type — Windows returns `SE_ERR_NOASSOC`).
- **On failure**: the practitioner must be told plainly **and** still be able to save a copy instead (FR-075), so the UI must keep the save action available independent of this command's outcome.
- **Security note**: every type is opened, including executables, with no warning from the application (FR-071 — the developer's deliberate decision of 2026-09-14, recorded in the spec's assumptions and risks).

### `save_attachment_copy`

- **Request**: `{ statementId: string }`.
- **Response**: `string | null` — the destination path written, or `null` if the practitioner cancelled the save prompt.
- **Purpose**: implements FR-072 — the OS save prompt with the original file name offered by default, then the copy written there.
- **Postconditions**: the stored attachment is unchanged, and the application does not begin managing the saved copy (FR-073). The saved copy is identical to the stored one (FR-074, SC-025).
- **Errors**: `AttachmentMissingError` · `AttachmentWriteFailedError { reason }`.

---

## 4. Error taxonomy

One serialisable enum, so the frontend can map every failure to a defined message rather than parsing strings.

| Error | Raised by | UI behaviour |
|---|---|---|
| `ValidationError { fields }` | `create_statement`, `update_statement` | Inline field messages; nothing written (FR-044). |
| `DuplicateSubmissionError` | `create_statement` | Submit stays disabled; exactly one record (FR-007). |
| `InvalidRangeError` | `list_statements` | Range marked invalid; no rows, zero totals (FR-034). |
| `NoStorageLocationError` | any data command | Gate shown; the operation is unavailable (FR-015). |
| `LocationUnreachableError` | any data command | Reported; never silently replaced by an empty store (FR-025). |
| `StoreDamagedError` | store open | Reported; file left untouched (FR-056). |
| `NotAStoreError { reason }` | `set_storage_location` | Rejection explained; the file is untouched and the current store is unchanged (FR-060, FR-061). |
| `LocationUnwritableError` | `set_storage_location` | Explained; the location already in use continues (FR-023). |
| `StoreWriteFailedError` | `create_statement`, `update_statement` | Told it was not saved; form not reset; stored record unchanged (FR-006, FR-049). |
| `UnknownStatementError` | `update_statement`, attachment commands | The list is refreshed; the record no longer exists. |
| `AttachmentMissingError` | attachment commands | "None" remains shown; no request is made (no-attachment case). |
| `AttachmentWriteFailedError { reason }` | attachment commands | Explained; store untouched. |
| `AttachmentOpenFailedError { reason }` | `open_attachment` | Explained; saving a copy still offered (FR-075). |
| `CarryAcrossInterruptedError { copied, remaining }` | `set_storage_location` | Explained; the previous store is intact and the move can be run again (FR-021). |
| `IoError { message }` | pickers, assessment | Explained; nothing changed. |

---

## 5. Registration and capabilities

```rust
// src-tauri/src/lib.rs — order matters: single instance must be first.
let mut builder = tauri::Builder::default();

#[cfg(desktop)]
{
    builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }
    }));
}

builder
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_opener::init())
    .invoke_handler(tauri::generate_handler![
        get_storage_state,
        pick_directory,
        pick_store_file,
        assess_location,
        set_storage_location,
        create_statement,
        list_statements,
        update_statement,
        get_attachment,
        open_attachment,
        save_attachment_copy,
    ])
    .run(tauri::generate_context!())
```

**Capabilities (`src-tauri/capabilities/default.json`)**: **no new entries are required.** Capability permissions gate the JS→Rust plugin commands, and this design drives both the dialog plugin and the opener from **Rust**, inside the application's own commands. In particular `opener:allow-open-path` is *not* needed, because `openPath` is never called from JS — opening happens in `open_attachment`. Add `dialog:default` only if a picker is later driven from the frontend.

**Consequence worth keeping**: the frontend never receives a general-purpose "open this path" or "show me a file dialog" capability. It can only ask the backend to open *an attachment of a statement*, which is a materially smaller surface.
