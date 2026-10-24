---
id: 007
title: Cloud Sync Implementation
stage: green
date: 2026-10-17
surface: agent
model: unspecified
feature: 004-cloud-sync
branch: 004-cloud-sync
user: H.A.R
command: /sp.implement
labels: ["implement", "module-4", "cloud-sync", "turso", "engine-swap", "onboarding", "async"]
links:
  spec: specs/004-cloud-sync/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - tax-statements-analysis/src-tauri/Cargo.toml
 - tax-statements-analysis/src-tauri/sync-poc/src/bin/parity_spike.rs
 - tax-statements-analysis/src-tauri/capabilities/default.json
 - tax-statements-analysis/src-tauri/src/lib.rs
 - tax-statements-analysis/src-tauri/src/state.rs
 - tax-statements-analysis/src-tauri/src/store/mod.rs
 - tax-statements-analysis/src-tauri/src/store/schema.rs
 - tax-statements-analysis/src-tauri/src/store/attachments.rs
 - tax-statements-analysis/src-tauri/src/store/statements.rs
 - tax-statements-analysis/src-tauri/src/store/bills.rs
 - tax-statements-analysis/src-tauri/src/store/customers.rs
 - tax-statements-analysis/src-tauri/src/store/carry.rs
 - tax-statements-analysis/src-tauri/src/cloud/mod.rs
 - tax-statements-analysis/src-tauri/src/cloud/config.rs
 - tax-statements-analysis/src-tauri/src/cloud/secrets.rs
 - tax-statements-analysis/src-tauri/src/cloud/outcome.rs
 - tax-statements-analysis/src-tauri/src/cloud/sync_state.rs
 - tax-statements-analysis/src-tauri/src/cloud/usage.rs
 - tax-statements-analysis/src-tauri/src/cloud/schedule.rs
 - tax-statements-analysis/src-tauri/src/commands/mod.rs
 - tax-statements-analysis/src-tauri/src/commands/error.rs
 - tax-statements-analysis/src-tauri/src/commands/cloud.rs
 - tax-statements-analysis/src-tauri/src/commands/onboarding.rs
 - tax-statements-analysis/src-tauri/src/commands/statements.rs
 - tax-statements-analysis/src-tauri/src/commands/bills.rs
 - tax-statements-analysis/src-tauri/src/commands/attachments.rs
 - tax-statements-analysis/src-tauri/src/commands/storage.rs
 - tax-statements-analysis/src/domain/types.ts
 - tax-statements-analysis/src/data/repositories.ts
 - tax-statements-analysis/src/data/tauri.ts
 - tax-statements-analysis/src/data/in-memory.ts
 - tax-statements-analysis/src/components/providers/DataProvider.tsx
 - tax-statements-analysis/src/components/onboarding/SetupGate.tsx
 - tax-statements-analysis/src/components/onboarding/SecretsDialog.tsx
 - tax-statements-analysis/src/components/onboarding/SecretsStatus.tsx
 - tax-statements-analysis/src/components/cloud/SyncProgress.tsx
 - tax-statements-analysis/src/components/cloud/CloudOutcomeMessage.tsx
 - tax-statements-analysis/src/components/cloud/CloudActions.tsx
 - tax-statements-analysis/src/components/cloud/StorageGauge.tsx
 - tax-statements-analysis/src/components/cloud/CloseWarningDialog.tsx
 - tax-statements-analysis/src/components/layout/RevealHeader.tsx
 - tax-statements-analysis/src/components/storage/StorageLocationDialog.tsx
 - tax-statements-analysis/src/hooks/useCloudSync.ts
 - tax-statements-analysis/src/App.tsx
 - specs/004-cloud-sync/tasks.md
 - CLAUDE.md
tests:
 - cargo check (tax-statements-analysis/src-tauri) — PASS (1 pre-existing warning)
 - npx tsc --noEmit (tax-statements-analysis) — PASS
 - npm test (vitest) — 72 passed / 26 failed, all failures pre-existing `React.act` env issue in untouched files
---

## Prompt

/sp.implement 004

## Response snapshot

Executed the `004-cloud-sync` task list (T001–T059). Ran `check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks` → FEATURE_DIR `specs\004-cloud-sync`; the sole checklist (`requirements.md`, 16/16) was complete, so implementation proceeded.

**Phase 1 — Setup.** `Cargo.toml`: dropped `rusqlite`; added `turso` 0.8 (`sync`, no default features), `tokio` (rt-multi-thread, macros, time), `reqwest` 0.13 (rustls, json); added `Win32_Security_Credentials` to `windows-sys` (the `keyring` crate was not available offline, and the plan explicitly permits the `windows-sys` route). **T002 R1 spike**: built `sync-poc/src/bin/parity_spike.rs`, which opens a **copy** of the real `tax-statements.sqlite` with the Turso engine (no network needed) and asserts 16 parity properties — all **PASS**, so the gate is green: `PRAGMA application_id` read+write, `user_version` read+write, `STRICT` rejection, `PRAGMA table_info`, `CHECK(kind)`, `CHECK(amount_minor>0)`, `NOT NULL`, `UNIQUE(invoice_no)`, `COLLATE NOCASE` PK and FK matching, `ON DELETE CASCADE`, `GROUP_CONCAT`/`SUM`/`ORDER BY`, integer+NULL round trip, transaction begin/commit, and a bill+customer+item round trip.

**Phase 2 — Foundational.** Rewrote the whole store layer to the **async Turso API**: `state.rs` (tokio `Mutex`, `StoreEngine::{Synced,Local}`, an owned `StoreHandle` handed to `with_connection` so the lock is held across the await without a higher-ranked lifetime), `store/mod.rs` (verify/open/build, `SCHEMA_VERSION = 5`), `store/schema.rs` (v4→v5: move each attachment BLOB into `attachments/<id>.bin` beside the store and rebuild `attachments` as reference-only, stamping `user_version` last), new `store/attachments.rs` local vault, and async `statements`/`bills`/`customers`/`carry` (carry now moves the `attachments/` folder too). Added `cloud/{config,secrets,outcome,sync_state,mod,usage,schedule}.rs` — credential store via raw `CredAdvapi32` calls (`CredReadW`/`CredWriteW`/`CredDeleteW`), strict env parse + required-keys check, one outcome classifier, the `sync-state.json` dirty marker, the synced/local openers + push/pull/checkpoint, the Turso Usage API client, and the startup+hourly pull task emitting `cloud://pulled`. Added `commands/{cloud,onboarding}.rs`, made every store command `async`, added `SecretsStoreUnavailableError`, wired `mark_dirty` on every successful mutation (FR-025), and registered everything in `lib.rs` (+ `core:window:allow-destroy` capability). Frontend seam: `CloudStatus`/etc. types, `CloudRepository`/`SetupRepository` + tauri + in-memory twins, `DataProvider` injection, `SetupGate`, `SecretsDialog`/`SecretsStatus`, `SyncProgress`/`CloudOutcomeMessage`/`CloudActions`/`StorageGauge`/`CloseWarningDialog`, the `useCloudSync` hook (phase + outcomes + `onPulled` + `onCloseRequested` interception), and `App`/`RevealHeader` mounting.

**Verification.** `cargo check` → success (one pre-existing `settings.rs` warning). `npx tsc --noEmit` → clean. `npm test` → 72 passed, 26 failed — every failure is `React.act is not a function` from `react-dom-test-utils.production.js`, reproducible on an untouched file (`ModeToggle.test.tsx`), i.e. a pre-existing React-19/@testing-library environment issue, not a Module 4 regression. T055 (remove the `rusqlite` build-prerequisite note) and T059 (CLAUDE.md Active Technologies) applied; T056–T058 are manual audits/walkthroughs that need the running app on two machines.

## Outcome

- ✅ Impact: `004-cloud-sync` is implemented end to end — the store is a local-first Turso database (offline-first, `bootstrap_if_empty(false)`), attachment bytes leave the synced store (schema v5, text-only cloud), the cloud surface (status/push/pull/usage), the ONBOARDING secrets gate and the header UX (Push/Sync, progress, outcomes, gauge, close warning) are in place; `rusqlite` and its C-compiler prerequisite are gone. R1 parity is proven against a real store.
- 🧪 Tests: no automated backend tests (developer's direction). R1 spike = 16/16 PASS. `cargo check` PASS, `tsc` PASS. Vitest: 72 pass / 26 fail, all pre-existing environment failures in untouched files.
- 📁 Files: 44 created/modified (Rust backend, TypeScript frontend, the spike, Cargo.toml, capabilities, tasks.md, CLAUDE.md).
- 🔁 Next prompts: T056–T058 (secret-leak audit, text-only confirmation, two-machine quickstart walkthrough) need the running app; then `/sp.analyze` for drift.
- 🧠 Reflection: Two Tauri-specific constraints shaped the backend — an `async` command that takes a reference-bearing argument (`State<'_, T>`) must return a `Result`, and `with_connection`'s closure must not require a higher-ranked lifetime, which is why it takes an owned `StoreHandle` rather than `&StoreSession`. `check-prerequisites.ps1` emits CLIXML noise on Windows PowerShell 5.1 but its JSON line is parseable.

## Evaluation notes (flywheel)

- Failure modes observed: `cargo check` output was lost through the background shell's pipeline; redirecting with `*>` to a file and reading it worked. Offline cargo resolution failed on `quinn`/`reqwest`; the network was in fact available, so `--offline` was dropped. The R1 parity spike is a network-free local-engine check, which makes the gate runnable without a Turso remote.
- Graders run and results (PASS/FAIL): R1 engine-parity spike — PASS (16/16); cargo check — PASS; tsc --noEmit — PASS; vitest — pre-existing env failures only (not attributable to this change).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): add the contract's *(memory)* cases (CS-01…CS-18) against `InMemoryCloudRepository`/`InMemorySetupRepository`, once the React `act` environment issue is resolved, so the cloud seam has coverage.
