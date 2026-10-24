---
id: 006
title: Cloud Sync Task Breakdown
stage: tasks
date: 2026-10-15
surface: agent
model: unspecified
feature: 004-cloud-sync
branch: 004-cloud-sync
user: H.A.R
command: /sp.tasks
labels: ["tasks", "module-4", "cloud-sync", "turso", "onboarding", "turso-engine-swap"]
links:
  spec: specs/004-cloud-sync/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/004-cloud-sync/tasks.md
tests:
 - none
---

## Prompt

/sp.tasks

## Response snapshot

Ran `check-prerequisites.ps1 -Json` (FEATURE_DIR = `specs/004-cloud-sync`, docs: research.md, data-model.md, contracts/, quickstart.md) and generated `specs/004-cloud-sync/tasks.md`: 59 dependency-ordered tasks in the strict `- [ ] T0NN [P?] [Story] description (path)` format, with exact backend/frontend paths.

Phases: **Setup** (T001 deps incl. dropping `rusqlite`; T002 the R1 engine-parity spike as a hard gate), **Foundational** (T003–T030: the async Turso engine swap across `state.rs`/`store/*`/`commands/*`, the v4→v5 attachment split, `cloud/{config,secrets,outcome,sync_state,mod}.rs`, `commands/{cloud,onboarding}.rs`, registration, the frontend types/seam (`CloudRepository`, `SetupRepository`, tauri + in-memory implementations, `DataProvider`), `SetupGate`, shared `SyncProgress`, and the `App.tsx` mount), then one phase per story in priority order — **US6** setup/secrets (T031–T034), **US1** Push/MVP (T035–T039), **US2** Sync/pull (T040–T043), **US3** automatic sync (T044–T046), **US4** close safeguard (T047–T049), **US5** storage gauge (T050–T053) — and **Polish** (T054–T059: run the existing Vitest suite, retire the `rusqlite` build prerequisite, audit for leaked secrets, confirm the text-only cloud, walk the quickstart, update CLAUDE.md). Included the dependency graph, per-phase checkpoints, parallel examples and the MVP-first strategy. No test tasks (the spec directs "write no tests").

## Outcome

- ✅ Impact: `004-cloud-sync` has an immediately executable, story-organized task list that respects the engine-parity gate and the US6 setup prerequisite.
- 🧪 Tests: none (developer's direction); the existing Vitest suite is run only as a regression check (T054).
- 📁 Files: specs/004-cloud-sync/tasks.md
- 🔁 Next prompts: `/sp.implement` (or `/sp.analyze` first)
- 🧠 Reflection: The engine swap is the dominant cost and is correctly entire-Phase-2 rather than tied to a story; the attachment split is placed before any cloud push so the cloud copy is text-only from the first push. US1 and US2 share three files, so the list keeps them sequential rather than parallel despite both being early stories.

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): checklist-format validation — PASS (every task has a checkbox, ID, story label where required, and a file path); no vague tasks
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): run `/sp.analyze` to cross-check tasks against spec/plan, then start T002 (the R1 spike).
