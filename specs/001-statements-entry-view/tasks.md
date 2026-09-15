---
description: "Task list for Income & Expenditure Statement Capture and Review (Module 1)"
---

# Tasks: Income & Expenditure Statement Capture and Review (Module 1)

**Input**: Design documents from `specs/001-statements-entry-view/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: Included. The feature spec does not demand TDD, but `plan.md` and `quickstart.md` specify a Vitest + RTL stack with concrete test files, so test tasks are carried through per story.

**Organization**: Tasks are grouped by user story so each story is independently implementable, testable, and deliverable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Every task includes an exact file path

## Path Conventions

Single desktop application. All paths are relative to the app root **`tax-statements-analysis/`**. Tests live beside their source (`*.test.ts[x]`) rather than in a separate `tests/` tree.

## ⚠️ Constitution Principle I — Code Standards (applies to EVERY task below)

Every source file created or edited MUST follow the ratified constitution (`.specify/memory/constitution.md`):
1. **Start** with the file header: `بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ`
2. **Mark the crux** of critical logic with: `وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ` — required on the repository `create`/`findByDateRange` logic and the totals/balance computation.
3. **End** with the footer: `وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ`

This is not repeated in each task description; T039 verifies compliance.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize the styling, component, and test toolchain in the existing Tauri + React scaffold.

- [x] T001 Initialize Tailwind CSS v4 and shadcn/ui in `tax-statements-analysis/` (generates `components.json`, `src/lib/utils.ts`, base tokens in `src/index.css`, and Tailwind wiring in `vite.config.ts`)
- [x] T002 [P] Install runtime dependencies (react-hook-form, zod, @hookform/resolvers, date-fns, react-day-picker, @tanstack/react-table, react-icons, framer-motion) in `tax-statements-analysis/package.json`
- [x] T003 [P] Install and configure Vitest + React Testing Library (`vite.config.ts`, `src/test/setup.ts`)
- [x] T004 [P] Confirm/extend the generated `cn()` class-merge helper in `tax-statements-analysis/src/lib/utils.ts`
- [x] T005 [P] Extend the dark-first theme tokens with the green CTA palette (`#44cc00`, hover `#38a800`), soft-grey surfaces, and rounded radii in `tax-statements-analysis/src/index.css`

**Checkpoint**: Toolchain ready — shadcn components can be generated and tests can run.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Domain types, the repository seam, and the app shell that EVERY user story depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T006 [P] Define domain types (`Statement`, `NewStatement`, `BusinessProfile`, `StatementFilter`, `StatementSummary`, `StatementType`) in `tax-statements-analysis/src/domain/types.ts`
- [x] T007 [P] Implement formatting helpers (₨ money, ISO `YYYY-MM-DD`, `"None"` fallback) in `tax-statements-analysis/src/lib/format.ts`
- [x] T008 Create the In-Flow / Out-Flow nature catalog in `tax-statements-analysis/src/lib/natures.ts` (depends on T006)
- [x] T009 Implement zod schemas for statement input and date-range filter in `tax-statements-analysis/src/domain/validation.ts` (depends on T006, T008)
- [x] T010 Define the repository interfaces (`StatementRepository`, `BusinessProfileRepository`) in `tax-statements-analysis/src/data/repositories.ts` (depends on T006)
- [x] T011 Implement the in-memory repositories with the duplicate-submission guard in `tax-statements-analysis/src/data/in-memory.ts` (depends on T009, T010)
- [x] T012 Create the `DataProvider` context that injects repository instances in `tax-statements-analysis/src/components/providers/DataProvider.tsx` (depends on T011)
- [x] T013 Build the app shell with the Create / View `Tabs` and a header slot in `tax-statements-analysis/src/App.tsx` (depends on T012)
- [x] T014 Remove the scaffold demo (greet usage, demo rules in `src/App.css`, `src/assets/react.svg`) in `tax-statements-analysis/`

**Checkpoint**: Types, validation, the repository seam, and the two-tab shell exist — user stories can now start.

---

## Phase 3: User Story 1 - Record a Statement (Priority: P1) 🎯 MVP

**Goal**: A working Create form that records an income/expenditure statement with a dependent Type→Nature selector and a gated submit.

**Independent Test**: Fill the form with date/type/nature/amount, submit, and confirm the statement is stored and retrievable via the repository (nothing else needs to exist).

### Tests for User Story 1

- [x] T015 [P] [US1] Unit tests for statement/filter validation rules in `tax-statements-analysis/src/domain/validation.test.ts`
- [x] T016 [P] [US1] Unit tests for money/date/`"None"` formatting in `tax-statements-analysis/src/lib/format.test.ts`
- [x] T017 [P] [US1] Contract tests C-01, C-02, C-06, C-08, C-09 for the repository seam in `tax-statements-analysis/src/data/repositories.test.ts`
- [x] T018 [US1] Component test for Create gating and Type→Nature reset in `tax-statements-analysis/src/components/statements/CreateStatementForm.test.tsx`

### Implementation for User Story 1

- [x] T019 [P] [US1] Generate the shadcn primitives (button, input, label, popover, calendar, form) into `tax-statements-analysis/src/components/ui/`
- [x] T020 [P] [US1] Build the noise-background CTA in `tax-statements-analysis/src/components/statements/NoiseButton.tsx`
- [x] T021 [US1] Build the dependent Type/Nature selector (Nature disabled until Type chosen; resets on Type change) in `tax-statements-analysis/src/components/statements/TypeNatureSelect.tsx` (depends on T008, T019)
- [x] T022 [P] [US1] Build the single-file attachment field in `tax-statements-analysis/src/components/statements/FileAttachmentField.tsx`
- [x] T023 [US1] Build the horizontal "Create Statements" form with react-hook-form and the gated submit in `tax-statements-analysis/src/components/statements/CreateStatementForm.tsx` (depends on T009, T012, T021, T022)
- [x] T024 [US1] Wire the create form into the Create tab and reset on success in `tax-statements-analysis/src/App.tsx` (depends on T023)
- [x] T025 [US1] Add the in-flight submit guard so rapid double-clicks record only one statement in `tax-statements-analysis/src/components/statements/CreateStatementForm.tsx` (depends on T023)

**Checkpoint**: User Story 1 is fully functional and independently testable.

---

## Phase 4: User Story 2 - Review Statements Over a Date Range (Priority: P2)

**Goal**: A View tab with From/To calendars, a filtered statements table, and Total In-Flow / Total Out-Flow / Balance.

**Independent Test**: Create statements across dates, filter to a range, and confirm the exact rows, `"None"` fallbacks, and three totals — US1 is the only prerequisite.

### Tests for User Story 2

- [x] T026 [P] [US2] Unit tests for inclusive filtering, empty set, and balance in `tax-statements-analysis/src/domain/summary.test.ts`
- [x] T027 [US2] Component test for row rendering (`"None"`), pagination, and the totals footer in `tax-statements-analysis/src/components/statements/StatementsTable.test.tsx`

### Implementation for User Story 2

- [x] T028 [P] [US2] Generate the shadcn table primitives into `tax-statements-analysis/src/components/ui/table.tsx`
- [x] T029 [US2] Implement the summary computation (inclusive range, totals, balance) in `tax-statements-analysis/src/domain/summary.ts` (depends on T006)
- [x] T030 [US2] Build the From/To date-range filter with the current-month default and invalid-range handling in `tax-statements-analysis/src/components/statements/DateRangeFilter.tsx` (depends on T019)
- [x] T031 [US2] Build the statements data table with columns, `"None"` fallbacks, and client-side pagination in `tax-statements-analysis/src/components/statements/StatementsTable.tsx` (depends on T028, T029)
- [x] T032 [US2] Build the totals/balance footer in `tax-statements-analysis/src/components/statements/SummaryFooter.tsx` (depends on T029)
- [x] T033 [US2] Wire the View tab (filter + table + footer) into `tax-statements-analysis/src/App.tsx` (depends on T030, T031, T032)

**Checkpoint**: Users 1 and 2 both work independently; the app is now genuinely useful.

---

## Phase 5: User Story 3 - Personalise the Business Header (Priority: P3)

**Goal**: A branded header with a Settings dialog that edits the brand name, location, and contacts.

**Independent Test**: Open Settings, edit fields, save, and confirm the header reflects the new values immediately.

### Tests for User Story 3

- [x] T034 [P] [US3] Component test for settings save → header update in `tax-statements-analysis/src/components/layout/SettingsDialog.test.tsx`

### Implementation for User Story 3

- [x] T035 [US3] Seed the default business identity in `tax-statements-analysis/src/data/in-memory.ts` (depends on T011)
- [x] T036 [US3] Build the reveal header (brand, location, contacts, green `LuScale` logo, Settings trigger) in `tax-statements-analysis/src/components/layout/RevealHeader.tsx` (depends on T012, T013)
- [x] T037 [US3] Build the Settings dialog for editing the business profile in `tax-statements-analysis/src/components/layout/SettingsDialog.tsx` (depends on T035, T036)
- [x] T038 [US3] Mount the header and dialog, and re-render from the saved profile, in `tax-statements-analysis/src/App.tsx` (depends on T037)

**Checkpoint**: All three user stories are independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Consistency, compliance, and end-to-end validation.

- [x] T039 [P] Verify EVERY created source file complies with constitution Principle I (header, crux marker, footer) across `tax-statements-analysis/src/`
- [x] T040 [P] Verify dark-theme consistency and the green CTA palette (default/hover) across all components
- [x] T041 [P] Verify ISO dates and `₨ #,##0.00` amounts render identically in form, table, and totals (FR-033, SC-007)
- [x] T042 Remove any remaining scaffold artifacts and unused assets in `tax-statements-analysis/`
- [x] T043 Run the `quickstart.md` verification scenarios end-to-end and record results
- [x] T044 Update run/test instructions in `tax-statements-analysis/README.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS all user stories**.
- **User Stories (Phase 3–5)**: All depend on Foundational completion.
  - US1 → US2 → US3 in priority order, or in parallel if staffed.
- **Polish (Phase 6)**: Depends on all targeted stories being complete.

### User Story Dependencies

- **US1 (P1)**: After Foundational. No dependency on other stories. **Delivers the MVP.**
- **US2 (P2)**: After Foundational. Independently testable; reads data that US1 writes, but its filter/table/totals can be verified against a seeded repository.
- **US3 (P3)**: After Foundational. Fully independent of US1 and US2 (only touches the business profile).

### Within Each User Story

- Tests MUST be written and FAIL before implementation.
- Domain/helpers → components → wiring.
- Story complete and validated before moving to the next priority.

### Critical Path

`T001 → T003 → T006/T007 → T008 → T009 → T010 → T011 → T012 → T013 → T023 → T024 → T025`

---

## Parallel Opportunities

- **Setup**: T002, T003, T004, T005 all run in parallel after T001.
- **Foundational**: T006 and T007 in parallel; T008 follows T006.
- **US1 tests**: T015, T016, T017 in parallel; T019 and T020 in parallel.
- **US2**: T026 alone (test), T028 in parallel with T029.
- **Once Foundational completes**: US2 and US3 can proceed in parallel with US1 (different files).

### Parallel Example: User Story 1

```bash
# Tests first (must fail):
Task: "Unit tests for validation in src/domain/validation.test.ts"
Task: "Unit tests for formatting in src/lib/format.test.ts"
Task: "Contract tests for repository create/find in src/data/repositories.test.ts"

# Then independent components:
Task: "Generate shadcn primitives into src/components/ui/"
Task: "Build noise-background CTA in src/components/statements/NoiseButton.tsx"
Task: "Build file attachment field in src/components/statements/FileAttachmentField.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup → 2. Phase 2 Foundational → 3. Phase 3 US1
4. **STOP and VALIDATE** — a statement can be recorded and retrieved
5. Demo the MVP

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. US1 → validate → **MVP** (record statements)
3. US2 → validate → statements become reviewable with totals
4. US3 → validate → branded header/settings
5. Polish → compliance + end-to-end pass

---

## Notes

- **[P]** = different files, no dependencies on incomplete tasks.
- **Tests are carried from `plan.md`/`quickstart.md`**, not demanded by the feature spec; drop Phase test tasks if you want implementation-only delivery.
- **Constitution Principle I applies to every file** — see the warning block above; T039 verifies it.
- Statements are **immutable** (FR-032): no edit/delete tasks exist anywhere by design.
- Module 1 **persists nothing**; cross-restart retention (SC-006) is out of scope and belongs to the backend module.
