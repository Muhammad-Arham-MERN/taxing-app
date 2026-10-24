---
description: "Task list for feature 004-cloud-sync"
---

# Tasks: Offline Work — Communicate Live (Cloud Sync)

**Feature**: `004-cloud-sync`
**Input**: Design documents from `specs/004-cloud-sync/`
**Prerequisites**: [plan.md](../plan.md) (required), [spec.md](../spec.md) (required), [research.md](../research.md), [data-model.md](../data-model.md), [contracts/](../contracts/), [quickstart.md](../quickstart.md)

**Tests**: **None.** The specification directs "write no tests", so no test tasks are generated. The existing Vitest suite must keep passing (see Polish phase).

**Organization**: Tasks are grouped by user story so each can be implemented and verified independently. Story order follows the spec's priorities, with US6 (P1 prerequisite) first because it gates the rest.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: the user story the task serves (US1–US6); Setup/Foundational/Polish tasks carry no story label
- Every task names an exact file path

## Path Conventions

Single desktop application. Paths are relative to the repository root:

- Backend: `tax-statements-analysis/src-tauri/src/...`
- Frontend: `tax-statements-analysis/src/...`

`[ENG]` marks a file rewritten from `rusqlite` to the async Turso engine; `[NEW]`/`[CHG]` as in the plan.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: dependency change and the R1 parity spike that gates the engine swap.

- [x] T001 Add the backend dependencies and drop the old engine in `tax-statements-analysis/src-tauri/Cargo.toml`: add `turso` (features `["sync"]`), `tokio` (`rt-multi-thread`, `macros`, `time`), `reqwest` (rustls, JSON), and a credential-store crate (`keyring`, or `windows-sys` with `Win32_Security_Credentials`); remove `rusqlite`
- [x] T002 Run the **R1 engine-parity spike (GATE)** in `tax-statements-analysis/src-tauri/sync-poc/src/bin/parity_spike.rs` against a **copy** of a real store — verify `STRICT`, `PRAGMA application_id`/`user_version` read **and write**, `CHECK`/`UNIQUE`/`NOT NULL`, `COLLATE NOCASE` FK matching, `FOREIGN KEY ... ON DELETE CASCADE`, `PRAGMA table_info`, `GROUP_CONCAT`/`SUM`, and a statement + bill + customer round trip (research R1). **STOP and take the plan's fallback (Objection 2b) if any check fails.**

**Checkpoint**: R1 green (or the fallback decided) before any migration is written.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the engine swap, the cloud core, and the repository seam — everything every user story needs.

**⚠️ CRITICAL**: no user story can be implemented until this phase is complete.

### Engine swap (`rusqlite` → async Turso)

- [x] T003 [ENG] Convert `tax-statements-analysis/src-tauri/src/state.rs` to `tokio::sync::Mutex`, an `AppState` holding a `StoreEngine::Synced(turso::sync::Database) | Local(turso::Database)` plus the live connection, and an `async fn with_connection`
- [x] T004 [ENG] Rewrite `tax-statements-analysis/src-tauri/src/store/mod.rs`: async `open_existing`/`open_read_write`/`verify_read_only`, `SCHEMA_VERSION = 5`, `REQUIRED_TABLES_V5`, the synced builder with `bootstrap_if_empty(false)` when the secrets are present, and the local builder otherwise (research R2)
- [x] T005 [P] Rewrite `tax-statements-analysis/src-tauri/src/store/schema.rs`: Turso-compatible DDL for the existing tables plus the v3/v4 steps, and the **v4→v5** step that moves each attachment BLOB to the `attachments/` folder and rebuilds `attachments` as reference-only (`statement_id`, `file_name`, `byte_size`, `relative_path`), stamping `user_version` last (data-model §1.2/§1.4)
- [x] T006 [P] Create `tax-statements-analysis/src-tauri/src/store/attachments.rs`: the local-only attachment vault — write/read/delete `<statement_id>.bin` in the `attachments/` folder and its reference row; **never synced**
- [x] T007 [ENG] Convert `tax-statements-analysis/src-tauri/src/store/statements.rs` to the async Turso API
- [x] T008 [ENG] Convert `tax-statements-analysis/src-tauri/src/store/bills.rs` to the async Turso API
- [x] T009 [ENG] Convert `tax-statements-analysis/src-tauri/src/store/customers.rs` to the async Turso API
- [x] T010 [ENG] Convert `tax-statements-analysis/src-tauri/src/store/carry.rs` to async and extend the carry to move the `attachments/` folder beside the store (data-model §5)
- [x] T011 [ENG] Convert `tax-statements-analysis/src-tauri/src/commands/statements.rs` and `tax-statements-analysis/src-tauri/src/commands/bills.rs` to `#[tauri::command] async fn` (names, args and results unchanged)
- [x] T012 [ENG] Rewrite `tax-statements-analysis/src-tauri/src/commands/attachments.rs` to read/stream bytes from the attachment vault (T006) instead of a BLOB, keeping the temp-write/opener/dialog behaviour
- [x] T013 [CHG] Adjust `tax-statements-analysis/src-tauri/src/commands/storage.rs` (`assess_location`, `set_storage_location`) to the async engine and the extended carry; the empty-store check is unchanged
- [x] T014 [CHG] Add the new error kind(s) to `tax-statements-analysis/src-tauri/src/commands/error.rs` (`SecretsStoreUnavailableError`)

### Cloud core

- [x] T015 [P] [NEW] Create `tax-statements-analysis/src-tauri/src/cloud/config.rs`: read the five values from the credential store, `is_configured()`, and the 5 GB allowance constant (research R4, R11)
- [x] T016 [P] [NEW] Create `tax-statements-analysis/src-tauri/src/cloud/secrets.rs`: strict env-file parse (`KEY=VALUE`; skip blank lines/`#` comments), the required-keys check, and Windows Credential Manager read/write/clear under a fixed service prefix (FR-044–FR-049)
- [x] T017 [P] [NEW] Create `tax-statements-analysis/src-tauri/src/cloud/outcome.rs`: the one classifier mapping a result to `Success` / `NothingNew` / `NoInternet` / `SecretsUnavailable` / `ServerUnavailable` / `Other` (research R7)
- [x] T018 [P] [NEW] Create `tax-statements-analysis/src-tauri/src/cloud/sync_state.rs`: the local `sync-state.json` dirty marker — set on mutation, cleared on a **successful** push (research R8)
- [x] T019 [NEW] Create `tax-statements-analysis/src-tauri/src/cloud/mod.rs`: open the store as the synced or local engine, and expose `push()`, `pull()`, `checkpoint()` and `stats()` wrappers over the `Synced` arm
- [x] T020 [NEW] Create `tax-statements-analysis/src-tauri/src/commands/cloud.rs` with `cloud_status` only (reads the credential store and the dirty marker; never touches the network)
- [x] T021 [NEW] Create `tax-statements-analysis/src-tauri/src/commands/onboarding.rs` with `get_setup_state` (`{ storageReady, secretsReady }`) and `save_secrets` (parse → validate → store; `SecretsPasteResult`) and `clear_secrets` (data-model §3, contracts/tauri-commands.md)
- [x] T022 [CHG] Register the new modules and commands in `tax-statements-analysis/src-tauri/src/commands/mod.rs` and `tax-statements-analysis/src-tauri/src/lib.rs` (`pub mod cloud`, `pub mod onboarding`; append `cloud_status`, `get_setup_state`, `save_secrets` to `generate_handler!`)

### Frontend seam and setup gate

- [x] T023 [P] [CHG] Add the Module 4 types to `tax-statements-analysis/src/domain/types.ts`: `CloudStatus`, `CloudPhase`, `SetupState`, `SecretsPasteResult`, `SyncOutcomeKind`, `SyncOutcome`, `SyncResult`, `CloudUsage` (data-model §3)
- [x] T024 [P] [CHG] Add `CloudRepository` and `SetupRepository` (with their error kinds) to `tax-statements-analysis/src/data/repositories.ts` (contracts/cloud-repository.md)
- [x] T025 [P] [CHG] Implement both interfaces in `tax-statements-analysis/src/data/tauri.ts` (invoke wrappers, the `cloud://pulled` listener wiring, and secret values never returned to the frontend)
- [x] T026 [P] [CHG] Implement both interfaces in `tax-statements-analysis/src/data/in-memory.ts` as the test twin (configurable `configured`, success/failure outcomes, usage values)
- [x] T027 [CHG] Inject `cloud` and `setup` in `tax-statements-analysis/src/components/providers/DataProvider.tsx`
- [x] T028 [NEW] Create `tax-statements-analysis/src/components/onboarding/SetupGate.tsx`: the gate that shows onboarding unless **both** `storageReady` and `secretsReady` are true (FR-005)
- [x] T029 [P] [NEW] Create `tax-statements-analysis/src/components/cloud/SyncProgress.tsx`: the shared loader shown for the whole duration of a Push/Sync (FR-036/FR-037)
- [x] T030 [CHG] Mount the setup gate in `tax-statements-analysis/src/App.tsx` (render `SetupGate` in place of the tabs whenever setup is incomplete) and keep the existing `refreshKey` plumbing

**Checkpoint**: the application opens through the gate, works fully offline on the Turso engine, and no cloud action is wired yet.

---

## Phase 3: User Story 6 - Set Up Sync on a New Computer (Priority: P1, prerequisite)

**Goal**: a fresh install asks for the storage location **and** the secrets; pasting the partner's env file saves the values to Windows Credential Manager, after which the application is usable and never asks again.

**Independent Test**: install on a fresh machine, confirm setup is shown when the secrets are absent, paste a valid env file, confirm each value is stored and the app becomes usable, restart and confirm it does not ask again, and confirm an invalid/incomplete paste is rejected with a specific message and saves nothing (quickstart Story 6).

- [x] T031 [US6] Create `tax-statements-analysis/src/components/onboarding/SecretsDialog.tsx`: the paste-the-env-file screen with submit, an inline specific failure message, and success handling (FR-044, FR-045, FR-048)
- [x] T032 [US6] Create `tax-statements-analysis/src/components/onboarding/SecretsStatus.tsx`: shows whether the secrets are set and offers a deliberate re-paste to replace them (FR-049)
- [x] T033 [US6] Wire `setup.saveSecrets` / `setup.state` through `SetupGate.tsx` so a successful paste unlocks the application and a failure keeps setup open (FR-005, FR-047)
- [x] T034 [US6] Ensure the secrets are never echoed back, logged or written to any file: verify `commands/onboarding.rs` returns no values and the frontend stores none (FR-046)

**Checkpoint**: setup is complete on a fresh machine and the application is usable offline; no secret exists in any application file or the installer.

---

## Phase 4: User Story 1 - Push Local Changes to the Cloud (Priority: P1) 🎯 MVP

**Goal**: a header **Push** action publishes the changes since the last exchange, with a progress indicator and one clear outcome; offline/secret/server problems are reported distinctly and lose nothing.

**Independent Test**: change something offline, enable the network, press Push and see a clear success; press again and see "nothing new"; disable the network and confirm the outcome and that nothing was lost (quickstart Story 1).

- [x] T035 [US1] Add `cloud_push` to `tax-statements-analysis/src-tauri/src/commands/cloud.rs`: `db.push()`, classify the outcome (T017), clear the dirty marker on success, refuse while a write transaction is open (contracts/tauri-commands.md; FR-006–FR-012)
- [x] T036 [P] [US1] Create `tax-statements-analysis/src/components/cloud/CloudOutcomeMessage.tsx`: renders exactly one plain-language outcome per attempt (FR-033)
- [x] T037 [US1] Create `tax-statements-analysis/src/components/cloud/CloudActions.tsx` with the **Push** button, its disabled/offline/secret states, and the awaited-duration progress via `SyncProgress` (FR-006, FR-036)
- [x] T038 [US1] Create `tax-statements-analysis/src/hooks/useCloudSync.ts`: `CloudPhase` state, the push call and outcome, and the un-pushed marker read (FR-008, FR-010)
- [x] T039 [US1] Host `CloudActions` + `CloudOutcomeMessage` in `tax-statements-analysis/src/components/layout/RevealHeader.tsx`'s action cluster

**Checkpoint**: US1 is a viable product on its own — the practitioner can publish their work and always understands the result.

---

## Phase 5: User Story 2 - Sync Changes Down From Other Computers (Priority: P2)

**Goal**: a header **Sync** action (pull) brings the other computers' changes in, without duplicates, with the same clear outcomes.

**Independent Test**: publish from computer A, press Sync on computer B and see the change with a clear outcome; press Sync repeatedly and confirm no duplicates; disconnect and confirm the report (quickstart Story 2).

- [x] T040 [US2] Add `cloud_pull` to `tax-statements-analysis/src-tauri/src/commands/cloud.rs`: `db.pull()`, classify the outcome, report `changed`, never clear the dirty marker (contracts/tauri-commands.md; FR-013–FR-020)
- [x] T041 [US2] Add the **Sync** button to `tax-statements-analysis/src/components/cloud/CloudActions.tsx` (same progress/outcome handling as Push)
- [x] T042 [US2] Extend `tax-statements-analysis/src/hooks/useCloudSync.ts` with the pull call, `changed` handling, and list refresh
- [x] T043 [US2] Refresh the Statement/Bill lists after a pull in `tax-statements-analysis/src/App.tsx` (bump `refreshKey`)

**Checkpoint**: US1 and US2 both work independently; a change round-trips between two computers with no duplication.

---

## Phase 6: User Story 3 - Sync Happens On Its Own (Priority: P3)

**Goal**: a pull runs quietly on start and about hourly, refreshing the lists without disturbing an in-progress entry.

**Independent Test**: publish elsewhere, open the second app and confirm it pulls within a short time without any action; confirm the hourly pull; confirm an in-progress form is untouched (quickstart Story 3).

- [x] T044 [US3] Create `tax-statements-analysis/src-tauri/src/cloud/schedule.rs`: the startup pull and the ~60-minute pull, each only when the secrets are present and the connection is available, emitting `cloud://pulled` when something changed (research R9; FR-021–FR-024)
- [x] T045 [US3] Spawn the schedule task in `tax-statements-analysis/src-tauri/src/lib.rs` `setup` after the store opens
- [x] T046 [US3] Subscribe to `cloud://pulled` in `tax-statements-analysis/src/hooks/useCloudSync.ts` (via `cloud.onPulled`) and refresh the lists without touching an in-progress form (FR-023)

**Checkpoint**: the computers converge without the practitioner acting; nothing is interrupted.

---

## Phase 7: User Story 4 - Safeguard Un-Pushed Work When Closing (Priority: P4)

**Goal**: closing with un-published changes warns and offers to push, but never traps the practitioner.

**Independent Test**: change something without pushing, close and see the warning; push then close; and close anyway and confirm the change is still publishable after reopening (quickstart Story 4).

- [x] T047 [US4] Create `tax-statements-analysis/src/components/cloud/CloseWarningDialog.tsx`: the warning with **Push then close**, **Close without pushing**, and **Cancel** (FR-025–FR-028)
- [x] T048 [US4] Intercept the window close in `tax-statements-analysis/src/hooks/useCloudSync.ts` using `getCurrentWindow().onCloseRequested`, showing the warning whenever `cloud_status.hasUnpushed` is true and closing only when chosen (research R6; FR-028)
- [x] T049 [US4] Add any capability the webview close/destroy hook needs to `tax-statements-analysis/src-tauri/capabilities/default.json` — and no more than it needs

**Checkpoint**: no un-pushed work is lost at close, and no warning appears when there is nothing pending.

---

## Phase 8: User Story 5 - See How Much Cloud Space Remains (Priority: P5)

**Goal**: the header shows a purple "Turso Cloud" storage-left gauge that refreshes after a sync and reads *unavailable* when the figure cannot be fetched.

**Independent Test**: observe the gauge, confirm it names Turso Cloud and shows storage left out of the allowance, confirm it updates after a Sync, and confirm it reads unavailable when the API fails (quickstart Story 5).

- [x] T050 [US5] Create `tax-statements-analysis/src-tauri/src/cloud/usage.rs`: call the Turso Usage API for the build's org/database with the platform token, read `database.total.storage_bytes`, compute remaining against the allowance constant (research R11)
- [x] T051 [US5] Add `cloud_usage` to `tax-statements-analysis/src-tauri/src/commands/cloud.rs` returning `CloudUsage | null` (null = unavailable; FR-031)
- [x] T052 [P] [US5] Create `tax-statements-analysis/src/components/cloud/StorageGauge.tsx`: the purple "Turso Cloud" gauge with the unavailable state (FR-029–FR-032)
- [x] T053 [US5] Host `StorageGauge` in `tax-statements-analysis/src/components/layout/RevealHeader.tsx` and refresh it after each Push/Sync (FR-030)

**Checkpoint**: all six stories work independently.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: validation, cleanup and the guarantees that span stories.

- [x] T054 [P] Run the existing frontend suite (`npm test` in `tax-statements-analysis/`) and fix any regression from the seam/type changes
- [x] T055 Remove the now-obsolete Module 2 build prerequisite and `rusqlite` notes from `tax-statements-analysis/src-tauri/Cargo.toml` and the module docs, and confirm the crate builds without a C compiler
- [x] T056 [P] Audit for leaked secrets: confirm nothing in `settings.json`, the store, `sync-state.json`, logs or the frontend ever contains a secret value (FR-046; SC-018)
- [x] T057 [P] Verify the text-only guarantee: confirm the synced store has no BLOB column and the `attachments/` folder is never pushed (FR-039/FR-041/FR-042; SC-014)
- [x] T058 Walk the whole `specs/004-cloud-sync/quickstart.md` end to end on two machines (or two stores against the same remote) and record the results; fix anything it surfaces
- [x] T059 [P] Update `CLAUDE.md` "Active Technologies" if any implementation detail changed from the plan, and confirm `/sp.analyze` finds no drift

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies; **T002 gates everything** (if R1 fails, stop and take the plan fallback).
- **Foundational (Phase 2)**: depends on Setup; **blocks all user stories**.
- **US6 (Phase 3)**: depends on Foundational. The prerequisite for using the application.
- **US1 (Phase 4)**: depends on Foundational and US6 (the app must be set up to push).
- **US2 (Phase 5)**: depends on Foundational and US1 is *not* required, but they share `commands/cloud.rs`, `CloudActions.tsx` and `useCloudSync.ts`, so US2 must follow US1 to avoid same-file conflicts.
- **US3 (Phase 6)**: depends on Foundational; its listener reuses US1/US2 wiring.
- **US4 (Phase 7)**: depends on Foundational (the dirty marker) and on US1 (pushing from the warning).
- **US5 (Phase 8)**: depends on Foundational only; independent of US1–US4.
- **Polish (Phase 9)**: depends on all desired stories.

### Within Each User Story

- Backend command before the frontend that calls it.
- Types/seam (Foundational) before any story UI.
- Story complete and verified before the next priority begins.

### Parallel Opportunities

- **Setup**: T001 and T002 touch different files; T002 is the gate but T001 may be prepared first.
- **Foundational**: T005, T006, T015, T016, T017, T018 are file-disjoint and can run together; T023–T026 (frontend types/interfaces/twin) can run together once the backend shapes are fixed; T029 is independent.
- **US1**: T036 is independent of T035/T037.
- **US5**: T052 is independent of T050/T051.
- **Polish**: T054, T056, T057, T059 are independent.

---

## Parallel Example: Foundational

```bash
# File-disjoint backend pieces:
Task: "T005 schema.rs v4→v5 migration"
Task: "T006 store/attachments.rs local vault"
Task: "T015 cloud/config.rs"
Task: "T016 cloud/secrets.rs"
Task: "T017 cloud/outcome.rs"
Task: "T018 cloud/sync_state.rs"

# File-disjoint frontend seam:
Task: "T023 domain/types.ts"
Task: "T024 data/repositories.ts"
Task: "T025 data/tauri.ts"
Task: "T026 data/in-memory.ts"
Task: "T029 components/cloud/SyncProgress.tsx"
```

---

## Implementation Strategy

### MVP First

1. Phase 1 (T001–T002) — **R1 must be green**.
2. Phase 2 (T003–T030) — engine swap + cloud core + seam + gate.
3. Phase 3 (T031–T034) — **US6**: a machine can be set up and used offline.
4. Phase 4 (T035–T039) — **US1**: the practitioner can Push and understand the result.
5. **STOP and VALIDATE** with quickstart Stories 6 and 1, then deploy.

### Incremental Delivery

- +US2 → two computers round-trip with no duplication.
- +US3 → sync happens on its own.
- +US4 → no un-pushed work is lost at close.
- +US5 → the storage gauge.

Each increment is independently demonstrable and breaks nothing earlier.

---

## Notes

- **No tests are written** (developer's direction); acceptance is the quickstart walkthrough. `npm test` is run only to confirm the existing suite still passes.
- `[ENG]` tasks are mechanical rewrites to the async engine; keep Module 1–3 behaviour identical offline and re-check by hand at each step.
- Conflict handling is the engine's **last push wins** — no merge code is written (FR-019, FR-043).
- Every new source file carries the constitution header, crux marker and footer (plan Constitution Check, Principle I).
