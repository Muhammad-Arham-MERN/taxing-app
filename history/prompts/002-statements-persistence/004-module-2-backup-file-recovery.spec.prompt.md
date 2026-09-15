---
id: 004
title: Module 2 Backup File Recovery
stage: spec
date: 2026-09-14
surface: agent
model: unspecified
feature: 002-statements-persistence
branch: 002-statements-persistence
user: H.A.R
command: /sp.specify (follow-up amendment)
labels: ["spec", "module-2", "recovery", "backup-file", "carry-across"]
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

one more thing to add, lets say user had a file, but their system died, they had a backup of the sql file somewhere, they recover windows, install app again, now they have to use their past sql file, for this, what they do is when they choose their directory, say they uploaded their backup in D:backups/tax/backup-sql.sql, so what they do is wen they are prompted to select their file directory, they can either "choose a directory, where a file for them will be created" or "they can choose a particular sql file from their directory (the backup file), they choose it and then the system then starts using this file". If the file they use is incorrect or corrupted or not follows the pattern that file is using, that means it is not the backup file so the app rejects it

## Response snapshot

Amended `specs/002-statements-persistence/spec.md` to add a disaster-recovery path: the storage prompt now offers a directory for a new store **or** a store file the practitioner already holds.

Three questions were asked before writing, and the third one changed a rule that had been in the spec since the previous turn:

1. **Records in the file already in use** → carried into the newly chosen file, which becomes the working file.
2. **Work on the chosen file where it is, or on a copy** → where it is (option A). This makes the file the live store, so it stops being a pristine backup — recorded as an explicit assumption rather than left as a silent consequence.
3. **Statements already present when records are carried in** → the developer identified a **flaw** rather than answering directly: an unconditional carry-across leaves no way to deliberately drop the old data. The rule became a question asked at the moment of the change — bring the previous records across, or start fresh without them.

Changes:

- **New US4 (P4) — Recover Records From a Backup File**, 7 acceptance scenarios, framed around the machine-dies-and-is-rebuilt journey.
- **FR-019/FR-020 rewritten** — the carry-across is now a choice with two named outcomes, offered on every change of location, instead of a mandated behaviour.
- **New group "Using an existing store file" (FR-057–FR-064)** — pointing the application at a file already held, verifying it is genuinely a store of this application, rejecting anything else with the file left untouched, leaving the practitioner where they were after a rejection, adopting the file in place, never duplicating or overwriting statements during a carry-across, and accepting a valid but empty store file.
- **FR-013/FR-014 widened** from a directory to a location; **FR-015–FR-026, FR-055, FR-062** reworded to match.
- **Success criteria 18 → 22** and **key entities reworked** ("Stored data set", "Store file", "Storage location") because the thing chosen is no longer always a directory.

A terminology pass followed the change: "storage location" is now canonical for where the records live, with "storage directory" reserved for the folder case. SC-006–SC-009 and US1's Independent Test were corrected to match, having still said "directory" in places where the choice is now wider.

## Outcome

- ✅ Impact: The practitioner can now recover their whole archive from a backup file after a reinstall, which is the scenario that makes the durability work in this module meaningful; and the carry-across rule was corrected before it could hard-code a path that silently prevents a legitimate action.
- 🧪 Tests: none (specification artifact only).
- 📁 Files: specs/002-statements-persistence/spec.md (US4, FR-057–FR-064, FR-013–FR-026/FR-055/FR-062 amended, SC-019–SC-022, 3 Clarifications bullets, 6 edge cases, entities and assumptions reworked), specs/002-statements-persistence/checklists/requirements.md (validation iteration 5).
- 🔁 Next prompts: `/sp.plan` to design the store, the location gate, the carry-across choice and the file-adoption flow.
- 🧠 Reflection: The developer's third answer was a correction, not a clarification — they found a flaw in a rule the previous round had established. It is worth re-reading previously accepted answers whenever a new answer widens the feature, because FR-019 had encoded an assumption nobody had questioned until a second path existed to compare it against.

## Evaluation notes (flywheel)

- Failure modes observed: three rounds of questions on the same area risked tiring the user, and the third surfaced the flaw only because it was asked rather than assumed — the earlier two answers would have produced a wrong rule. No defects in the file this time, unlike iteration 4.
- Graders run and results (PASS/FAIL): post-write validation — PASS (FR-001–FR-064 and SC-001–SC-022 sequential with no gaps or duplicates; one Clarifications bullet per accepted answer; no unresolved placeholders; no stale "directory"-only statements left where the choice is wider).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): when a new capability widens an existing rule, re-read the rules that depend on it and ask whether they still hold, before writing the new ones.
