# Tasks: Local Statement Persistence and Editing (Module 2)

**Input**: Design documents from `specs/002-statements-persistence/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: **No test tasks are generated.** The developer directed that this module requires no automated backend tests (`spec.md` → Assumptions → Verification approach), and the command's rule is to include test tasks only when explicitly requested. The existing Module 1 Vitest suite is the only automated check in the project; T018 keeps it compiling and green, and every user-story phase ends with a verification task that walks the matching section of `quickstart.md`.

**Organization**: Tasks are grouped by user story so each one can be implemented and demonstrated independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US5)
- Every task names its exact file path

## Standing rule (Constitution Principle I)

Every source file these tasks create or edit MUST open with the constitution's header, close with its footer, and carry the crux marker on the genuinely load-bearing routine. The routines that qualify are named in [plan.md](./plan.md) → Constitution Check: the store open/verify routine, the write transaction, the range query that must not read blobs, the carry-across copy loop, and the no-delete guard.

## Path Conventions

Single desktop application at repository root. Backend: `tax-statements-analysis/src-tauri/src/`. Frontend: `tax-statements-analysis/src/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dependencies and module scaffolding

- [x] T001 Add the Rust dependencies to `tax-statements-analysis/src-tauri/Cargo.toml`: `rusqlite` with features `bundled` and `blob`, `tauri-plugin-dialog`, `tauri-plugin-single-instance` (desktop-gated), `windows-sys` with feature `Win32_Storage_FileSystem`, and `uuid` with feature `v4`
- [x] T002 Register the plugins in `tax-statements-analysis/src-tauri/src/lib.rs` — `tauri_plugin_single_instance` **first** in the builder chain (with window focus/unminimize in its callback), then `tauri_plugin_dialog::init()`, keeping `tauri_plugin_opener::init()`
- [x] T003 Remove the scaffold `greet` command and its `generate_handler!` entry from `tax-statements-analysis/src-tauri/src/lib.rs`
- [x] T004 Create the module skeletons with the constitution header and footer: `tax-statements-analysis/src-tauri/src/store/mod.rs`, `tax-statements-analysis/src-tauri/src/commands/mod.rs`, `tax-statements-analysis/src-tauri/src/platform/mod.rs`, and declare them from `tax-statements-analysis/src-tauri/src/lib.rs`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The store, the location it lives at, and the gate — nothing else can work until these exist

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

> **Why the location chooser is here rather than in US2**: FR-015 blocks every other capability until a location has been chosen, so *no* story is demonstrable without it. This phase therefore carries the first-run choice and the gate. US2 owns everything about *changing* a location and carrying records between them.

- [x] T005 [P] Implement the store connection lifecycle in `tax-statements-analysis/src-tauri/src/store/mod.rs`: a read-only verification path (trivial query catching `NotADatabase`, then check `application_id`, `user_version`, expected tables), a read-write open path, default rollback journal mode and `synchronous = FULL`, and a damaged-store outcome that reports without writing — see research R2/R6 and spec FR-056, FR-059
- [x] T006 [P] Implement schema creation and identity stamping in `tax-statements-analysis/src-tauri/src/store/schema.rs`: the `app_meta`, `statements` and `attachments` DDL and the index, with `PRAGMA application_id` / `user_version`, exactly as specified in `data-model.md` §1.2
- [x] T007 [P] Implement location classification in `tax-statements-analysis/src-tauri/src/platform/location.rs`: resolve the volume root with `GetVolumePathNameW`, classify with `GetDriveTypeW`, and check whether the folder is under a cloud sync root — best-effort, returning a warning rather than a refusal (`spec.md` FR-055, research R9)
- [x] T008 [P] Implement settings persistence in `tax-statements-analysis/src-tauri/src/settings.rs`: read and write `settings.json` in `app.path().app_config_dir()` holding `{ storageLocation: { kind, path } }`, and derive the `StorageState` including the `problem` field (`data-model.md` §2, FR-017, FR-025)
- [x] T009 [P] Define the serialisable error enum in `tax-statements-analysis/src-tauri/src/commands/error.rs` covering every variant in `contracts/tauri-commands.md` §4, with messages a practitioner can act on
- [x] T010 [P] Extend the frontend types in `tax-statements-analysis/src/domain/types.ts` with `StorageLocation`, `StorageState`, `CarryAcrossChoice`, `LocationAssessment`, `StatementUpdate` and `AttachmentRef`, leaving existing types unchanged (`data-model.md` §3)
- [x] T011 [P] Extend the seam in `tax-statements-analysis/src/data/repositories.ts`: add `update`, `getAttachment`, `openAttachment` and `saveAttachmentCopy` to `StatementRepository`, add the new `StorageRepository` interface, and **delete** `BusinessProfileRepository` (`contracts/statement-repository.md`)
- [x] T012 Implement the storage commands in `tax-statements-analysis/src-tauri/src/commands/storage.rs`: `get_storage_state`, `pick_directory`, `assess_location`, and `set_storage_location` for the first-run case (create a store in a chosen directory) — the carry-across and file-adoption paths come in US2 and US4
- [x] T013 Register T012's commands in the `tax-statements-analysis/src-tauri/src/lib.rs` `generate_handler!`
- [x] T014 [P] Implement `TauriStorageRepository` in `tax-statements-analysis/src/data/tauri.ts`, translating `invoke()` rejections into the seam's error types (`contracts/statement-repository.md` → StorageRepository)
- [x] T015 [P] Build the gate in `tax-statements-analysis/src/components/storage/StorageGate.tsx`: while no location is chosen, render the chooser and **nothing else** — the Create and View surfaces must not be mounted at all (FR-015, SC-006)
- [x] T016 [P] Build the location chooser in `tax-statements-analysis/src/components/storage/StorageLocationDialog.tsx` for the directory path: OS folder picker, the risky-location warning shown before accepting (FR-055), cancel leaving everything unchanged (FR-024). The file-choice path is added in US4
- [x] T017 Wire the gate into `tax-statements-analysis/src/components/providers/DataProvider.tsx` and `tax-statements-analysis/src/App.tsx` so the header renders but no statement capability is reachable before a location exists
- [x] T018 Extend `tax-statements-analysis/src/data/in-memory.ts` to satisfy the widened interfaces (including `update` and the attachment methods) so the existing Vitest suite still compiles, then run `npm test` and confirm it is green — this file stays a test fixture and is never wired into the running application

**Checkpoint**: A location can be chosen, a store file exists there, and the application opens with the rest of its surface hidden until that has happened.

---

## Phase 3: User Story 1 - Statements Survive Closing the Application (Priority: P1) 🎯 MVP

**Goal**: Recording writes durably, and a date-range review reads back exactly what was stored without loading any attachment contents.

**Independent Test**: Record a statement (one with an attachment), close and reopen, and confirm it and the totals are present for a range covering its date. Requires only the location chosen in Phase 2.

### Implementation for User Story 1

- [x] T019 [US1] Implement the create path in `tax-statements-analysis/src-tauri/src/store/statements.rs`: one transaction writing the statement row and its attachment blob together, a UUID assigned at creation, and the amount converted to integer paisa (FR-001–FR-007, research R4/R11)
- [x] T020 [US1] Implement the range query in `tax-statements-analysis/src-tauri/src/store/statements.rs`: inclusive `BETWEEN` on the date, newest first with `created_at` as tie-break, returning metadata and file name only and **never selecting the blob column** (FR-027–FR-035, research R3)
- [x] T021 [US1] Implement `create_statement` and `list_statements` in `tax-statements-analysis/src-tauri/src/commands/statements.rs` and register them in `tax-statements-analysis/src-tauri/src/lib.rs`
- [x] T022 [US1] Implement `create`, `findByDateRange` and `listAll` in `tax-statements-analysis/src/data/tauri.ts`, keeping the Module 1 ordering and error behaviour (`contracts/statement-repository.md`)
- [x] T023 [US1] Inject the statement repository into `tax-statements-analysis/src/components/providers/DataProvider.tsx` and confirm the existing Create and View components need no change — that is the seam's whole purpose
- [ ] T024 [US1] Verify User Story 1 against `specs/002-statements-persistence/quickstart.md` §4 Story 1, including the restart, the offline run, and the large-attachment timing check; run `npm test`

**Checkpoint**: The application is a usable record-keeping tool. This is the MVP.

---

## Phase 4: User Story 2 - Choose and Move Where Statements Are Stored (Priority: P2)

**Goal**: The practitioner can point the application at a different location and decide, each time, whether the existing records come with them.

**Independent Test**: Change location with records present, choosing "bring" and then "start fresh", confirming the records follow or do not, and that the previous store file is untouched both times.

### Implementation for User Story 2

- [x] T025 [US2] Implement the carry-across copy in `tax-statements-analysis/src-tauri/src/store/carry.rs`: one transaction per statement, skipping any statement whose identity already exists in the destination and never overwriting it, with attachment blobs copied in ~256 KiB chunks via `ZEROBLOB` plus incremental blob I/O (FR-019–FR-021, FR-063, research R5/R7)
- [x] T026 [US2] Complete `set_storage_location` in `tax-statements-analysis/src-tauri/src/commands/storage.rs`: ask-and-act on the bring-or-start-fresh choice, create the new store, return a resumable `CarryAcrossInterruptedError` on failure, and never delete the previous store file (FR-019–FR-022, FR-063)
- [x] T027 [US2] Replace the Settings trigger with a "Choose Storage Directory" control in `tax-statements-analysis/src/components/layout/RevealHeader.tsx` (FR-018)
- [x] T028 [US2] Remove `tax-statements-analysis/src/components/layout/SettingsDialog.tsx` and every import of it, and drop the business-profile wiring from `tax-statements-analysis/src/components/providers/DataProvider.tsx` (FR-053)
- [x] T029 [US2] Build the choice prompt in `tax-statements-analysis/src/components/storage/CarryAcrossPrompt.tsx`: bring the previous records across, or start fresh without them — asked on every location change made while records exist (FR-019, FR-020, SC-022)
- [x] T030 [US2] Extend `tax-statements-analysis/src/components/storage/StorageLocationDialog.tsx` for changing an existing location: assess first, warn and require confirmation for a risky location, never call `set_location` after a rejection, and leave everything unchanged on cancel (FR-023–FR-024, FR-055, FR-061)
- [x] T031 [US2] Surface unusable-location states in `tax-statements-analysis/src/components/storage/StorageGate.tsx` — unreachable, unwritable or damaged — always offering a re-choice and never presenting an empty store as the practitioner's data (FR-023, FR-025, FR-056)
- [ ] T032 [US2] Verify User Story 2 against `specs/002-statements-persistence/quickstart.md` §4 Story 2, including both choice branches, the untouched previous store file, cancellation, an unwritable target and a warned location; run `npm test`

**Checkpoint**: Stories 1 and 2 both work independently.

---

## Phase 5: User Story 3 - Correct a Saved Statement (Priority: P3)

**Goal**: A stored statement can be corrected in place, including replacing or removing its attachment, without ever creating a second record.

**Independent Test**: Record a statement, edit it from the View tab including its file, restart, and confirm one record carries the new values.

### Implementation for User Story 3

- [x] T033 [US3] Implement update-in-place in `tax-statements-analysis/src-tauri/src/store/statements.rs`: same identity, `updated_at` advanced, no second row, an `attachment` action of `keep` / `remove` / `replace`, and `keep` leaving the stored blob byte-identical (FR-038–FR-049, research R4)
- [x] T034 [US3] Implement `update_statement` in `tax-statements-analysis/src-tauri/src/commands/statements.rs` and register it in `tax-statements-analysis/src-tauri/src/lib.rs`
- [x] T035 [US3] Implement `update` in `tax-statements-analysis/src/data/tauri.ts`, defaulting to `keep` when only fields changed (FR-047)
- [x] T036 [US3] Build `tax-statements-analysis/src/components/statements/EditStatementDialog.tsx`, reusing the existing form and validation so creation and editing cannot drift apart (`CreateStatementForm.tsx` is refactored to share its form body rather than duplicated)
- [x] T037 [US3] Add the row edit action to `tax-statements-analysis/src/components/statements/StatementsTable.tsx`, and refresh the list and totals after a save so a date moved outside the range drops out (FR-048)
- [ ] T038 [US3] Verify User Story 3 against `specs/002-statements-persistence/quickstart.md` §4 Story 3, including abandon, invalid edit, file removal, file replacement and the date-moves-out-of-range case; run `npm test`

**Checkpoint**: Stories 1–3 work independently.

---

## Phase 6: User Story 4 - Recover Records From a Backup File (Priority: P4)

**Goal**: After a reinstall, the practitioner points the application at a store file they saved and gets their records back — and a file that is not a store is rejected without being touched.

**Independent Test**: Copy a store file, delete `settings.json`, point the application at the copy, and confirm every record returns; then point it at a non-store file and confirm rejection with the file unchanged.

### Implementation for User Story 4

- [x] T039 [US4] Implement `pick_store_file` in `tax-statements-analysis/src-tauri/src/commands/storage.rs` and register it in `tax-statements-analysis/src-tauri/src/lib.rs`
- [x] T040 [US4] Implement adoption and rejection in `tax-statements-analysis/src-tauri/src/commands/storage.rs`: verify read-only before accepting, adopt the file in place with its folder becoming the storage location, accept a valid but empty store, and reject anything else with a reason while leaving the file byte-for-byte unchanged (FR-057–FR-062, FR-064, SC-020)
- [x] T041 [US4] Add the file-choice path to `tax-statements-analysis/src/components/storage/StorageLocationDialog.tsx`, presenting a rejection as an explanation with the practitioner left exactly where they were and able to try again (FR-060, FR-061)
- [ ] T042 [US4] Verify User Story 4 against `specs/002-statements-persistence/quickstart.md` §4 Story 4, hashing the rejected file before and after to confirm it was not modified; run `npm test`

**Checkpoint**: Stories 1–4 work independently.

---

## Phase 7: User Story 5 - Open or Save an Attachment (Priority: P5)

**Goal**: Clicking an attachment opens it in the practitioner's own application; the file can also be saved elsewhere.

**Independent Test**: Attach a PDF, an image and a spreadsheet, click each and confirm it opens in the system's usual application; save a copy and confirm it matches.

### Implementation for User Story 5

- [x] T043 [US5] Implement the temporary-copy lifecycle in `tax-statements-analysis/src-tauri/src/temp.rs`: a per-run folder under the app cache directory, writing an attachment out with its original name and extension, and best-effort cleanup of other runs at startup that tolerates `ERROR_SHARING_VIOLATION` and `ERROR_ACCESS_DENIED` (FR-067–FR-070, research R10)
- [x] T044 [US5] Implement the attachment commands in `tax-statements-analysis/src-tauri/src/commands/attachments.rs`: `get_attachment`, `open_attachment` handing the temporary path to the OS, and `save_attachment_copy` through the system save prompt with the original name offered — including the failure path where nothing handles the type — and register them in `tax-statements-analysis/src-tauri/src/lib.rs` (FR-065, FR-066, FR-071–FR-075)
- [x] T045 [US5] Implement `getAttachment`, `openAttachment` and `saveAttachmentCopy` in `tax-statements-analysis/src/data/tauri.ts`
- [x] T046 [US5] Make the file name actionable in `tax-statements-analysis/src/components/statements/FileAttachmentField.tsx` — open on click, save-a-copy alongside, and the save action still offered after a failed open (FR-065, FR-075)
- [x] T047 [US5] Expose the same two actions from the list in `tax-statements-analysis/src/components/statements/StatementsTable.tsx` without adding any viewer or preview of its own (FR-066)
- [ ] T048 [US5] Verify User Story 5 against `specs/002-statements-persistence/quickstart.md` §4 Story 5, including byte-comparison of a saved copy, the no-handler case, opening the same file twice, and cleanup on the next launch; run `npm test`

**Checkpoint**: All five stories are independently functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: The guarantees that span stories

- [ ] T049 [P] Confirm single-instance enforcement in `tax-statements-analysis/src-tauri/src/lib.rs`: a second launch refuses to start and focuses the running window (FR-054, SC-016)
- [ ] T050 [P] Audit `tax-statements-analysis/src-tauri/src/store/` and `.../commands/` for any path that deletes or alters a store file it did not create, and any statement delete path — there must be none (FR-022, FR-050, SC-009)
- [ ] T051 [P] Confirm no attachment contents are read on the list path by inspecting the query in `tax-statements-analysis/src-tauri/src/store/statements.rs` against `data-model.md` §1.3 (FR-029, SC-011)
- [ ] T052 [P] Confirm `tax-statements-analysis/src-tauri/capabilities/default.json` requires no new permissions and record the reasoning if it changes (`contracts/tauri-commands.md` §5)
- [ ] T053 Verify the preserved Module 1 behaviour in `tax-statements-analysis/src/components/statements/`: same labels, nature options, ISO dates, "₨" formatting, "None" for empties, current-month default range and dark theme (FR-051)
- [ ] T054 Produce a release build with `npm run tauri build` from `tax-statements-analysis/` and confirm the executable runs with no external SQLite dependency, and that the MSVC prerequisite in `specs/002-statements-persistence/quickstart.md` §1 is accurate
- [ ] T055 Run the complete `specs/002-statements-persistence/quickstart.md` §4 walkthrough end to end on a clean profile (`settings.json` deleted) and record any deviation

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup — **blocks every user story**
- **User Stories (Phases 3–7)**: Each depends on Foundational. They are written to be independently demonstrable, but they touch shared files (`src/data/tauri.ts`, `DataProvider.tsx`, `StatementsTable.tsx`, `lib.rs`), so working on two at once will cause conflicts unless those files are sequenced
- **Polish (Phase 8)**: Depends on the stories it checks

### User Story Dependencies

- **US1 (P1)**: After Foundational. No dependency on other stories — the MVP
- **US2 (P2)**: After Foundational. Uses US1's store; independently testable by moving a location that holds records
- **US3 (P3)**: After Foundational. Reuses US1's create path and validation; independently testable by editing a stored statement
- **US4 (P4)**: After Foundational, and reuses US2's carry-across when records are already in use. Independently testable from a clean profile, which is the real-world case
- **US5 (P5)**: After Foundational, and needs US1 to have stored an attachment. Independently testable once one exists

### Within Each User Story

- Backend store routine before the command that exposes it
- Command before the seam implementation that calls it
- Seam implementation before the component that consumes it
- Verification task last, against the matching `quickstart.md` section

### Parallel Opportunities

- T005–T011 are seven independent files — the largest parallel block in the plan
- T014, T015 and T016 are three independent frontend files
- Within a story, `[P]` is not used much because the files are sequenced by design; the real parallelism is the T005–T011 block
- T049–T052 are four independent checks

---

## Parallel Example: Foundational Phase

```bash
# These seven files have no interdependencies and can be written together:
Task: "Implement the store connection lifecycle in src-tauri/src/store/mod.rs"
Task: "Implement schema creation in src-tauri/src/store/schema.rs"
Task: "Implement location classification in src-tauri/src/platform/location.rs"
Task: "Implement settings persistence in src-tauri/src/settings.rs"
Task: "Define the serialisable error enum in src-tauri/src/commands/error.rs"
Task: "Extend the frontend types in src/domain/types.ts"
Task: "Extend the seam in src/data/repositories.ts"
```

```bash
# Then, once T012 and T013 exist, these three can be written together:
Task: "Implement TauriStorageRepository in src/data/tauri.ts"
Task: "Build the gate in src/components/storage/StorageGate.tsx"
Task: "Build the location chooser in src/components/storage/StorageLocationDialog.tsx"
```

---

## Requirement coverage

| Requirement group | Phase |
|---|---|
| FR-001–FR-007 durable capture | Phase 3 (US1) |
| FR-008–FR-012 offline and local | Phase 2 (store open) + Phase 3 |
| FR-013–FR-018 first choice, gate, remembered location | Phase 2 |
| FR-019–FR-026 changing location, carry-across, protections | Phase 4 (US2) |
| FR-027–FR-037 range retrieval and on-demand contents | Phase 3 (US1), T044 (US5) |
| FR-038–FR-050 editing | Phase 5 (US3) |
| FR-051–FR-053 preserved/amended Module 1 behaviour | Phase 4 (T028) + Phase 8 (T053) |
| FR-054–FR-056 store integrity | Phase 1 (T002), Phase 2 (T005), Phase 4 (T031) |
| FR-057–FR-064 existing store file | Phase 6 (US4) |
| FR-065–FR-075 opening and saving attachments | Phase 7 (US5) |

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup → 2. Phase 2 Foundational → 3. Phase 3 US1 → 4. **STOP and validate**, then demo.

Phase 2 is larger than usual here and cannot be trimmed: FR-015 makes a chosen location a precondition for every other capability, so the store, the location and the gate must all exist before the first statement can be recorded.

### Incremental Delivery

1. Setup + Foundational → the application opens, is gated, and holds an empty store
2. US1 → records persist and review works — **this is the viable product**
3. US2 → records can be moved between locations
4. US3 → corrections
5. US4 → recovery from a backup file
6. US5 → attachments open and save
7. Polish → the cross-story guarantees

### If the module is split

The natural cut is after US2 (Phases 1–4): that delivers a durable, relocatable store. US3–US5 are editing, recovery and attachment handling and could ship as a second increment. Raised in `plan.md` → Risks; the developer has not decided.

---

## Notes

- `[P]` marks tasks with no dependency on an incomplete task **and** no shared file
- The verification task in each story is the acceptance procedure — there are no automated backend tests by direction
- `tax-statements-analysis/src/data/in-memory.ts` stops being used by the application and becomes a test fixture only; T018 is what keeps the existing suite meaningful
- Commit after each task or logical group
- Stop at any checkpoint to validate a story independently
