# Contract: Tauri Command Surface (DEFERRED — not implemented in Module 1)

**Feature**: `001-statements-entry-view` | **Date**: 2026-09-13
**Status**: 🔶 **Specified only.** No Rust code is written in this module. `src-tauri/` remains the generated scaffold.

---

## Purpose

This documents the Rust/IPC surface that the **future backend module** will implement so that persistence and date-processing live in Rust/SQLite. It exists now so that:

1. Module 2 has a precise integration target.
2. The frontend repository seam (`contracts/statement-repository.md`) can be backed by a `TauriStatementRepository` that maps 1:1 onto these commands.

Implementing any of these in Module 1 would violate the spec's explicit "no backend/processing logic" boundary.

---

## Commands

All commands are invoked from the frontend via `invoke()` from `@tauri-apps/api/core` and use `serde`-serialized payloads. Names use `snake_case` on the Rust side; arguments arrive as a camelCase-keyed object from JS.

### `create_statement`

- **Request**: `{ input: NewStatement }` — the same shape as `Statement` minus `id`/`createdAt`.
- **Response**: `Statement` (with generated `id`, `createdAt`).
- **Errors**: `ValidationError { fields: Record<string, string> }`; `DuplicateSubmissionError`.

### `list_statements`

- **Request**: `{ from: string, to: string }` (ISO `YYYY-MM-DD`, inclusive).
- **Response**: `Statement[]`, newest first.
- **Errors**: `InvalidRangeError` when `from > to`.

### `get_business_profile`

- **Request**: none.
- **Response**: `BusinessProfile`; returns the seeded default identity when no profile row exists.

### `save_business_profile`

- **Request**: `{ profile: BusinessProfile }`.
- **Response**: `BusinessProfile` (persisted).

---

## Non-functional expectations for the implementation (Module 2)

| Concern | Expectation |
|---------|-------------|
| Storage | Local SQLite database file in the OS app-data directory; no network. |
| Dates | Stored as ISO `YYYY-MM-DD` text; range filtering must be inclusive and correct across month/year boundaries. |
| Amounts | Stored as integer minor units (paisa) or `NUMERIC` to avoid float drift (SC-003). |
| Files | Statement files copied into an app-managed folder; `fileRef` holds the relative path. |
| Performance | `list_statements` over thousands of rows returns in time to keep the UI under the 2s target (SC-002). |
| Concurrency | Single user; a pending-submit guard prevents duplicate inserts (FR-016). |

---

## Registration (future)

```rust
.invoke_handler(tauri::generate_handler![
    create_statement,
    list_statements,
    get_business_profile,
    save_business_profile,
])
```

Required Tauri v2 capability permissions (`src-tauri/capabilities/default.json`) will need to allow these commands; no changes are made in Module 1, where `lib.rs` still exposes only the scaffold's `greet`.
