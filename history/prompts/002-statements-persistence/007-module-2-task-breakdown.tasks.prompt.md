---
id: 007
title: Module 2 Task Breakdown
stage: tasks
date: 2026-09-14
surface: agent
model: unspecified
feature: 002-statements-persistence
branch: 002-statements-persistence
user: H.A.R
command: /sp.tasks
labels: ["tasks", "module-2", "rust", "tauri", "user-stories"]
links:
  spec: specs/002-statements-persistence/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/002-statements-persistence/tasks.md
tests:
 - none
---

## Prompt

/sp.tasks

(No additional free-text input was supplied; the command template was executed against the active feature at specs/002-statements-persistence/.)

## Response snapshot

Ran `check-prerequisites.ps1 -Json`, loaded plan.md, spec.md and the optional design artifacts (research.md, data-model.md, contracts/, quickstart.md), and generated `specs/002-statements-persistence/tasks.md`: **55 tasks across 8 phases**.

- **Phase 1 Setup** (T001–T004, 4 tasks) — Rust dependencies, plugin registration with single-instance first, removing the scaffold `greet`, module skeletons.
- **Phase 2 Foundational** (T005–T018, 14 tasks) — the store (open/verify, schema, pragmas), settings.json, Windows location classification, the error enum, the frontend types and seam, the four storage commands, and the gate.
- **Phase 3 US1 (P1)** — 6 tasks. **Phase 4 US2 (P2)** — 8. **Phase 5 US3 (P3)** — 6. **Phase 6 US4 (P4)** — 4. **Phase 7 US5 (P5)** — 6.
- **Phase 8 Polish** (T049–T055, 7 tasks) — the guarantees that span stories plus the release build.

**No test tasks**, per the developer's direction that the backend requires no automated tests and the command's rule to include them only when requested. Each user-story phase instead ends with a verification task that walks the matching `quickstart.md` §4 section and runs the existing Vitest suite.

**One structural judgement is documented rather than hidden.** US2 owns the storage-location story, but FR-015 gates *every* capability behind a chosen location, so no story — including US1 — can be demonstrated without the first-run chooser and the gate. Those therefore sit in Foundational, and US2 carries everything about *changing* a location and carrying records between them. This is stated in the phase itself so it does not read as tasks filed under the wrong story.

A **requirement coverage table** maps all 75 functional requirements to the phase that delivers them, which is the check that nothing in the spec was dropped.

Format validation: all 55 task lines carry a checkbox, a sequential ID, an optional `[P]`, an optional story label (30 story-labelled tasks across US1–US5), and an exact file path. Verified by grep.

## Outcome

- ✅ Impact: The plan is now executable in increments — the application is a working record-keeping tool at the end of Phase 3, and each later phase adds one independently demonstrable capability.
- 🧪 Tests: none generated (by developer direction). The existing Module 1 Vitest suite is kept green by T018 and re-run in every story's verification task.
- 📁 Files: specs/002-statements-persistence/tasks.md (created).
- 🔁 Next prompts: `/sp.analyze` to cross-check spec, plan and tasks for consistency, or `/sp.implement` to start at Phase 1.
- 🧠 Reflection: The task list confirmed a suspicion from planning — Foundational is unusually heavy (14 tasks) because the storage gate is a genuine precondition rather than an ordering preference. Trimming it would produce "working" stories that cannot be run.

## Evaluation notes (flywheel)

- Failure modes observed: none in the artifact. Note that a look-ahead regex is unavailable in the grep tool (rg without PCRE2); format validation was done by listing the task lines instead.
- Graders run and results (PASS/FAIL): checklist format — PASS (55/55); requirement coverage — PASS (all FR groups mapped); story independence — PASS (each phase has its own independent test expressed as a quickstart walkthrough).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): when a blocking precondition belongs to a story that also owns non-blocking work, split the story's phase and say why in the phase itself — it kept this list honest instead of either mislabelling tasks or leaving the MVP undemonstrable.
