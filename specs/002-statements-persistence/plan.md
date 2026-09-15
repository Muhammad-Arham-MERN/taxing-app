# Implementation Plan: Local Statement Persistence and Editing (Module 2)

**Branch**: `002-statements-persistence` | **Date**: 2026-09-14 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/002-statements-persistence/spec.md`

## Summary

Module 2 turns Module 1's deliberately throwaway data layer into a real one. It delivers the Rust/Tauri persistence backend and connects the existing React frontend to it, covering all 75 functional requirements in the spec: durable capture, date-range review, in-place editing, a practitioner-chosen storage location, carrying records between locations, recovering from a backup store file, and opening or saving attachments through the operating system.

The central architectural decision is already in place. Module 1 built a **data-access seam** (`src/data/repositories.ts`) with an in-memory implementation purely so that this module could add a real one behind the same interfaces with **no UI refactor**. Module 2 writes that second implementation (`src/data/tauri.ts`) and does not touch the components' contract with it.

The second decision is the store itself: **one self-contained SQLite file** (`rusqlite` with the `bundled` feature, so SQLite is compiled into the executable and the practitioner installs nothing), created where the practitioner chooses. Attachments are held as BLOBs in a **separate `attachments` table with the blob as the last column**, which is what makes FR-029/FR-030 achievable: a date-range review selects metadata and file names only, so SQLite never reads the attachment's overflow pages and a range review stays fast no matter how much evidence is attached.

Everything the practitioner may point the application at is treated as untrusted: a chosen file is verified by its header marker and schema (read-only) before it is adopted, no failure path ever writes to a file it rejected, and no path ever deletes a store file.

## Technical Context

**Language/Version**: Rust 1.77.2+ (edition 2021) with Tauri v2 (2.11.x) for the backend; TypeScript 5.x on React 19 (existing, unchanged toolchain) for the frontend
**Primary Dependencies**:

- Rust: `rusqlite` (features `bundled`, `blob`) · `tauri-plugin-dialog` · `tauri-plugin-single-instance` · `tauri-plugin-opener` (already present) · `windows-sys` (drive/sync-root detection) · `uuid` · `serde`/`serde_json` (already present)
- Frontend: `@tauri-apps/api` (present) · `@tauri-apps/plugin-dialog` · `@tauri-apps/plugin-opener` (present)

**Storage**: A single self-contained local SQLite file at a location the practitioner chooses — no server, no port, no installation. **Rollback journal mode, not WAL**, so the `.db` file alone is the complete store and remains directly copyable as a backup (FR-057/FR-058 depend on this; WAL would add `-wal`/`-shm` sidecars that must travel with it). Attachment contents are BLOBs in an `attachments` table. The chosen location is remembered in a small `settings.json` under `app.path().app_config_dir()` — the only thing this module keeps outside the store file.
**Testing**: Per the developer's explicit direction, **no automated backend tests** — the command surface is small and acceptance is by exercising the application end to end. Module 1's Vitest suite must continue to pass, and it is the only automated guard on the frontend this module changes.
**Target Platform**: Windows 10/11 desktop, single practitioner, fully offline; development on Windows via `npm run tauri dev`
**Project Type**: Single desktop application (Tauri shell + React webview). Extends `tax-statements-analysis/` in place; no new project.
**Performance Goals**: A date-range review over thousands of statements renders list and totals in under 2 seconds, and stays under 2 seconds when many of those statements carry large attachments (SC-004) — achieved by never selecting the blob column in the list query. A range review loads **zero** attachment contents (SC-011/SC-015). Opening an attachment must not block the UI while a large file is written out.
**Constraints**: `rusqlite`'s `bundled` feature compiles SQLite from C source, so a **C compiler (MSVC build tools) becomes a build-time prerequisite** — a new requirement on the development machine, not on the practitioner's. Single blob and row size ≤ ~1 GB (`SQLITE_MAX_LENGTH`, default). Single instance only (FR-054). No network calls anywhere. No statement deletion anywhere. Header details are not stored at all.
**Scale/Scope**: 1 user; 1 store file at a time; 5 user stories; approximately 12 Tauri commands; tens of thousands of statements over the application's life; individual attachments up to hundreds of megabytes.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution: `.specify/memory/constitution.md` v1.0.0 (ratified 2026-09-14). Gate evaluated against the project's own four principles.

| # | Principle | Status | Evidence / notes |
|---|-----------|--------|------------------|
| I | Code Standards (file header → crux marker → footer) | PASS (planned) | Every new Rust and TypeScript source file opens with the required header and closes with the footer. The crux marker goes on the logic that is genuinely load-bearing: the store open/verify routine, the write transaction, the range query that must not read blobs, the carry-across copy loop, and the delete-nothing guard. The open interpretation about whether Markdown artifacts carry the header/footer is **still unresolved** (recorded in Module 1's plan); this plan follows Module 1's precedent and does not add them to `specs/` documents. |
| II | Quality Standards (accuracy, reliability, efficiency, clarity) | PASS, with one objection raised below | Accuracy: amounts stored as integer minor units (paisa), never floats, so the View totals cannot drift. Reliability: every write is a single transaction that rolls back on drop; every failure path in the spec has a defined outcome; nothing is ever destructively repaired. Efficiency: fully local; blobs are streamed in chunks rather than materialised. Clarity: Rust is split by concern (`store`, `commands`, `platform`, `temp`) rather than one large module. |
| III | Supervised Collaboration | PASS | Every structural or risky choice in this plan is presented as an option for Developer approval — the WAL-vs-journal choice, the Mark-of-the-Web mitigation, and the module-size question are all surfaced in Complexity Tracking and Risks rather than applied silently. |
| IV | Constructive Objection | OBJECTION RAISED — see below | Two objections are offered with alternatives, not implemented unilaterally. |

**Objection 1 — no automated tests on the module whose whole risk is data loss.** The developer has directed that this module needs no automated backend tests, and that direction is honoured here. For the record: the highest-consequence logic in the entire project (write atomicity, carry-across fidelity, backup-file verification, blob chunk copying) will have no automated guard, and its failures are silent-corruption failures rather than crashes. *Options for the Developer:* (a) accept as directed; (b) add a small Rust integration-test module covering only the store routines — roughly the header/schema verification, one write-then-read round trip, and one carry-across — leaving the command layer untested; (c) leave it for now and revisit if a defect escapes. No action is taken in this plan.

**Objection 2 — a new build-time prerequisite.** `rusqlite`'s `bundled` feature requires a C compiler on the machine that *builds* the application (MSVC build tools on Windows). This is not visible in the spec and will break a clean checkout on a machine without them. *Alternatives:* (a) accept it — it buys a genuinely self-contained executable, which is exactly what "the practitioner installs nothing" requires; (b) depend on a system `sqlite3` library instead, which removes the build requirement but pushes an installation onto the practitioner and breaks the offline/no-install promise. **Recommendation: (a)**, and it is what this plan assumes.

**Result**: PASS. No violations requiring Complexity Tracking as *violations*; the deliberate structural choices are recorded below so they are explicit rather than implied.

### Post-Design Constitution Re-check

Re-evaluated after Phase 1 (2026-09-14): still **PASS**. The design keeps interfaces explicit (one Tauri command contract, one repository seam), avoids speculative abstraction, honours Principle I for every created source file, and holds the spec's line that no path ever deletes or silently repairs the practitioner's data. No new violations introduced. Both objections above remain open for the Developer and neither blocks implementation.

## Project Structure

### Documentation (this feature)

```text
specs/002-statements-persistence/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── tauri-commands.md      # the Rust/IPC surface (replaces Module 1's deferred sketch)
│   └── statement-repository.md # the frontend seam, extended for editing, files and the gate
├── checklists/
│   └── requirements.md  # /sp.specify output
└── tasks.md             # /sp.tasks output (NOT created here)
```

### Source Code (repository root)

The application already exists as a Tauri v2 + React scaffold at `tax-statements-analysis/`. This plan extends it in place.

```text
tax-statements-analysis/
├── src/                                        # FRONTEND (existing, extended)
│   ├── data/
│   │   ├── repositories.ts                     # seam interfaces — EXTENDED (update, attachments, storage)
│   │   ├── in-memory.ts                        # Module 1 implementation — retained for tests only
│   │   └── tauri.ts                            # NEW: invoke()-backed implementation of the seam
│   ├── domain/
│   │   ├── types.ts                            # EXTENDED (StorageLocation, StorageState, AttachmentRef)
│   │   └── validation.ts                       # unchanged rules; reused by the edit flow
│   ├── components/
│   │   ├── layout/
│   │   │   ├── RevealHeader.tsx                # CHANGED: Settings trigger → "Choose Storage Directory"
│   │   │   └── SettingsDialog.tsx              # REMOVED (FR-018/FR-053)
│   │   ├── storage/
│   │   │   ├── StorageGate.tsx                 # NEW: blocks the app until a location exists (FR-015)
│   │   │   ├── StorageLocationDialog.tsx       # NEW: folder-or-file chooser + risky-location warning
│   │   │   └── CarryAcrossPrompt.tsx           # NEW: bring records across, or start fresh (FR-019)
│   │   ├── statements/
│   │   │   ├── CreateStatementForm.tsx         # CHANGED: shares the form with the edit flow
│   │   │   ├── EditStatementDialog.tsx         # NEW: edit fields, replace/remove the file (FR-038–FR-049)
│   │   │   ├── StatementsTable.tsx             # CHANGED: row edit action; file name becomes actionable
│   │   │   └── FileAttachmentField.tsx         # CHANGED: open / save-a-copy actions (FR-065–FR-075)
│   │   └── providers/
│   │       └── DataProvider.tsx                # CHANGED: inject the Tauri implementation + storage state
│   └── test/                                   # existing Vitest setup — must keep passing
│
└── src-tauri/                                  # BACKEND (new work)
    ├── Cargo.toml                              # + rusqlite, tauri-plugin-dialog, tauri-plugin-single-instance, windows-sys, uuid
    ├── capabilities/default.json               # + dialog:default, opener:allow-open-path (scoped)
    └── src/
        ├── lib.rs                              # builder wiring: single-instance FIRST, then dialog/opener
        ├── main.rs                             # unchanged
        ├── store/
        │   ├── mod.rs                          # connection lifecycle, open/verify, pragmas
        │   ├── schema.rs                       # create/migrate, application_id + user_version stamping
        │   ├── statements.rs                   # create, range query (no blob), update-in-place
        │   ├── attachments.rs                  # streamed read/write of blob contents (chunked I/O)
        │   └── carry.rs                        # location change: copy, skip-existing, start-fresh
        ├── commands/                           # one module of #[tauri::command] wrappers per contract
        │   ├── mod.rs
        │   ├── statements.rs
        │   ├── storage.rs                      # choose/remember/verify location, gate state
        │   └── attachments.rs                  # open via OS handler, save a copy
        ├── platform/
        │   └── location.rs                     # drive type + cloud-sync-root detection (Windows)
        └── temp.rs                             # app temp folder: write out, clear on next launch
```

**Structure Decision**: Single desktop application, extended in place. The Rust side is split by concern rather than by layer — `store/` owns everything that touches SQLite and is the only place `rusqlite` appears; `commands/` is a thin translation layer from IPC to `store/` so that the untestable boundary is kept as thin as possible; `platform/` isolates the Windows-specific detection so the rest stays portable; `temp.rs` isolates the one place the application writes outside the store. On the frontend, `src/data/tauri.ts` is the only new *code* the UI depends on — components keep talking to the same seam interfaces they already use, which is precisely what Module 1's structure was for.

## Complexity Tracking

> No constitution violations. The table records deliberate structural choices so they are explicit.

| Choice | Why Needed | Simpler alternative rejected because |
|--------|------------|--------------------------------------|
| Attachment BLOBs inside the store, not files on disk | The spec requires the file to be stored in the database and requires one self-contained store the practitioner can copy as a backup (FR-003, FR-011, FR-057). | Storing files in a folder beside the store would make "copy one file to back up" false, contradicting the recovery requirement. Module 1's contract sketch assumed this folder layout; the Module 2 spec supersedes it. |
| Separate `attachments` table with the blob last | FR-029/FR-030/SC-011 require a range review that loads no attachment contents at all. SQLite reads a row's overflow pages only when it must advance past the overflowing column, so keeping the blob in its own table — always last, never selected by the list query — makes that a structural guarantee rather than a coding convention. | A blob column on the statements table also works *if* the blob is last and never selected, but any future column added after it silently drags every attachment into memory on every list query. |
| Rolling back to `in-memory.ts` retained | Module 1's Vitest suite runs against it; deleting it would delete the only automated coverage the frontend has. | Removing it saves a file but loses the frontend's only test fixture. It is never wired into the running application. |
| Single-instance plugin rather than file locking | FR-054 requires the second copy to refuse to start; a plugin-level mutex is the supported mechanism. Two writers on one SQLite file is a corruption path the spec explicitly closes. | Application-level file locking would have to be written and maintained by hand, and would still allow two windows past startup. |
| `settings.json` in the app config dir rather than a plugin store | One string is all that is remembered, and the path must be readable before the store is open. A plain file needs no new crate, no npm package and no IPC permission. | `tauri-plugin-store` writes to a different base directory and exists to let the frontend read/write settings directly, which this design deliberately avoids. |
| Chunked blob I/O for import/export/carry-across | Attachments may be hundreds of megabytes; the naive approach materialises a whole file in memory. | Reading a whole blob into a `Vec` is fewer lines but makes peak memory proportional to the largest attachment. |

## Phases

- **Phase 0 — Outline & Research**: see [research.md](./research.md). Every technical unknown in the Technical Context is resolved; no `NEEDS CLARIFICATION` remains.
- **Phase 1 — Design & Contracts**: see [data-model.md](./data-model.md), [contracts/](./contracts/) and [quickstart.md](./quickstart.md).
- **Phase 2 — Tasks**: deferred to `/sp.tasks`.

### Suggested delivery order

The module is large — 75 requirements across five stories. It is written so each story is separately demonstrable, and the stories are ordered by priority in the spec. Implementing in that order means the application is useful after phase 1 alone:

1. **US1 (P1)** — store created, capture and range review work. *Viable product on its own.*
2. **US2 (P2)** — the storage-location gate, the chooser, and moving between locations.
3. **US3 (P3)** — in-place editing.
4. **US4 (P4)** — adopting an existing store file (recovery).
5. **US5 (P5)** — opening and saving attachments.

US2 is a prerequisite for demonstrating US1 in practice: the gate blocks every other capability, so the gate and the chooser land in the same phase as the first store write, even though US1 is the priority story. This is noted rather than hidden — see Risks.

## Risks & Follow-ups

- **Module size**: 75 requirements, ~12 commands, and a frontend that loses a dialog and gains a gate, an edit flow and two file actions. Coherent as one module, but large. If it needs splitting, the natural seam is US1+US2 (store and location) as one delivery and US3–US5 (editing, recovery, attachments) as another. Flagged for the Developer; not acted on here.
- **No automated guard on the riskiest code**: see Objection 1. The carry-across and blob-copy paths are the most likely place for a silent, expensive defect.
- **`bundled` SQLite needs MSVC build tools**: see Objection 2. First build will be slow; a machine without a C compiler will fail to build with an error that does not obviously point at the cause.
- **Removable-media detection is a heuristic**: `GetDriveTypeW` reports many USB drives as `DRIVE_FIXED`, so drive type alone under-detects. FR-055's warning therefore uses drive type plus the sync-root check plus (optionally) the device removal policy — and is best-effort by nature. Consequence: the warning can miss a synced or removable location, which is why it is a warning and not a block.
- **Cloud-sync detection is best-effort**: the dependable folder-level signal is the Cloud Files API; the OneDrive folder itself is not a reparse point, so attribute-based checks on the folder do not work. Where the API is unavailable the check degrades to a path/environment heuristic.
- **Accepted security posture**: FR-071 has the application open every attachment, including executables, with no warning of its own. The plan does not weaken this. One mitigation is available that does not block anything: writing the Mark-of-the-Web zone identifier on the temporary copy so SmartScreen and Office Protected View apply to it. Presented as an option; not assumed.
- **Attachments exist outside the store while open**: the temporary copy is unavoidable for OS-handled opening, and is the reason FR-069/FR-070 exist. Cleared on next launch, never deleted while in use.
- **Deferred by the developer**: how a store survives a future application version (schema migration across releases). The plan stamps `user_version` so the information is there when that decision is made, and implements no migration now.
