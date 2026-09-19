---
id: 004
title: Bills and Invoices Task Breakdown
stage: tasks
date: 2026-09-18
surface: agent
model: unspecified
feature: 003-bills-invoice
branch: 003-bills-invoice
user: H.A.R
command: /sp.tasks
labels: ["tasks", "module-3", "bills", "invoices", "pdf", "sqlite-migration"]
links:
  spec: specs/003-bills-invoice/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/003-bills-invoice/tasks.md
tests:
 - none
---

## Prompt

/sp.tasks

## Response snapshot

Generated `specs/003-bills-invoice/tasks.md` — 48 tasks in the strict checklist format (checkbox + ID + optional [P] + [USn] story label + exact file path), organised by user story:

- Phase 1 Setup (T001–T004): add `@react-pdf/renderer`; bill domain types; invoice/footer constants; `formatPkr`.
- Phase 2 Foundational (T005–T017): schema v2 DDL + version-aware verify with the v1→v2 additive migration; `store/customers.rs`; `store/bills.rs` (invoice-number allocation, aggregated list, CRUD); `ErrorKind::UnknownBill`; `commands/bills.rs` (8 commands incl. raw-body invoice open/save); carry-across extension; command registration; the repository seam (interfaces, in-memory + Tauri twins, DataProvider); the four-tab navigation partition.
- Phase 3 US1 (T018–T027, MVP): amount-in-words (+ test), bill zod validation, the react-pdf invoice document, the renderer helper, the line-items editor, the Create Bill form (+ test), App wiring, repository contract cases B-01/B-02/B-04.
- Phase 4 US2 (T028–T034): CustomerFilter, BillFilters, BillsTable (+ test), App view-tab wiring, refresh-key propagation, cases B-05–B-10/B-16/B-17/B-19.
- Phase 5 US3 (T035–T038): EditBillDialog, Edit + Download actions, cases B-11–B-13, App wiring.
- Phase 6 US4 (T039–T041): Delete action with confirmation, cases B-03/B-14/B-15, statement/customer isolation check.
- Phase 7 Polish (T042–T048): standards compliance, npm test/build + cargo check, migration verification, carry-across verification, full quickstart acceptance pass, list performance check.

Dependency notes: Foundational blocks all stories; US1 is the MVP; US2–US4 operate on stored bills so they need US1's data; `App.tsx` and `BillsTable.tsx` are shared files edited by several stories and must be serialised. Parallel opportunities identified per phase.

## Outcome

- ✅ Impact: The plan is broken into an executable, dependency-ordered task list; ready for `/sp.analyze` or `/sp.implement`.
- 🧪 Tests: frontend Vitest tasks included (plan-requested); no backend tests by the developer's direction
- 📁 Files: specs/003-bills-invoice/tasks.md
- 🔁 Next prompts: `/sp.analyze` (consistency check) or `/sp.implement`
- 🧠 Reflection: Keeping the shared files (App.tsx, BillsTable.tsx) explicit as serialisation points avoids the main parallel-execution hazard; front-loading schema/migration/commands as Foundational keeps every story independently demonstrable after it.

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): format validation — 48/48 tasks carry checkbox, ID and a file path (grep-verified)
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): run `/sp.analyze` to check spec/plan/tasks consistency before implementing.
