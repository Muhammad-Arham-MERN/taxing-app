# Contract: Tauri Command Surface (Module 4 — Cloud Sync)

**Feature**: `004-cloud-sync` | **Date**: 2026-10-15
**Location**: `tax-statements-analysis/src-tauri/src/commands/`
**Extends**: Modules 2 and 3's command surface. Every Module 2/3 command keeps its name, arguments and observable behaviour; this module makes them **async** (R3) and re-points the store at the Turso engine (R2), which is not visible in the arguments or results.

All commands are invoked from the frontend through `invoke()` from `@tauri-apps/api/core`. Rust command and argument names are `snake_case`; JS keys are camelCase. Every command that touches the store goes through `AppState::with_connection` (now `async`), so the storage gate applies unchanged.

---

## 1. Cloud commands (new)

### `cloud_status`

- **Request**: none.
- **Response**: `CloudStatus` — `{ configured, hasUnpushed, lastPushedAt, phase }` (data-model §3).
- **Purpose**: drives the header's Push/Sync affordances, the progress indicator's initial state and the close-time check. Reads the credential store (R4) and the local dirty marker (R8) — it never touches the network.
- **Errors**: `NoStorageLocationError` only when there is no usable store.

### `cloud_push`

- **Request**: none.
- **Response**: `SyncResult` — `{ outcome, changed }`.
- **Behaviour**: on the `Synced` engine, `db.push().await`; classify the result (R7). If nothing was sent, `outcome.kind = "nothing-new"`. On success, **clear the dirty marker** and record `lastPushedAt` (R8). A push reports `secrets-unavailable` when the credential store holds none (FR-005, FR-047), and never runs while a write transaction is open (R7).
- **Outcomes**: `success` · `nothing-new` · `no-internet` · `secrets-unavailable` · `server-unavailable` · `other`.
- **Postconditions**: local values are unchanged (FR-008); the central copy now holds this computer's changes.
- **Errors**: the outcome is carried in the response for the ordinary sync failures (so the UI can render one plain-language line, FR-033); only structural failures (`NoStorageLocationError`) are raised as errors.

### `cloud_pull`

- **Request**: none.
- **Response**: `SyncResult` — `{ outcome, changed }`, where `changed` is `pull()`'s boolean.
- **Behaviour**: on the `Synced` engine, `db.pull().await`; classify the result (R7). When `changed` is true the engine has already applied the remote changes to the local store; the command does not re-write them. **Does not clear the dirty marker** (a pull never publishes local work).
- **Outcomes**: `success` · `nothing-new` · `no-internet` · `secrets-unavailable` · `server-unavailable` · `other`.
- **Postconditions**: remote changes are present locally and persist across a restart (FR-016/FR-017).
- **Errors**: as `cloud_push`.

### `cloud_usage`

- **Request**: none.
- **Response**: `CloudUsage | null` — `{ usedBytes, allowanceBytes, remainingBytes }`, or `null` when the figure cannot be retrieved (FR-031).
- **Behaviour**: calls the Turso Usage API for the org/database held in the credential store (R11), reading `database.total.storage_bytes`; computes remaining against the allowance constant.
- **Errors**: never raised for "unavailable" — returns `null` instead, so the gauge can show *unavailable* rather than a wrong number.

### `get_setup_state`

- **Request**: none.
- **Response**: `SetupState` — `{ storageReady, secretsReady }` (data-model §3).
- **Purpose**: the frontend setup gate. `storageReady` is the existing store gate; `secretsReady` is whether the credential store holds the secrets. The application's normal screens are not shown until both are true (FR-005).
- **Errors**: none — it reports state, it does not fail.

### `save_secrets`

- **Request**: `{ text: string }` — the pasted contents of the partner's env file.
- **Response**: `SecretsPasteResult` — `{ ok, missing, message }`.
- **Behaviour**: parse strictly (`KEY=VALUE`; blank lines and `#` comments ignored), check the required keys (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `TURSO_ORG`, `TURSO_DATABASE`, `TURSO_PLATFORM_TOKEN`), and on success write each value to **Windows Credential Manager** (FR-044–FR-046). On a parse failure or a missing key, save nothing and name the problem (FR-048). A second call replaces the stored values (FR-049).
- **Errors**: `SecretsStoreUnavailableError` when Windows Credential Manager cannot be written.
- **Postconditions**: 0 values are written to any file the application owns; each is readable back from the credential store.

### `clear_secrets` *(optional, used by a deliberate reset only)*

- **Request**: none.
- **Response**: nothing.
- **Purpose**: remove the stored secrets; not offered in the ordinary UI.

### Event `cloud://pulled` (emitted, not invoked)

- **Payload**: none (or `{ changed: true }`).
- **Emitted by**: the background sync task (R9) after an **automatic** pull that changed something.
- **Consumer**: `useCloudSync` bumps the app's existing `refreshKey`, so the Statements/Bills lists reload. Manual pushes/pulls report through their return value instead.

---

## 2. Changes to existing commands

| Command | Change |
|---|---|
| all store commands | Become `async` (R3). Names, arguments, results and error kinds are unchanged. |
| store open / verify (internal) | Opens through the Turso engine (R2) with `bootstrap_if_empty(false)`; verification and the additive migrations run against it (data-model §1.4). |
| `assess_location` / `set_storage_location` | Carry-across now also moves the `attachments/` folder (data-model §5); the empty-store check is unchanged. |
| `open_attachment` / `save_attachment_copy` | Read bytes from the `attachments/` folder via the reference row (R12) instead of from a BLOB; the temp-write/opener/dialog behaviour is identical. |
| `create_/update_/delete_`, `create_bill` etc. | Additionally set the local dirty marker on success (R8). Behaviour otherwise unchanged. |

---

## 3. Error taxonomy (additions)

One serialisable enum already exists (`commands::error::ErrorKind`). Most cloud failures are **not** errors — they are `SyncOutcome` values in the response — so the enum gains little. The additions are:

| Error | Raised by | UI behaviour |
|---|---|---|
| `NoStorageLocationError` | all cloud commands | Unchanged from Module 2: nothing to sync until a store exists. |
| `SecretsStoreUnavailableError` | `save_secrets`, and the cloud commands when Windows Credential Manager cannot be read | Explained to the practitioner; the setup gate keeps them in onboarding until it works. |

Everything else (no internet, server unavailable, other) is a `SyncOutcome` in the response so the frontend renders exactly one message per attempt (FR-033).

---

## 4. Registration

New commands are appended to `generate_handler!` in `src-tauri/src/lib.rs`; plugin order is unchanged. In `setup`, after the store is opened, the background sync task is spawned (R9).

```rust
tauri::generate_handler![
    // … existing Module 1/2/3 commands (now async) …
    commands::cloud::cloud_status,
    commands::cloud::cloud_push,
    commands::cloud::cloud_pull,
    commands::cloud::cloud_usage,
    commands::onboarding::get_setup_state,
    commands::onboarding::save_secrets,
]
```

**Capabilities (`src-tauri/capabilities/default.json`)**: **no new entries for the sync itself** — Turso sync and the Usage API run from Rust. The close-time warning (R6) uses the webview's window hook; the only capability it may need is the window close/destroy permission, added **only** if the chosen approach requires it and no more.
