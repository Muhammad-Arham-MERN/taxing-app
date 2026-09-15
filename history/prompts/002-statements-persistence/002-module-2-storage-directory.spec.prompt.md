---
id: 002
title: Module 2 Storage Directory Choice
stage: spec
date: 2026-09-14
surface: agent
model: unspecified
feature: 002-statements-persistence
branch: 002-statements-persistence
user: H.A.R
command: /sp.specify (follow-up amendment)
labels: ["spec", "module-2", "storage-directory", "settings-removal", "gating"]
links:
  spec: specs/002-statements-persistence/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/002-statements-persistence/spec.md
 - specs/002-statements-persistence/checklists/requirements.md
tests:
 - none
---

## Prompt

also add one more thing, remove the settings from frontend, and in place of that we use "Choose Storage Directory" clicking it opens the file system, user can choose whatever directory they desire to create the backend sql file where the data will be stored

## Response snapshot

Amended `specs/002-statements-persistence/spec.md` rather than treating this as a new feature, since it revises the storage model of the module already specified.

Two questions were asked before editing, because both had a plausible answer that could cost the practitioner their records:

1. **What happens to existing statements when the directory is changed?** → Answered: the application takes the data from the previously used store, creates a new store file in the newly chosen directory, and pushes all of the previous data into it; the same process repeats on every later change. The same answer also carried a hard gate not present in the draft — *"they should not be able to perform anything on frontend unless and until a directory is selected"*.
2. **What happens on first launch?** → Answered: prompt, and the practitioner must browse and choose — no suggested default, and the software cannot be used without choosing a directory first.

Spec changes:

- **New User Story 2 (P2) — Choose and Move Where Statements Are Stored**, 10 acceptance scenarios. The correction story became **User Story 3 (P3)** and US1 gained a note that a chosen directory is its only prerequisite.
- **New requirements group** "Choosing and moving the storage directory" (FR-013–FR-026), covering the first-use prompt, browse-only selection, the gate that blocks all other capability, creating the store in the chosen directory, remembering it, the header control replacing Settings, carry-across on every change, interruption safety, not deleting the old store, unwritable directories, cancellation, an unreachable remembered directory, and adopting a store found in a newly chosen directory.
- **FR count 39 → 53**; the editing group renumbered to FR-038–FR-050 and the preserved-Module-1 group to FR-051–FR-053.
- **FR-018** now supersedes Module 1 FR-026 (the Settings control) as well as FR-053 superseding Module 1 FR-027.
- **Success criteria 11 → 15**, adding the gate (SC-006), first-launch speed (SC-007), no re-asking on later launches (SC-008), and lossless carry-across (SC-009).
- **Replaced** (not appended to) the earlier assumption that the store lives in the practitioner's application data area and that the practitioner never chooses — it directly contradicted the new direction.
- Seven new edge cases, including an unreachable directory that must never be silently replaced by an empty store, an interrupted carry-across, and choosing a directory that already holds a store.

Two inconsistencies were caught and fixed while editing: the storage clarification still implied the store was created automatically on first run, which conflicted with the new browse-before-use gate; and the earlier "cannot be updated" header answer needed an explicit amendment note so it read as amended-by, not contradicted-by, the new control.

## Outcome

- ✅ Impact: The practitioner now controls where their financial records physically live, the application cannot be used at all until that choice is made, and changing the location moves the records with them. Module 1's Settings control is formally retired.
- 🧪 Tests: none (specification artifact only).
- 📁 Files: specs/002-statements-persistence/spec.md (amended), specs/002-statements-persistence/checklists/requirements.md (validation iteration 3 added).
- 🔁 Next prompts: `/sp.plan` to design the store provisioning, the directory gate and the carry-across; confirm the open items first if any of them are contentious.
- 🧠 Reflection: The answer to "what about existing data?" implied the gate, and the answer to "first launch?" implied browse-only with no default — neither was in the request itself. Asking both was worth it: the second user story exists only because of those two answers.

## Evaluation notes (flywheel)

- Failure modes observed: the first pass of this amendment left a stale "created automatically on first run" claim in the Clarifications section that survived until the spec was re-read against the new requirements. Sequential-review catches it; a consistency grep over prior decisions would catch it faster.
- Graders run and results (PASS/FAIL): specification quality checklist — PASS (16/16, 1 documented exception).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): after amending a spec, grep the earlier Clarifications and Assumptions for statements the new answer invalidates, instead of relying on re-reading.
