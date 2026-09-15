---
id: 005
title: Module 2 Attachment Open and Save
stage: spec
date: 2026-09-14
surface: agent
model: unspecified
feature: 002-statements-persistence
branch: 002-statements-persistence
user: H.A.R
command: /sp.specify (follow-up amendment)
labels: ["spec", "module-2", "attachments", "os-integration", "security-decision", "temp-files"]
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

ok one more feature, i know i keep adding features, but i would like to add edge cases as soon as possible, when the files are shown to frontend and user clicks a file to view it, then the mechanism using os's internals should be used to open the file, lets say the user clicks a pdf that they uploaded to open, the system then writes them to a temporary file so it can be viewed with their desired/preffered app to view the pdf, same for images and excel etc. also they should be allowed to download the file to their desired location if they want

## Response snapshot

Amended `specs/002-statements-persistence/spec.md` to add attachment opening through the operating system and saving a copy on demand. This supersedes a rule rather than only adding one: Module 1 explicitly stated the file name carried "no open or preview action", and that clause appeared in the preserved-behaviour requirement FR-051 and in the scope boundary.

Two questions were asked before writing.

1. **Temporary copy management** → written to a folder the application manages, kept separate from the store, cleared on the next launch. Chosen over deleting as soon as the viewer opens, which cannot be done reliably because the application cannot tell when the external program has finished reading.
2. **Types that run code** → **the developer chose against the recommendation.** I recommended warning before opening programs, scripts and shortcuts, because attachments may be any file type and opening them via the shell executes them with the practitioner's privileges. The developer chose "open anything, always". The decision, the consequence, and the fact that it was taken with that consequence stated are recorded in both the Clarifications section and the Assumptions, so that planning neither adds a warning that was considered and declined nor quietly forgets the risk.

Changes:

- **New US5 (P5) — Open or Save an Attachment**, 8 acceptance scenarios.
- **New group "Opening and saving an attachment" (FR-065–FR-075)** — actionable file name in the list and while editing, handing contents to the system rather than shipping a viewer, writing a temporary file carrying the original name and extension, an app-managed temporary folder cleared on next launch, never deleting a copy still in use, any type opening with no exception, saving a copy through the system's save prompt, saving never altering the stored attachment, and reporting a failure to open with saving still available.
- **FR-051 amended** and the **scope boundary corrected** — "any file viewing or opening action in the UI" had been listed as out of scope in every previous iteration and would have directly contradicted the new requirements.
- **"Attachments are opaque" rewritten** — the application still never interprets contents itself, but now deliberately hands a copy to the operating system.
- **SC-023–SC-027** and nine edge cases added.

## Outcome

- ✅ Impact: The retrieval story is complete — an attachment can be fetched, viewed in the practitioner's own application, and saved elsewhere, without the application embedding a viewer or ever modifying the stored record.
- 🧪 Tests: none (specification artifact only).
- 📁 Files: specs/002-statements-persistence/spec.md (US5, FR-065–FR-075, FR-051 amended, SC-023–SC-027, 9 edge cases, 2 clarifications, scope boundary and assumptions corrected), specs/002-statements-persistence/checklists/requirements.md (validation iteration 6).
- 🔁 Next prompts: `/sp.plan` to design the store, the location gate, the carry-across choice, file adoption and the open/save flow.
- 🧠 Reflection: Two separate entries in the spec had been asserting the opposite of this feature since Module 1 — the preserved-behaviour requirement and the scope boundary. Adding a capability is usually additive; this one was subtractive, and the contradiction would have survived a less careful pass.

## Evaluation notes (flywheel)

- Failure modes observed: none in the artifact; a bullet label collision ("Very large attachment") and a lost `---` story separator were caught during the pass and fixed. The substantive risk is that the developer's answer on executable types is a security posture the specification now encodes deliberately — it is written down rather than argued, since the decision was taken with the consequence stated.
- Graders run and results (PASS/FAIL): post-write validation — PASS (FR-001–FR-075 and SC-001–SC-027 sequential with no gaps or duplicates; one Clarifications bullet per accepted answer; no contradictory "no open or preview" text left unsuperseded).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): when adding a capability that reverses an earlier rule, grep for the rule's text first — the same rule tends to appear in more than one section (behaviour list, scope boundary, assumptions).
