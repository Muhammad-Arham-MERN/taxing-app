---
id: 004
title: Module 1 Task Breakdown
stage: tasks
date: 2026-09-14
surface: agent
model: unspecified
feature: 001-statements-entry-view
branch: 001-statements-entry-view
user: H.A.R
command: /sp.tasks
labels: ["tasks", "module-1", "frontend", "mvp"]
links:
  spec: specs/001-statements-entry-view/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/001-statements-entry-view/tasks.md
tests:
 - none
---

## Prompt

/sp.tasks

(No additional free-text input was supplied; the /sp.tasks command template was executed against the active feature design documents in specs/001-statements-entry-view/.)

## Response snapshot

Generated `specs/001-statements-entry-view/tasks.md` with 44 dependency-ordered tasks in the strict checklist format (`- [ ] TNNN [P?] [USx] description + path`), organized by user story:

- Phase 1 Setup (T001–T005): Tailwind v4 + shadcn init, runtime deps, Vitest/RTL, `cn()`, theme tokens with the green CTA palette.
- Phase 2 Foundational (T006–T014): domain types, formatters, nature catalog, zod validation, repository interfaces + in-memory impl, DataProvider, two-tab App shell, scaffold cleanup.
- Phase 3 US1 (T015–T025, MVP): validation/format/contract/component tests, shadcn primitives, NoiseButton, TypeNatureSelect, FileAttachmentField, CreateStatementForm, wiring, duplicate-submit guard.
- Phase 4 US2 (T026–T033): summary tests, table primitives, summary computation, DateRangeFilter, StatementsTable, SummaryFooter, View wiring.
- Phase 5 US3 (T034–T038): settings test, default profile seed, RevealHeader, SettingsDialog, mount.
- Phase 6 Polish (T039–T044): Principle I compliance check, theme consistency, ISO/₨ verification, scaffold cleanup, quickstart run, README.

Also included: constitution Principle I warning block at the top (header/crux/footer for every file), dependency graph with critical path, parallel examples, and MVP/incremental strategy.

## Outcome

- ✅ Impact: Module 1 is decomposed into independently testable, story-scoped tasks ready for `/sp.implement`.
- 🧪 Tests: none executed; 9 test tasks planned (US1: 4, US2: 2, US3: 1, plus validation/format covered within US1).
- 📁 Files: `specs/001-statements-entry-view/tasks.md` (new).
- 🔁 Next prompts: `/sp.implement` to execute; `/sp.analyze` to cross-check consistency.
- 🧠 Reflection: Corrected two setup tasks after noticing `shadcn init` already generates `src/lib/utils.ts` and edits `vite.config.ts`, so T004 became "confirm/extend" rather than "create" to avoid duplicate work.

## Evaluation notes (flywheel)

- Failure modes observed: none blocking; tests were included because plan.md/quickstart.md specify the test stack even though the feature spec does not demand TDD — flagged in the tasks Notes so it can be dropped.
- Graders run and results (PASS/FAIL): format validation — PASS (all 44 tasks have checkbox, ID, correct [P]/[Story] labels, and a file path).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): resolve the open Code Standards scope question (source files vs Markdown docs) before implementation so T039 is unambiguous.
