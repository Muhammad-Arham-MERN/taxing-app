---
id: 003
title: Module 2 Spec Clarifications
stage: spec
date: 2026-09-14
surface: agent
model: unspecified
feature: 002-statements-persistence
branch: 002-statements-persistence
user: H.A.R
command: /sp.clarify
labels: ["spec", "clarify", "module-2", "concurrency", "privacy", "recovery"]
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

/sp.clarify

(No additional free-text input was supplied; the command template was executed against the active feature spec at specs/002-statements-persistence/spec.md.)

## Response snapshot

Ran `check-prerequisites.ps1 -Json -PathsOnly` to resolve the active feature, then performed a structured ambiguity scan across the full taxonomy. Five candidate questions were queued by impact × uncertainty; four were answered and one was deferred. Each accepted answer was integrated into the spec immediately — Clarifications bullet, requirements, edge cases and success criteria — before moving to the next question.

**Q1 — Concurrency (Edge Cases / Reliability).** Nothing in the spec addressed the application being opened twice, and with one shared SQL file two writers can corrupt it. Answered: the second copy refuses to start and points the practitioner at the copy already running. → FR-054, SC-016, edge case "Application opened twice".

**Q2 — Where the folder may be (Security & Privacy).** The newly added user-chosen directory created a conflict the spec did not acknowledge: a cloud-synced, network or removable folder breaks FR-008/FR-009/FR-012 ("never leaves the machine", "not readable from another machine"). Answered: any folder remains permitted, but such locations are warned about before acceptance and proceed only on confirmation. → FR-055, SC-017, new edge case, and an amendment to the "Private by default" edge case, which had stated the guarantee unconditionally.

**Q3 — A damaged store (Reliability & Recovery).** Answered: reported plainly, left completely untouched, no automatic repair, no partial recovery, no empty store substituted. → FR-056, SC-018, edge case "Damaged store file".

**Q4 — Store upgrades across application versions (Versioning).** **Deferred** by the developer: "lets leave this for now, we will add this feature later on when i add the update feature". Recorded as an explicit out-of-scope declaration in the Assumptions so the plan does not invent an upgrade path. No Clarifications bullet was added, since only accepted answers belong in that section.

**Q5 — The previous store file after a directory change (flagged open item from iteration 3).** Answered: leave it where it is, untouched. This confirms FR-022 as written and removes the "worth confirming at planning time" caveat from the assumption.

Two defects were repaired during review: an edge case covering a store that cannot be opened had been lost in the iteration-3 rewrite, and the "Private by default" edge case would have directly contradicted FR-055.

## Outcome

- ✅ Impact: The spec's four highest-risk gaps — a corruption path, a privacy guarantee it was silently breaking, a total-data-loss failure mode, and an unconfirmed destructive-adjacent assumption — are now decided, testable requirements.
- 🧪 Tests: none (specification artifact only).
- 📁 Files: specs/002-statements-persistence/spec.md (FR-054–FR-056, SC-016–SC-018, 5 Clarifications bullets, 3 edge cases added/amended, 2 assumptions updated), specs/002-statements-persistence/checklists/requirements.md (validation iteration 4).
- 🔁 Next prompts: `/sp.plan` to design the store, the directory gate, the carry-across and single-instance handling.
- 🧠 Reflection: Two of the five questions existed only because of the previous turn's change. Adding a user-chosen storage directory silently invalidated the spec's privacy guarantee and introduced a two-writer risk; neither was visible until the taxonomy scan walked non-functional categories rather than re-reading the feature text.

## Evaluation notes (flywheel)

- Failure modes observed: one internal slip — the preamble for Q3 was emitted one message early, before the Q2 integration edit, so a future question's topic was disclosed before its turn. Harmless here but it breaks the one-question-at-a-time discipline the command specifies.
- Graders run and results (PASS/FAIL): post-write validations — PASS (one Clarifications bullet per accepted answer; no unresolved placeholders; FR-001–FR-056 and SC-001–SC-018 sequential with no gaps or duplicates; no contradictory earlier text remaining).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): after each accepted answer, check whether it invalidates any *non-functional* statement elsewhere in the spec (privacy, offline, single-user) rather than only the sections the answer directly touches.
