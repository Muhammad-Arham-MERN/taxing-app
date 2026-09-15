# Specification Quality Checklist: Local Statement Persistence and Editing (Module 2)

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-14
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

### Validation iteration 1 — 2026-09-14 (draft)

Two [NEEDS CLARIFICATION] markers were raised rather than guessed, because neither had a safe default:

1. **FR-011** — how the local database is provided on the practitioner's machine. Module 1's plan recorded the opposite decision (SQLite deferred to Module 2), so a default was not available.
2. **Assumptions (Attachments)** — the maximum attachment size. Module 1 allowed "any type, any size" on the reasoning that files sat loose on disk; moving file contents inside the store changed the cost of an unbounded size.

A third question was raised on scope rather than left as a marker: whether persisting the header details belonged in this module (it had been added as a P3 story to close Module 1 FR-027).

### Validation iteration 2 — 2026-09-14 (after the first clarifications)

All three questions were answered and the specification was updated:

- **Storage (FR-011)** — resolved to a single self-contained local SQL file (SQLite), with no separate installation or server. This reconciles the module with Module 1's plan.
- **Attachment size** — resolved to **no size limit**. The developer's answer added a requirement that was not in the draft: a date-range review must carry file *names* only, and file contents must be fetched only on request for one statement at a time. This became the metadata-only requirements and their success criteria, and it is the reason an unbounded size is safe.
- **Header details** — resolved to **out of scope**: the details stay fixed and cannot be updated. The P3 header story was removed.

### Validation iteration 3 — 2026-09-14 (storage directory)

The developer then changed direction on where the store lives and on the header control. Two further questions were asked, both of which could have cost the practitioner data if guessed:

- **Directory change with existing records** (FR-019, FR-020) — answered: the application takes the data from the store previously in use, creates a new store file in the newly chosen directory, and pushes all of the previous data into it; the same happens again on every subsequent change.
- **First use** (FR-013, FR-014) — answered: prompt, and the practitioner **must browse and choose** a directory. There is no suggested default, and nothing on the frontend is available until one is chosen.

The answer to the first question also carried a hard gate that the draft did not have — *"they should not be able to perform anything on frontend unless and until a directory is selected"* — now written as FR-015 and SC-006.

Structural changes made in this iteration:

- A new **User Story 2 (P2) — Choose and Move Where Statements Are Stored**, with 10 acceptance scenarios. The correction story moved to **User Story 3 (P3)**; US1 gained a note that a chosen directory is its only prerequisite.
- Requirements renumbered to 53, with a new **Choosing and moving the storage directory** group (FR-013–FR-026).
- The earlier "storage lives in the practitioner's application data area and the practitioner never has to choose" assumption was **replaced**, not appended to, since it directly contradicted the new answer.
- The storage-engine clarification was corrected: it previously implied the store was created automatically on first run, which conflicted with the mandatory browse-before-use gate.

Section-level results:

- **No [NEEDS CLARIFICATION] markers remain** — PASSES. Six decisions are recorded in the Clarifications section, including the amendment chain on the header control, so the reasoning survives.
- **No implementation details** — PASSES with one documented exception: the store is named as SQL/SQLite in FR-011, the Clarifications and the Assumptions, because the developer chose it explicitly. The practitioner-facing half of FR-011 — no separate installation, configuration or administration — is behaviour, not technology.
- **Success criteria technology-agnostic** — PASSES. SC-001–SC-015 describe user-visible outcomes, counts and elapsed times; none names a language, framework, engine or API.
- **Requirements testable and unambiguous** — PASSES. The gating rule is expressed as a countable fact (SC-006: 0 statements created or reviewed before a directory exists), and the carry-across as SC-009 (0 records lost, 0 records deleted from any other store).
- **Scope clearly bounded** — PASSES. FR-050 rules out statement deletion, FR-053 rules out header *content* customisation, and the Scope boundary assumption names deletion, header content, UI file viewing, reporting/exports, analytics, multi-user access and other layout changes as out of scope — while explicitly pulling the Settings-to-storage-directory control swap *into* scope.
- **Supersession recorded** — PASSES. FR-052 supersedes Module 1's immutable-statement rule (Module 1 FR-032); FR-053 supersedes Module 1 FR-027 and FR-018 supersedes Module 1 FR-026. Every other Module 1 requirement is explicitly preserved by FR-051.

### Open items carried to planning

- ~~**The previously used store file is left in place** after a directory change~~ — **resolved** in the 2026-09-14 `/sp.clarify` session: the developer confirmed it is left untouched and the destructive alternative was rejected (FR-022, assumption updated).
- **Carry-across must be atomic enough to survive interruption** (FR-021). The specification states the outcome — no records lost, old store still usable — but not the mechanism, which is a design decision.
- **Where the chosen path is remembered** is assumed to be a small settings value outside the store, since the application must find the store before it can read anything from it.
- **Adopting an existing store** found in a newly chosen directory (FR-026) is an informed guess, not a stated requirement. It preserves records and gives the practitioner a way back to a previously used folder.
- **Removing the Settings control** (FR-018) is a frontend change that Module 1's code currently contradicts; how it is removed belongs to planning.
- **File contents remain obtainable on demand** (FR-036) with nothing in the UI to consume them yet, per Module 1's no-open/no-preview rule.

### Validation iteration 4 — 2026-09-14 (`/sp.clarify`)

A targeted ambiguity scan was run against this spec. Five candidate questions were queued; four were answered and one was deferred by the developer. Each accepted answer was integrated immediately into the Clarifications section, the relevant requirements, the edge cases and the success criteria.

- **Concurrency** — resolved: only one copy of the application may use the store; a second copy refuses to start (FR-054, SC-016). Previously entirely unaddressed, and a genuine corruption risk for a single-file store.
- **Where the folder may be** — resolved: any folder is allowed, but cloud-synced, network and removable locations are warned about before being accepted (FR-055, SC-017). This also required amending the "Private by default" edge case, which previously claimed unconditionally that data is never exposed to another machine.
- **A damaged store** — resolved: reported plainly, left completely untouched, with no automatic repair, no partial recovery and no empty store substituted (FR-056, SC-018).
- **The previous store file** — resolved: left where it is, untouched (FR-022, assumption updated). This closes an open item from iteration 3.
- **Store upgrades across future application versions** — **deferred** by the developer until an update mechanism exists. Recorded as an explicit out-of-scope declaration in the Assumptions rather than left silent, so the plan does not invent an upgrade path.

Two defects were also repaired while reviewing the file against the new answers: an edge case covering a store that cannot be opened had been lost during the iteration-3 rewrite and was restored, and the "Private by default" edge case would have contradicted FR-055 had it been left as written.

### Validation iteration 5 — 2026-09-14 (recovering from a backup file)

The developer added a disaster-recovery path: the practitioner can point the application at a store file they already hold instead of only being able to have one created for them. Three questions were asked before writing it.

- **What happens to the records in the file already in use** — answered: they are carried into the newly chosen file, which becomes the working file.
- **Work on the chosen file where it is, or on a copy** — answered: where it is. Recorded as an explicit assumption that the file stops being a pristine backup, since that is a deliberate consequence rather than an oversight.
- **Statements already present when records are carried in** — the developer identified a **flaw** in the unconditional carry-across that FR-019 had been carrying since iteration 3: a practitioner may deliberately want to drop the old data. The rule was changed from "the carry-across happens" to a question asked at the moment of the change — bring the previous records across, or start fresh without them.

Changes in this iteration:

- **New User Story 4 (P4) — Recover Records From a Backup File**, 7 acceptance scenarios. It is the highest-stakes journey in the module but the rarest, so it sits below the routinely needed journeys.
- **FR-019 and FR-020 rewritten** so the carry-across is a choice, not an automatic behaviour. FR-019 previously mandated carrying every record across; that is now one of two options.
- **New requirements group "Using an existing store file"** (FR-057–FR-064): pointing the application at a file already held, verifying it really is a store of this application before use, rejecting anything else untouched, leaving the practitioner where they were after a rejection, adopting the file in place, not duplicating or overwriting statements on a carry-across, and accepting a valid but empty store file.
- **FR-013 and FR-014 widened** from choosing a directory to choosing a location — either a directory in which a store is created, or a store file already held.
- **Success criteria 18 → 22**, adding recovery fidelity (SC-019), rejection safety (SC-020), no duplication on carry-across (SC-021), and the prompt itself (SC-022).
- **Key entities reworked**: "Stored data set" and "Storage directory" became "Stored data set", "Store file" and "Storage location", since the thing chosen is no longer always a directory.
- **US2's acceptance scenarios 1, 5–9 rewritten** to cover both ways to begin and the start-fresh option.

Terminology was normalised across the whole specification after the change: "storage location" is now the canonical term for where the records live, with "storage directory" reserved for the folder case, and SC-006 through SC-009 were updated to match.

### Validation iteration 6 — 2026-09-14 (opening and saving attachments)

The developer added the last piece of the retrieval story: clicking a stored attachment hands it to the operating system so it opens in the practitioner's preferred application, and a copy can be saved elsewhere on demand. Module 1 had explicitly forbidden this ("no open or preview action"), so the change supersedes a rule rather than only adding one.

Two questions were asked; on the first the developer chose against the recommendation.

- **Temporary copies** — answered: written to a folder the application manages, separate from the store, cleared on the next launch. Chosen over deleting immediately, which would risk removing a file still being read by the viewer.
- **Types that run code** — the recommendation was to warn before opening programs, scripts and shortcuts. The developer chose **"open anything, always"**: no exception and no warning. This is a security-relevant decision taken with the consequence stated, so it is recorded in both the Clarifications section and the Assumptions rather than left as an unremarked gap. FR-071 spells out the behaviour and points at the assumption.

Changes in this iteration:

- **New User Story 5 (P5) — Open or Save an Attachment**, 8 acceptance scenarios.
- **New requirements group "Opening and saving an attachment"** (FR-065–FR-075): the file name is actionable in the list and while editing, contents are written to a temporary file with the original name and extension, temporary copies live in an app-managed folder and are cleared on next launch and never deleted while in use, a copy can be saved through the system's own save prompt, and a failure to open is reported with saving still available.
- **FR-051 amended** — the preserved Module 1 behaviour no longer claims the file name carries no open action; the exception is stated inline as a supersession.
- **Success criteria 22 → 27**, covering fidelity of what is handed to the system (SC-023), that opening alters nothing (SC-024), that saved copies are identical (SC-025), single-action opening (SC-026), and that temporary copies never accumulate (SC-027).
- **Nine edge cases added**, including no handler for the type, a code-running attachment, a very large attachment being opened, the same file opened twice, a crash leaving copies behind, and a viewer still holding the file.
- **Scope boundary corrected**: "any file viewing or opening action in the UI" was listed as out of scope in every previous iteration and is now in scope — an entry that would have directly contradicted the new requirements.
- **"Attachments are opaque" assumption rewritten**: the application still never interprets contents itself, but it now deliberately hands a copy to the operating system, and Module 1's no-open rule is marked superseded.
- **Two assumptions added**: temporary copies exist outside the store (the accepted trade-off), and any file type opens with no warning (the accepted risk).

### Re-validation

Complete at iteration 6. All 16 checklist items still pass, with the single documented exception on the SQL/SQLite naming. Requirements run FR-001–FR-075 with no gaps or duplicates; success criteria run SC-001–SC-027; five user stories, each independently testable.

