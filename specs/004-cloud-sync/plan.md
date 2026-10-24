# Implementation Plan: Offline Work — Communicate Live (Cloud Sync)

**Branch**: `004-cloud-sync` | **Date**: 2026-10-15 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/004-cloud-sync/spec.md`

## Summary

Module 4 is the first half of **"Offline Work — Communicate Live"**: the practitioner keeps working fully offline on each computer, and when the internet is available they **Push** their changes to one central cloud copy and **Sync** (pull) the changes made on their other computers. Sync also happens on its own — once at startup and about once an hour. The header gains **Push** and **Sync** actions, a **progress indicator** for the duration of an exchange, and a purple **"Turso Cloud"** storage-left gauge fed by Turso's Usage API. Closing with un-pushed changes offers to push, but never traps the practitioner.

The architectural decision this plan rests on was taken by the developer on 2026-10-15: **the store engine moves from `rusqlite` to the `turso` crate**, so the practitioner's single store file becomes a **local-first Turso database** that keeps working offline and synchronises itself with Turso Cloud through `push()` / `pull()`. This is exactly the model the developer's proof-of-concept (`tax-statements-analysis/src-tauri/sync-poc`) proves. It is the largest change of this feature and the reason the plan is written the way it is:

1. **The store is now a Turso database.** `rusqlite` is replaced by `turso` (0.8.x, `sync` feature) with `tokio`. All reads and writes stay local; `push()` sends local changes to the cloud, `pull()` brings remote changes down. The store is opened with `turso::sync::Builder::new_remote(...)` when the build carries cloud details, and with `turso::Builder::new_local(...)` otherwise, so an un-provisioned build still works offline.
2. **All store access becomes async.** The Turso crate is async; the store modules, `AppState` and the Tauri command surface become `async`, and the store mutex becomes a `tokio` mutex.
3. **Conflicts are the store's own rule.** The developer chose **last push wins** — Turso Sync's native resolution — and **dropped the earlier content-based duplication-reconciliation idea** (spec Clarifications, FR-019, FR-043). No custom merge code is written.
4. **The cloud copy stays text-only.** Because the whole store now syncs, **attachment file bytes must leave the synced store**: they move to a local, un-synced attachments folder beside the store, and the store keeps only a reference (name, size, relative path). This preserves the client's cost constraint (FR-039, FR-041, FR-042) and aligns with the future "reference in the cloud, bytes elsewhere" module.
5. **Cloud credentials are pasted once at onboarding and kept in Windows Credential Manager.** The developer directed that the installer carry **no** secrets (baking credentials into a build is unreliable). Instead, on a computer that is not yet set up, onboarding asks the practitioner both where their records will live **and** for the env file their partner gave them; the application parses it, validates the required values, and saves each one into **Windows Credential Manager**, from where it is read whenever sync or the storage gauge needs it. Until the secrets exist the application is not usable — the same gate as a usable store.
6. **Outcomes are explicit and visible.** Every Push/Sync classifies its result (success, nothing new, no internet, secrets unavailable, server unavailable, other failure) and shows a progress indicator while it runs.

The one genuine technical risk is **engine parity**: the Turso engine is a rewrite of SQLite, so the existing schema's `STRICT` tables, `PRAGMA application_id`/`user_version` identity, `CHECK` constraints, `COLLATE NOCASE` keys, foreign keys and cascade must all be confirmed to behave. The plan front-loads a **parity spike** (R1) before any migration is written, and records the fallback.

## Technical Context

**Language/Version**: Rust 1.77.2+ (edition 2021) with Tauri v2 for the backend; TypeScript 5.x on React 19 for the frontend. No language change — but the backend gains an async runtime surface.
**Primary Dependencies**:

- **New (backend)**: `turso` (0.8.x, `features = ["sync"]`) — the local-first store engine with `push()`/`pull()`; `tokio` (rt-multi-thread, macros, time) — the async runtime the Turso crate needs and which Tauri already uses; an HTTP client for the Usage API (`reqwest` with rustls, or `ureq`) — the backend's second network caller after the updater; and a credential-store crate (`keyring` with its Windows backend, or the already-present `windows-sys` with its `Win32_Security_Credentials` feature) — writes and reads the pasted secrets in **Windows Credential Manager**.
- **Removed (backend)**: `rusqlite` (and its `bundled` C build). The MSVC prerequisite it introduced for the *build machine* goes away (the Turso engine is pure Rust).
- **Reused (backend)**: `tauri-plugin-dialog` · `tauri-plugin-opener` · `tauri-plugin-single-instance` · `tauri-plugin-updater` · `serde`/`serde_json`/`uuid`.
- **Reused (frontend)**: everything already present. **No new frontend dependency** is needed for this module (the gauge and loaders are built from existing Tailwind tokens and icons).

**Storage**: The practitioner's one store file, now a **Turso local-first database** (`tax-statements.sqlite`; location still remembered in `settings.json`). Schema unchanged in shape (statements, customers, bills, bill_items, bill_wallets, app_meta) except that **attachment bytes move out** to a local `attachments/` folder beside the store (R5); the store keeps an attachment reference only. Amounts stay integer paisa. A small local `sync-state.json` (beside `settings.json`) records whether there are un-pushed changes and when the last successful push was. The cloud **secrets** are held **only** in Windows Credential Manager — never in the store, in `settings.json`, or in any file the application writes (FR-046).
**Testing**: Per the developer's standing direction, **no automated backend tests** — the command surface is exercised end to end (see [quickstart.md](./quickstart.md)). The existing frontend Vitest suite must keep passing; the new frontend pieces (cloud seam, close-warning logic) are covered by the in-memory twin as the project already does.
**Target Platform**: Windows 10/11 desktop, single practitioner, fully offline-capable. Development on Windows via `npm run tauri dev`.
**Project Type**: Single desktop application (Tauri shell + React webview), extended in place at `tax-statements-analysis/`; no new project (the `sync-poc` crate stays a separate throwaway and is not linked).
**Performance Goals**: Push/Sync complete in a few seconds for a text-only store of thousands of records; a slow or long exchange shows continuous progress. The View Bills/Statements lists keep their existing "under 2 seconds" behaviour. The storage gauge refreshes within the action that changed usage.
**Constraints**: The application MUST remain fully usable offline **once set up** (FR-001). The installer carries no secrets, and the cloud secrets live only in Windows Credential Manager (FR-044–FR-049); nothing the application writes may contain them. Only text records sync; attachments never reach the cloud (FR-039, FR-041). Last push wins; no custom reconciliation (FR-019, FR-043). Sync must never disturb an in-progress entry (FR-023).
**Scale/Scope**: 1 practitioner, 1 store per computer, a handful of connected computers, 6 user stories, ~10 new Tauri commands, text-only data within the 5 GB free allowance.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution: `.specify/memory/constitution.md` v1.0.0 (ratified 2026-09-14). Evaluated against the project's four principles.

| # | Principle | Status | Evidence / notes |
|---|-----------|--------|------------------|
| I | Code Standards (file header → crux marker → footer) | PASS (planned) | Every new Rust and TypeScript source file opens with `بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ` and closes with `وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ`. The crux marker `وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ` goes on the load-bearing logic: **opening the store as a synced database**, the **push/pull + outcome classification**, the **attachment-bytes extraction that keeps the store text-only**, the **close-time un-pushed-changes check**, and the **webview close interception**. Spec/plan Markdown artifacts carry no header/footer, following Module 3 precedent. |
| II | Quality Standards (accuracy, reliability, efficiency, clarity) | PASS, with objections re-raised | **Accuracy**: conflicts are settled by the store's own rule, so there is no bespoke merge to get wrong; the attachment split keeps the cloud copy text-only. **Reliability**: an unreachable cloud is classified and reported, never crashes an exchange, and never alters local data; the app stays usable offline because the engine is local-first. **Efficiency**: only changed logical rows cross the wire (Turso CDC); the list queries are unchanged. **Clarity**: a new `cloud/` module isolates everything network-facing, and `store/` keeps the only database access. |
| III | Supervised Collaboration | PASS, with the pivotal decision surfaced | The store-engine swap, the secrets-onboarding-and-Credential-Manager decision, the drop of content reconciliation, and the attachment-bytes relocation are all recorded here, in [research.md](./research.md) and in Complexity Tracking for the Developer rather than applied silently. |
| IV | Constructive Objection | OBJECTIONS RAISED — see below | Three objections, each with alternatives. |

**Objection 1 — onboarding now gates the whole application, not just sync.** The developer directed that the secrets be pasted at setup and kept in Windows Credential Manager. This is better than the earlier build-time token — which was extractable from the binary by anyone holding it — and that idea is dropped. The consequences to note are that a computer whose secrets were never pasted is **unusable** (FR-005), whereas Modules 1–3 needed only a store; and that Windows Credential Manager is per-Windows-user, so the secrets are exposed to anyone using that Windows account. *Options:* (a) gate the whole application as directed, with a clear onboarding screen; (b) gate only the Sync/Push actions and let offline work continue without secrets (smaller user-facing change, but contradicts the developer's "application access is not possible without these secrets"); (c) gate the application but offer an offline-only escape. **Recommendation: (a) as directed.** Recorded for the Developer; not a blocker.

**Objection 2 — the engine swap replaces proven, spec-compliant storage.** Modules 1–3 ship on `rusqlite` with a single-file, rollback-journal store and thorough behaviour. Moving to the async Turso engine rewrites every store module and the whole command surface, and depends on engine parity for `STRICT`, `PRAGMA application_id`/`user_version`, `CHECK`, `COLLATE NOCASE`, foreign keys and cascade. *Options:* (a) engine swap as directed, front-loaded with the parity spike (R1); (b) keep `rusqlite` and add a Turso "exchange" database plus a change queue and app-side merge (smaller blast radius, but reintroduces the reconciliation the developer explicitly dropped and is *not* a literal store upgrade); (c) swap only the text tables and keep attachments in a separate engine. **Recommendation: (a) as directed, gated on R1**, with (b) as the documented fallback if R1 fails.

**Objection 3 — the attachment split amends Module 2's "one file is the whole backup" promise.** Keeping the cloud copy text-only requires attachment bytes to leave the synced store, which means a store is now the synced database **plus** a local attachments folder — two things to move and back up. *Options:* (a) split as planned and update Module 2's guarantee to "the store file plus the attachments folder"; (b) leave attachments in the store and accept that they sync (violates the client's cost constraint — rejected); (c) since the client does not yet use files, drop attachments from this module's stores entirely (rejected: would strand existing attachment data). **Recommendation: (a).**

**Result**: PASS. No violation blocks implementation; the deliberate structural choices are recorded in Complexity Tracking and the three objections are left open for the Developer.

### Post-Design Constitution Re-check

Re-evaluated after Phase 1 (2026-10-15): still **PASS**. The design adds one new module (`cloud/`) and keeps `store/` the only place the database is touched; it introduces no speculative abstraction; it honours Principle I for every created source file; and it preserves the spec's invariants (usable offline, last push wins, text-only cloud, never trap the practitioner at close). The three objections remain open and none blocks implementation.

## Project Structure

### Documentation (this feature)

```text
specs/004-cloud-sync/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── tauri-commands.md    # the new Rust/IPC cloud surface
│   └── cloud-repository.md  # the frontend seam additions
├── checklists/
│   └── requirements.md  # /sp.specify output (clarifications + revisions)
└── tasks.md             # /sp.tasks output (NOT created here)
```

### Source Code (repository root)

The application already exists as a Tauri v2 + React app at `tax-statements-analysis/`. This module changes it in place; `[NEW]` marks files added, `[CHG]` files changed, `[ENG]` files rewritten from `rusqlite` to the async Turso engine.

```text
tax-statements-analysis/
├── src-tauri/
│   ├── Cargo.toml                                   # [CHG] drop rusqlite; add turso(sync), tokio, reqwest, credential store
│   ├── capabilities/default.json                    # [CHG] only if the frontend close hook requires it (R6)
│   └── src/
│       ├── lib.rs                                   # [CHG] register cloud/onboarding commands; start sync task; close handling
│       ├── state.rs                                 # [ENG] tokio::sync::Mutex; hold the store engine + sync handle
│       ├── settings.rs                              # [CHG] keep storage location only; secrets come from the credential store
│       ├── cloud/
│       │   ├── mod.rs                               # [NEW] open as synced/local engine; push/pull/checkpoint/stats
│       │   ├── config.rs                            # [NEW] read the secrets from the credential store; is_configured()
│       │   ├── secrets.rs                           # [NEW] env-file parse/validate + Windows Credential Manager read/write
│       │   ├── outcome.rs                           # [NEW] classify a sync attempt into the outcome taxonomy
│       │   ├── usage.rs                             # [NEW] Turso Usage API client (storage left)
│       │   ├── schedule.rs                          # [NEW] startup pull + hourly pull + dirty flag
│       │   └── sync_state.rs                        # [NEW] local un-pushed-changes marker (sync-state.json)
│       ├── commands/
│       │   ├── mod.rs                               # [CHG] pub mod cloud, pub mod onboarding
│       │   ├── cloud.rs                             # [NEW] cloud_push/pull/status/usage
│       │   ├── onboarding.rs                        # [NEW] get_setup_state / save_secrets (the setup gate)
│       │   ├── storage.rs                           # [CHG] assess/carry through the async engine
│       │   ├── statements.rs                        # [ENG] async
│       │   ├── bills.rs                             # [ENG] async
│       │   ├── attachments.rs                       # [ENG] read/write bytes from the local attachments folder
│       │   └── error.rs                             # [CHG] add cloud error kinds
│       ├── store/
│       │   ├── mod.rs                               # [ENG] async open/verify/migrate against the Turso engine
│       │   ├── schema.rs                            # [CHG] migrate v4→v5 (attachment bytes out) + Turso-compatible DDL
│       │   ├── statements.rs                        # [ENG] async
│       │   ├── bills.rs                             # [ENG] async
│       │   ├── customers.rs                         # [ENG] async
│       │   ├── carry.rs                             # [ENG] async, skips the attachments folder
│       │   └── attachments.rs                       # [NEW] the local-only attachment vault (bytes on disk)
│       └── temp.rs                                  # [CHG] unchanged behaviour; async-safe
│
└── src/                                             # FRONTEND
    ├── App.tsx                                      # [CHG] mount cloud header pieces, close-warning, sync events, setup gate
    ├── data/
    │   ├── repositories.ts                          # [CHG] CloudRepository + SetupRepository interfaces + error kinds
    │   ├── tauri.ts                                 # [CHG] Tauri implementation (invoke + events)
    │   └── in-memory.ts                             # [CHG] in-memory twin for tests
    ├── domain/
    │   └── types.ts                                 # [CHG] CloudStatus, SyncOutcome, CloudUsage, CloudPhase
    ├── hooks/
    │   └── useCloudSync.ts                          # [NEW] sync state, events, close interception
    └── components/
        ├── layout/RevealHeader.tsx                  # [CHG] host Push/Sync + gauge in the action cluster
        ├── onboarding/
        │   ├── SetupGate.tsx                        # [NEW] the setup gate: storage + secrets (FR-005)
        │   ├── SecretsDialog.tsx                    # [NEW] the paste-the-env-file screen (FR-044)
        │   └── SecretsStatus.tsx                    # [NEW] shows whether the secrets are set, with re-paste
        ├── cloud/
        │   ├── CloudActions.tsx                     # [NEW] Push + Sync buttons, disabled/offline states
        │   ├── SyncProgress.tsx                     # [NEW] the loader shown for the duration of an exchange
        │   ├── StorageGauge.tsx                     # [NEW] purple "Turso Cloud" storage-left gauge
        │   ├── CloudOutcomeMessage.tsx              # [NEW] the plain-language outcome per attempt
        │   └── CloseWarningDialog.tsx               # [NEW] "push before closing?" warning (FR-025)
        └── providers/DataProvider.tsx               # [CHG] inject the cloud repository
```

**Structure Decision**: Single desktop application, extended in place. The Rust side gains exactly one new concern — `cloud/` — and keeps `store/` as the only place the database is touched; the engine swap is contained inside `store/` and `state.rs`, so the rest of the backend changes only from sync to async and from `rusqlite` types to Turso types. The frontend keeps its repository seam: `CloudRepository` joins the injected interfaces, so components still never import `tauri.ts`.

## Complexity Tracking

> No constitution violations. The table records deliberate structural choices so they are explicit.

| Choice | Why Needed | Simpler alternative rejected because |
|--------|------------|--------------------------------------|
| **Swap the store engine** `rusqlite` → `turso` (async) with `tokio` | The store itself must be a local-first database that can `push()`/`pull()` — the developer's explicit direction, and the only way the app's real data syncs rather than a copy of it. | Keeping `rusqlite` and syncing a separate "exchange" database needs a change queue + app-side merge — which reintroduces the reconciliation the developer explicitly dropped — and is not the requested store upgrade. |
| **Async everywhere in the store/command layer** | The Turso crate is async and Tauri already runs on tokio. | A blocking bridge (spawn + block) inside every command would be a fragile pseudo-sync layer over an async engine. |
| **`tokio::sync::Mutex` for `AppState`** | The store lock is now held across `await` points; a `std::sync::Mutex` guard cannot be held across an await. | Keeping `std::sync::Mutex` across awaits does not compile for `Send` futures (Tauri commands). |
| **Attachment bytes leave the synced store** (local attachments folder + reference row) | The whole store now syncs; attachment BLOBs in it would flow to the cloud, breaking the client's text-only, cost-minimal rule (FR-039/FR-041/FR-042). | Leaving BLOBs in the store makes the synced copy grow with files and violates the 5 GB constraint. Keeping a second un-synced table in the same file is impossible — a whole DB syncs together. |
| **`cloud/` module + `CloudRepository` seam** | Isolates every network-facing call (sync, usage, config) from the local store, mirroring how `store/` isolates SQL. | Calling Turso sync and the Usage API from the command functions directly would scatter networking across the IPC layer. |
| **Un-pushed-changes marker kept locally** (`sync-state.json`) | FR-025 needs a reliable "there are un-pushed changes" answer at close; the happened-since-last-push fact is cleaner to track than to infer. | Inferring solely from WAL/size heuristics is fragile; storing the flag in the synced store would push our own bookkeeping to the cloud. |
| **Progress indicator as a first-class outcome state** (FR-036/FR-037) | The developer asked for a loader because exchanges may be slow, especially once files are involved. | A bare spinner without the final outcome would leave the practitioner unsure whether it finished. |
| **Secrets pasted at onboarding, kept in Windows Credential Manager** (R4) | The developer rejected packaging secrets in the installer as unreliable; a per-install setup that stores them in the OS credential store is safer and needs no network to set up or use. | Baking a token into the build (extractable — the rejected idea), or asking the practitioner to re-enter the secrets every session. |
| **The setup gate covers the secrets as well as the store** (FR-005) | The developer directed that the application is unusable until the secrets exist, exactly like the storage choice. | Gating only the Sync/Push actions would contradict that; gating the whole application keeps one consistent "setup" step. |

## Phases

- **Phase 0 — Outline & Research**: see [research.md](./research.md). Every unknown is resolved; no `NEEDS CLARIFICATION` remains, but R1 is an explicit *spike-before-implement* gate.
- **Phase 1 — Design & Contracts**: see [data-model.md](./data-model.md), [contracts/](./contracts/) and [quickstart.md](./quickstart.md).
- **Phase 2 — Tasks**: deferred to `/sp.tasks`.

### Suggested delivery order

1. **P0 spike (R1)** — prove the Turso engine against the existing schema: open a copy of a real store, exercise `STRICT`, `PRAGMA application_id`/`user_version`, `CHECK`, `COLLATE NOCASE`, FK cascade, and a BLOB-free statement/bill round trip. *Gate: if parity fails, stop and choose the fallback (Objection 2b).*
2. **Engine swap** — `store/` + `state.rs` + commands to async Turso; drop `rusqlite`; keep Modules 1–3 behaviour identical offline (regression by hand).
3. **Attachment split** — schema v5, the local attachments folder, carry/assess adjustments.
4. **Cloud core** — `cloud/` (open as synced engine, push/pull, outcome classification, config from the build), `cloud_push`/`cloud_pull`/`cloud_status` (US1, US2).
5. **Header UX** — Push/Sync buttons, progress indicator, outcome messages, storage gauge (US1, US2, US5).
6. **Automatic sync** — startup pull, hourly pull, event + list refresh (US3).
7. **Close safeguard** — un-pushed detection + close warning (US4).
8. **Setup & secrets (US6, P1 prerequisite)** — the onboarding secrets screen, env-file parsing and validation, Windows Credential Manager read/write, and the setup gate alongside the storage choice. This is the prerequisite every other step assumes, so it may land first.

## Risks & Follow-ups

- **Engine parity (highest).** The Turso engine is a rewrite; `STRICT`, `PRAGMA application_id`/`user_version`, `CHECK`, `COLLATE NOCASE`, `FOREIGN KEY ... ON DELETE CASCADE` and `PRAGMA table_info` must all behave before the migration is written. Mitigation: the R1 spike gates implementation; fallback is Objection 2(b).
- **Opening a store written by `rusqlite`.** The existing file must open in the Turso engine without loss. Mitigation: the spike opens a **copy** of a real store and verifies by round trip; nothing is written back to the original during the spike.
- **Async migration blast radius.** Every store module and command changes signature. Mitigation: mechanical, module by module, with the offline behaviour of Modules 1–3 re-checked by hand at each step.
- **Whole-store sync vs. text-only.** Attachments must be out of the store before the first push, or the cloud copy bloats. Mitigation: the attachment split (step 3) lands **before** push/pull is enabled (step 4).
- **`bootstrap_if_empty` semantics.** On a machine with existing local data, bootstrapping from the remote could fight the local store. Mitigation: open with `bootstrap_if_empty(false)` and rely on an explicit `pull()` (R2), matching the docs' offline-first pattern.
- **Un-pushed-changes detection.** Getting FR-025 wrong either warns when there is nothing or stays silent when there is. Mitigation: the explicit local marker set on every mutation and cleared only on a **successful** push.
- **Close interception.** A webview `onCloseRequested` + `destroy()` path needs the right capability, and a Rust `prevent_close` path needs an event round trip. Mitigation: R6 picks the frontend approach and adds only the capability it needs.
- **Secrets live in Windows Credential Manager.** They are per-Windows-user, so anyone using that Windows account can use them; the application keeps no other copy and never logs or displays them. Mitigation: rely on the OS store, keep the values out of every file the app writes, and offer re-paste to rotate (Objection 1).
- **Onboarding is a hard gate.** A computer whose secrets were never pasted is unusable (FR-005). Mitigation: a clear onboarding screen with a specific message per missing value, shown alongside the storage choice.
- **Env-file parsing.** A partner's env file must be parsed strictly; a missing or garbled value must be rejected with a specific message rather than silently saving a partial set. Mitigation: a small strict parser (KEY=VALUE; comments and blank lines ignored) plus a required-keys check (R4).
- **Credential store unavailable.** Windows Credential Manager may be locked or unreadable. Mitigation: report it and refuse to run without secrets, rather than silently running with none.
- **Usage API details.** The Usage endpoint needs an **organisation slug**, a **database name** and a **platform token** — distinct from the database auth token. Mitigation: all three are part of the pasted secrets (R4); the gauge shows *unavailable* when they are missing.
- **No automated guard.** Per the developer's direction there are no backend tests; the engine swap and the attachment migration are the module's riskiest paths and are verified by hand (see `quickstart.md`).
