# Phase 0 Research: Offline Work — Communicate Live (Cloud Sync)

**Feature**: `004-cloud-sync` | **Date**: 2026-10-15 | **Plan**: [plan.md](./plan.md)

Every unknown in the plan's Technical Context is resolved below, each as **Decision / Rationale / Alternatives considered**. Version figures are the published stable versions at research time and must be pinned by `Cargo.lock`.

The one item that is *not* fully resolved here is **R1**, which is deliberately a **spike to be run first**: it verifies the Turso engine against the existing schema before any migration is written, and it has a documented fallback.

---

## R1 — Does the Turso engine match the existing schema? (spike-gated)

**Decision**: Before any migration is written, run a **throwaway spike** that opens a **copy** of a real `tax-statements.sqlite` with the `turso` crate and exercises exactly the SQLite features the store depends on:

1. `PRAGMA application_id` / `PRAGMA user_version` read **and write** (the store's identity stamp and schema version, Module 2 R6).
2. `STRICT` tables (every table in the store).
3. `CHECK (kind IN (...))`, `CHECK (amount_minor > 0)`, `NOT NULL`, `UNIQUE` — the store's constraints.
4. `COLLATE NOCASE` primary keys and foreign-key matching (the customer key).
5. `FOREIGN KEY ... ON DELETE CASCADE` (bill items), and `PRAGMA foreign_keys = ON`.
6. `PRAGMA table_info` (used by the v2→v3 migration guard).
7. `GROUP_CONCAT`, `SUM`, `ORDER BY` (the View Bills/Statements list queries).
8. A statement + bill + customer round trip through the Turso API.
9. The async API surface: `conn.execute`, `conn.query`, `conn.transaction`, `Value` conversion for `TEXT`/`INTEGER`.

**Gate**: if any of these behaves differently or is unsupported, **stop** and take the fallback in Objection 2(b) of the plan (keep `rusqlite`, add a Turso exchange database + change queue + app-side merge) rather than forcing the swap.

**Rationale**: The Turso engine ("the next evolution of SQLite", a ground-up rewrite) advertises SQLite compatibility and a `rusqlite`-like API, but "compatible" is not a guarantee of parity for every DDL feature this store uses — `STRICT`, `PRAGMA` identity, partial-index-less constraints, `COLLATE NOCASE` FK matching. Those are precisely the features that make the store safe, and a silent difference would be a corruption path. Proving them on a copy first costs a day and de-risks the whole module. This is the module's clearest **crux** and the spike carries the `وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ` marker in the eventual code.

**Alternatives considered**:
- *Skip the spike and swap straight away* — if parity fails after the rewrite, the effort is stranded. Rejected.
- *Assume parity because "it's SQLite-compatible"* — the store is the practitioner's only copy; assumption is not acceptable. Rejected.
- *Test on the real store rather than a copy* — the spike must never risk the practitioner's data. Rejected; the spike works on a copy.

**Consequence**: the engine swap (step 2 of the plan's delivery order) does not begin until R1 passes.

---

## R2 — Opening the store as a synced (or local) Turso database

**Decision**: Open the store through the Turso crate, choosing the builder by whether the secrets are present in the credential store (R4):

- **Secrets present** (the set-up case — the values are held in Windows Credential Manager, R4):
  ```rust
  let db = turso::sync::Builder::new_remote(store_path)
      .with_remote_url(config.url())
      .with_auth_token(config.token())
      .bootstrap_if_empty(false)   // never reach the network on first launch
      .build()
      .await?;
  let conn = db.connect().await?;
  ```
- **No secrets yet** (a machine that has not been set up, or a development run): `turso::Builder::new_local(store_path).build().await?`, which has **no** `push()`/`pull()`. Because the setup gate keeps the application unreachable until the secrets exist (FR-005), this branch is not reached in normal use.

`AppState` holds an enum `StoreEngine::Synced(turso::sync::Database) | StoreEngine::Local(turso::Database)` plus the live `Connection`. `push()`/`pull()`/`checkpoint()`/`stats()` are only reachable on the `Synced` arm.

**Rationale**: The developer's direction is that the store *is* the synced database, so `sync::Builder` is the primary path. `bootstrap_if_empty(false)` is essential to FR-001: with the default (`true`) the local database is bootstrapped from the remote on first connect, which would require the network on first launch and could fight an existing local store. The Turso docs' own "offline-first writes" pattern uses exactly `bootstrap_if_empty: false` and an explicit `pull()` when online.

**Alternatives considered**:
- *`bootstrap_if_empty(true)` (default)* — needs the remote on first launch and can overwrite a local store. Rejected.
- *One engine type only* — `sync::Database` cannot be constructed without a remote URL, so a machine that has not been set up needs the local variant. Rejected.
- *`libsql` Embedded Replicas* — writes go to the cloud primary, so the app would stop being offline-writable. Contradicts FR-001 outright. Rejected.

---

## R3 — The async migration and the store lock

**Decision**: The store and command layers become `async`. `AppState` uses `tokio::sync::Mutex<StoreState>` and its `with_connection` helper becomes `async fn`; every Tauri command that touches the store becomes `#[tauri::command] async fn`. `tokio` is added as a direct dependency with `rt-multi-thread`, `macros` and `time`.

**Rationale**: The Turso API is async (`conn.execute(...).await`). Tauri v2 already runs commands on a tokio runtime, so async commands compose naturally. A `std::sync::Mutex` guard cannot be held across an `.await` in a `Send` future — which Tauri requires — so the lock must be `tokio::sync::Mutex`. The one store instance remains the single writer, preserving the invariant Module 2 established.

**Alternatives considered**:
- *Keep `std::sync::Mutex`* — does not compile across awaits for Tauri's `Send` futures. Rejected.
- *Wrap the async engine in a blocking facade* (`block_on` inside commands) — nests runtimes and is a known source of deadlocks. Rejected.
- *Drop the mutex and rely on the engine's own concurrency* — the store is still logically single-writer and the app's commands assume it; the mutex also serialises push/pull against writes. Rejected.

---

## R4 — The cloud secrets: onboarding paste → Windows Credential Manager

**Decision**: The installer carries **no** secrets. Instead:

- The partner gives the practitioner a small **env file** (the same `.env` shape the project uses today).
- On a computer that is not yet set up, onboarding shows a **secrets screen** at the same stage as the storage-location choice. The practitioner pastes the file's contents.
- `cloud/secrets.rs` parses it strictly (`KEY=VALUE`; blank lines and `#` comments ignored) and checks the **required keys**: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `TURSO_ORG`, `TURSO_DATABASE`, `TURSO_PLATFORM_TOKEN`.
- Each value is written to **Windows Credential Manager** as its own generic credential under a fixed service prefix (for example `tax-statements-analysis/TURSO_AUTH_TOKEN`), through the `keyring` crate's Windows backend (or the already-present `windows-sys` with `Win32_Security_Credentials`).
- `cloud/config.rs` reads the values **from the credential store** on demand; `is_configured()` is true when the store already holds them. The process environment is never consulted, and nothing is written to `settings.json`, to the store, or to any other file (FR-046, FR-047).
- A paste that cannot be parsed, or that misses a required key, is rejected with a message naming the problem and saves nothing (FR-048). Re-pasting replaces the stored values (FR-049).
- The **setup gate** (frontend `SetupGate`): the application is shown only when **both** a usable store has been chosen **and** the secrets are present; otherwise onboarding is shown (FR-005).

**Rationale**: The developer rejected packaging secrets in the installer as unreliable. Storing them in the operating system's credential store instead is both safer — no secret sits in the binary or in a plain file — and offline-friendly, since no network is needed to set up or to use the application. Parsing the partner's existing env file invents no new format and means the same hand-off works for every customer.

**Alternatives considered**:
- *Bake the credentials into the build* — the rejected idea: extractable from the binary and dependent on a reliable build-time hand-off. Rejected.
- *Keep the values in `settings.json` (or the store)* — writes a secret to a plain file the application owns. Rejected (FR-046).
- *Read them from the process environment* — a GUI launch has no reliable environment. Rejected.
- *Have the practitioner type each value* — the env file is the partner's hand-off. Rejected.

**Security note (Objection 1)**: Windows Credential Manager is per-Windows-user, so the secrets are exposed to anyone using that Windows account. The application keeps no other copy and never logs or displays them. This is strictly better than the earlier build-time token, which was extractable from the binary by anyone holding it.

---

## R5 — Keeping the cloud copy text-only (attachment bytes leave the store)

**Decision**: Raise the schema to **version 5** and move attachment **bytes** out of the synced store:

- The store's `attachments` table keeps only metadata: `statement_id` (PK/FK), `file_name`, `byte_size`, `relative_path` — **no `data` column**.
- The bytes live in an **`attachments/` folder beside the store file**, one file per statement, named by the statement id (e.g. `attachments/<statement_id>.bin`).
- The v4→v5 migration copies each existing `data` BLOB out to that folder and rewrites the row, inside one transaction, then stamps `user_version = 5`. It is idempotent and resumable (a row whose file already exists is left alone).
- The carry-across (location change) moves the folder alongside the store; the empty-store check is unchanged (it counts records, not files).

**Rationale**: The whole store now syncs. If attachment BLOBs stay in it, they flow to the cloud — breaking the client's explicit text-only, cost-minimal rule (FR-039/FR-041/FR-042) and the 5 GB allowance, and pre-empting the future module that stores file bytes cheaply elsewhere and syncs only a reference. Moving the bytes to a sibling folder keeps the synced store text-only and happens to mirror the future "reference synced, bytes external" shape. Attachments remain fully local and fully usable offline.

**Alternatives considered**:
- *Leave BLOBs in the synced store* — syncs files to the cloud; violates the cost constraint. Rejected.
- *A second, un-synced table in the same file* — impossible: a Turso database syncs as a whole. Rejected.
- *Drop attachments entirely (the client does not use files yet)* — would strand any existing attachment data from Module 2. Rejected.
- *Move bytes to Oracle Object Storage now* — that is a later module; doing it here would expand scope and add a second cloud. Rejected.

**Consequence**: Module 2's "the one `.db` file is the whole store and backup" promise is amended to "the store file **plus** the attachments folder beside it" (plan Objection 3).

---

## R6 — The close-time warning and how closing is intercepted

**Decision**: Use the **frontend** to intercept closing. `useCloudSync` calls `getCurrentWindow().onCloseRequested(...)`; when `cloud_status` reports un-pushed changes, it `preventDefault()`s the close and opens **`CloseWarningDialog`** offering **Push then close**, **Close without pushing**, or **Cancel**. Choosing to push awaits `cloud_push`, shows its outcome, and then calls `window.destroy()` to close for real. Add only the capability entries this needs to `capabilities/default.json`.

**Rationale**: The decision is a user choice, and the dialog, the progress indicator and the outcome messages all live in the webview; intercepting there keeps the flow in one place and avoids a Rust⇄webview event round trip to ask "are you sure?". The Rust side keeps the authoritative un-pushed answer (R8) and exposes it through `cloud_status`.

**Alternatives considered**:
- *Intercept in Rust with `on_window_event` + `prevent_close`, emitting an event to the frontend* — works, but needs an event round trip and splits the flow across the boundary. Rejected as first choice; kept as the fallback if the webview hook proves unreliable.
- *Block closing in Rust until the push finishes* — contradicts FR-028 ("closing MUST still be allowed"). Rejected.

---

## R7 — Outcome taxonomy and error classification

**Decision**: `cloud/outcome.rs` maps the result of a `push()`/`pull()`/usage call into one `SyncOutcome`:

| Outcome | Recognised from |
|---|---|
| `Success` | the call returned Ok and something was exchanged |
| `NothingNew` | `pull()` returned `false`, or `push()` reported nothing to send |
| `NoInternet` | connection/DNS/timeout errors from the sync call |
| `SecretsUnavailable` | the credential store holds no secrets, or cannot be read (R4) |
| `ServerUnavailable` | HTTP 5xx / auth rejection / non-network remote errors |
| `Other { reason }` | anything else, with the underlying message surfaced |

The classification is one function so every command reports the same way, and the frontend renders one plain-language line per attempt (FR-033, FR-035).

**Rationale**: The spec requires the practitioner to be able to tell these apart (FR-033), and the client listed exactly these categories. Classifying by the error's kind (not by string matching) keeps it robust as the Turso crate's error type evolves.

**Alternatives considered**:
- *Show the raw error* — unhelpful and leaks internals. Rejected.
- *Treat every failure as "sync failed"* — loses the distinctions the spec demands. Rejected.

**Note**: `push()` must not be called while a write transaction is open (the Turso docs warn overlapping write transactions may be delayed). The store mutex (R3) plus running push/pull inside the same command path keeps this true.

---

## R8 — Detecting un-pushed changes

**Decision**: Keep a small local marker file, `sync-state.json` beside `settings.json`, holding `{ dirty: bool, last_pushed_at: Option<String> }`. Every store mutation command sets `dirty = true`; a **successful** `push()` clears it and records the time. `cloud_status` reports `hasUnpushed = dirty`. The close warning (R6) and the header's Push affordance both read this.

**Rationale**: FR-025 needs a dependable "there are changes not yet published" answer at the moment of closing, and the honest fact is "there have been local writes since the last successful push". An explicit marker is simple and exact. Keeping it **out of the store** is deliberate: the marker must not itself be synced, and it must survive independently of the store's open state at shutdown.

**Alternatives considered**:
- *Infer from Turso `stats()` (WAL size / revision)* — the stats are about sync machinery, not "user changed something"; brittle. Rejected.
- *Store the flag in `app_meta`* — it would sync to the cloud as our own bookkeeping, and it couples the answer to an open store. Rejected.
- *Never warn* — contradicts FR-025. Rejected.

---

## R9 — Automatic sync (startup and hourly) and refreshing the UI

**Decision**: In Tauri's `setup`, after the store is opened, spawn a `tauri::async_runtime` task that (a) performs one `pull()` shortly after startup and (b) then `pull()`s about every 60 minutes, each time only when `is_configured()` and the connection is available. After a pull that changed anything (`pull()` returned `true`), the task **emits a Tauri event** `cloud://pulled`; the frontend listens (in `useCloudSync`) and bumps the existing `refreshKey` so the lists reload — exactly the mechanism `App.tsx` already uses after create/edit.

**Rationale**: FR-021/FR-022 ask the app to pull on start and hourly, quietly. A Rust background task keeps it running regardless of which tab is open and does not depend on the webview being active. Emitting a single event to trigger the existing refresh keeps the UI consistent without polling, and it never touches an in-progress form because it only triggers list reloads.

**Alternatives considered**:
- *A `setInterval` in the webview* — stops mattering if the webview is suspended and duplicates the schedule. Rejected.
- *Have the frontend poll `cloud_status`* — chatty and laggy. Rejected.
- *Block the UI during the automatic pull* — violates FR-023. Rejected; the pull runs in the background and the frontend only learns of it after the fact.

---

## R10 — The progress indicator

**Decision**: `SyncProgress` is shown for the whole duration of a manual Push/Sync. The frontend sets a `CloudPhase = "idle" | "pushing" | "pulling"` state before awaiting the command and clears it in a `finally`, then shows the outcome. The purple styling reuses the brand tokens (the same ones the header logo uses).

**Rationale**: FR-036 requires the practitioner to see that an exchange is in progress, and FR-037 requires it to be replaced by the real outcome rather than a premature success. Modelling the phase explicitly (rather than a boolean) keeps "nothing is happening", "pushing", "pulling" and "finished" distinct.

**Alternatives considered**:
- *A boolean spinner* — cannot distinguish a push from a pull or a finished state; the developer asked for a tracker. Rejected.
- *Fire-and-forget with no indicator* — the developer explicitly asked for a loader because exchanges may be slow. Rejected.

---

## R11 — The "Turso Cloud" storage-left gauge

**Decision**: `cloud/usage.rs` calls the Turso Usage API after a successful sync and on a slow interval:

```
GET https://api.turso.tech/v1/organizations/{org}/databases/{database}/usage
Authorization: Bearer {platform-token}
```

The response's `database.total.storage_bytes` (summed across instances) is the storage used. Remaining is `allowance - used`, where the allowance is a constant in the application (the client's **5 GB** free tier). The command `cloud_usage` returns `{ usedBytes, allowanceBytes, remainingBytes } | unavailable`; the header's **purple gauge** renders remaining as a proportion, and shows **unavailable** when the figure cannot be fetched (FR-031). The HTTP client is `reqwest` (rustls) — the backend's second network caller after the updater.

**Rationale**: The client explicitly named this endpoint and asked for the gauge (spec User Story 5, FR-029–FR-032). `storage_bytes` is the field the API documents for storage in use. The allowance is client-supplied (5 GB) and kept as one named constant, so it can be adjusted in a single place.

**Alternatives considered**:
- *Estimate from the local store size* — the cloud copy and the local store differ, and the point of the gauge is the *cloud's* headroom. Rejected.
- *Skip the API and show nothing* — the client asked for it. Rejected.
- *A separate tiny HTTP stack (`ureq`)* — `reqwest` is already in the dependency tree transitively and its async client fits the tokio runtime. Either is acceptable; `reqwest` chosen for consistency with the async model.

**Note**: This API needs the **platform token**, the **org slug** and the **database name** — all separate from the sync auth token (R4). If they are absent, the gauge reads unavailable (FR-031) rather than showing a wrong number.

---

## R12 — The list queries and the currency/attachments code after the swap

**Decision**: Keep the SQL of the View Bills/Statements list queries as they are (`GROUP_CONCAT`, `SUM`, `ORDER BY occurred_on DESC, created_at DESC`), re-expressed through the Turso async API (`conn.prepare(...).await?`, `stmt.query(...).await?`, `Value` conversions). Attachment open/save reads bytes from the **local attachments folder** (R5) rather than from a BLOB, and the temp-write/opener/dialog path is unchanged.

**Rationale**: The list queries are already the module-3 design and R1 verifies the engine supports them; nothing about them needs to change. Attachment open/save keeps its existing UX (open in the OS viewer, save a copy) with the byte source moved from the store to the folder — a smaller change than it sounds, since Module 2's `blob` incremental I/O existed only to avoid materialising big BLOBs, and reading a file is simpler.

**Alternatives considered**:
- *Store attachments as base64 text in the synced store* — inflates the cloud copy (~33% overhead) and still violates "text records only". Rejected.
- *Keep the BLOB read path* — there is no BLOB once R5 lands. Rejected.

---

## Resolved unknowns summary

| Technical Context field | Resolution |
|---|---|
| Store engine | `turso` 0.8.x (`sync`) async; `rusqlite` removed (R2), gated on R1 |
| Engine parity with the existing schema | Spike first (R1); fallback recorded (plan Objection 2b) |
| Store open (sync vs local) | `sync::Builder::new_remote` with `bootstrap_if_empty(false)` when configured; `Builder::new_local` otherwise (R2) |
| Async model | Store + commands async; `tokio::sync::Mutex` for `AppState` (R3) |
| Cloud credentials | Pasted once at onboarding from the partner's env file, parsed and stored in Windows Credential Manager; the installer carries none (R4) |
| Text-only cloud | Attachment bytes move to a local folder; schema v5 (R5) |
| Close-time warning | Frontend `onCloseRequested` + `CloseWarningDialog`; capability added if needed (R6) |
| Outcomes & errors | One classifier mapping to Success / NothingNew / NoInternet / SecretsUnavailable / ServerUnavailable / Other (R7) |
| Un-pushed detection | Local `sync-state.json` dirty marker, set on mutation, cleared on successful push (R8) |
| Automatic sync | Rust task: startup pull + hourly pull; `cloud://pulled` event refreshes lists (R9) |
| Progress indicator | Explicit `CloudPhase` state; replaced by the outcome (R10) |
| Storage gauge | Turso Usage API `storage_bytes`; 5 GB allowance constant; credentials from the credential store; `reqwest` (R11) |
| Lists / attachments after the swap | Same SQL through the async API; attachment bytes from the folder (R12) |

**No `NEEDS CLARIFICATION` remains.** R1 is a **spike gate**, not an open question: it either passes and implementation proceeds, or it fails and the plan's documented fallback is taken.
