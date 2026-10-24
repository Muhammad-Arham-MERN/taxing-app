---
id: 004
title: Cloud Sync Implementation Plan
stage: plan
date: 2026-10-15
surface: agent
model: unspecified
feature: 004-cloud-sync
branch: 004-cloud-sync
user: H.A.R
command: /sp.plan
labels: ["plan", "module-4", "cloud-sync", "turso", "store-engine-swap", "offline-first"]
links:
  spec: specs/004-cloud-sync/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/004-cloud-sync/plan.md
 - specs/004-cloud-sync/research.md
 - specs/004-cloud-sync/data-model.md
 - specs/004-cloud-sync/quickstart.md
 - specs/004-cloud-sync/contracts/tauri-commands.md
 - specs/004-cloud-sync/contracts/cloud-repository.md
 - specs/004-cloud-sync/spec.md
 - specs/004-cloud-sync/checklists/requirements.md
tests:
 - none
---

## Prompt

/sp.plan

(No arguments. In the course of the command the assistant asked two focused architecture questions; the developer answered:)

Q1 "How should Turso sync integrate with the app's current SQLite store (which Modules 1–3 already use via rusqlite)?" →
"swap store engine approach from rusqlite to turso, that is why i got turso it is good at locals + cloud, moreover keep Last Push Wins as native and remove my duplication reconciliation idea"

Q2 "Since you chose one central cloud shared by all installs, how should each installed app get the shared Turso Cloud credentials?" →
"they dont need the credentials as they will be shipped to app via tauri build"

## Response snapshot

Ran the planning workflow (setup-plan.ps1 → plan.md template copied; branch `004-cloud-sync`). Researched Turso Cloud (quickstart, Rust reference, Sync usage, conflict resolution, Usage API) and the developer's `sync-poc` POC, and read the current backend (`store/mod.rs`, `state.rs`, `settings.rs`, `lib.rs`, commands) and frontend (`App.tsx`, `RevealHeader.tsx`, `package.json`) plus Module 3's plan/research/data-model/contracts for house style. Because the store-engine choice is pivotal, asked the developer; the answer was to **swap the engine from `rusqlite` to the async `turso` crate**, keep **last push wins** as native and **drop the content-based duplication-reconciliation idea**, and **ship the cloud credentials in the Tauri build**. Updated the spec first to reflect this (Overview, Clarifications, Edge Cases, FR-011/FR-019/FR-034/FR-043, Key Entities, SC-012, Assumptions; removed the dedupe requirements and SC-017/SC-018) and refreshed the requirements checklist (iteration 4). Then produced the plan artifacts: `plan.md` (Technical Context, Constitution Check with three constructive objections, structure, Complexity Tracking, delivery order, risks), `research.md` (R1 engine-parity spike as a gate, R2 store opening with `bootstrap_if_empty(false)`, R3 async + tokio mutex, R4 build-time credential injection, R5 attachment bytes out of the synced store, R6 close interception, R7 outcome taxonomy, R8 un-pushed marker, R9 automatic sync + event, R10 progress, R11 Usage-API gauge, R12 lists/attachments), `data-model.md` (store v5 + `attachments/` folder + `sync-state.json` + IPC types), `contracts/tauri-commands.md` and `contracts/cloud-repository.md`, and `quickstart.md`. Ran `update-agent-context.ps1 -AgentType claude` (CLAUDE.md gained the new language/database lines).

## Outcome

- ✅ Impact: Module 4 plan complete and internally consistent with the revised spec; ready for `/sp.tasks`.
- 🧪 Tests: none (planning); the module itself is deliberately test-free per the developer's direction, with R1 as a spike gate.
- 📁 Files: specs/004-cloud-sync/{plan.md, research.md, data-model.md, quickstart.md, contracts/*.md, spec.md, checklists/requirements.md}; CLAUDE.md (agent context).
- 🔁 Next prompts: `/sp.tasks`
- 🧠 Reflection: The engine swap is the right literal reading of "upgrade local storage to Turso", but it is large and rests on Turso-engine parity with `STRICT`/`PRAGMA` identity/`CHECK`/`COLLATE NOCASE`/FK cascade — so the plan front-loads the R1 spike as a hard gate and records the fallback. Two consequences worth the developer's eye: the synced store must be text-only, which moves attachment bytes into a local folder and amends Module 2's single-file backup promise (Objection 3); and a token baked into the build is extractable (Objection 1). Both are recorded with options rather than decided silently.

## Evaluation notes (flywheel)

- Failure modes observed: the plan template's Technical Context lines are single-line; the agent-context script captured them verbatim into CLAUDE.md (acceptable, but long).
- Graders run and results (PASS/FAIL): constitution check — PASS with three documented objections; spec checklist — PASS (iteration 4)
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): run the R1 spike before writing any migration, then `/sp.tasks`.
