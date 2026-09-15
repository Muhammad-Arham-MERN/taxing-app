# Implementation Plan: Income & Expenditure Statement Capture and Review (Module 1)

**Branch**: `001-statements-entry-view` | **Date**: 2026-09-13 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/001-statements-entry-view/spec.md`

## Summary

Module 1 delivers the offline desktop UI for recording income/expenditure statements and reviewing them over a date range with totals and a balance. The application shell is Tauri v2 with a React 19 + TypeScript frontend; this module implements the **frontend only**, exactly as scoped in the spec.

The key architectural decision is a **data-access seam**: all reads/writes go through a small typed repository interface (`StatementRepository`, `BusinessProfileRepository`). Module 1 ships an in-memory implementation of that seam so every screen is fully interactive and testable. The SQLite/Rust persistence and the analytics module later replace the implementation behind the same seam with **no UI refactor**. No backend, storage, or date-processing logic is written in this module.

## Technical Context

**Language/Version**: TypeScript 5.x on React 19 (UI) + Rust edition 2021 with Tauri v2 (shell only, unchanged this module)
**Primary Dependencies**: Tauri v2 (`@tauri-apps/api`), React 19, Vite, Tailwind CSS v4, shadcn/ui, react-hook-form + zod, date-fns + react-day-picker, TanStack Table, react-icons (Lucide `LuScale`), framer-motion (MagicUI/Aceternity components)
**Storage**: Local SQLite via Tauri/Rust — **deferred to Module 2**. Module 1 persists nothing; it uses an in-memory implementation behind the repository seam so the UI behaves end-to-end within a session.
**Testing**: Vitest + React Testing Library (+ `@testing-library/user-event`); jsdom environment. Form, filtering, totals, and formatting are pure and unit-testable.
**Target Platform**: Windows 10/11 desktop, single user, fully offline. Development runs on Windows via `npm run tauri dev`.
**Project Type**: Single desktop application (Tauri shell + React webview). Frontend source lives in `tax-statements-analysis/`.
**Performance Goals**: Statement list and totals render in under 2 seconds for a data set of thousands of statements (SC-002); interaction stays at 60fps with no layout jank.
**Constraints**: No network calls; no authentication; no backend/processing logic in this module; dark-first theme (black/white base, CTA `#44cc00`, hover `#38a800`, soft grey, rounded); all dates ISO `YYYY-MM-DD`; amounts `₨ #,##0.00`; optional values render `"None"`.
**Scale/Scope**: 1 user; 4 UI surfaces (reveal Header + Settings dialog, Create tab, View tab); tens of thousands of statements assumed over the app's lifetime.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution: **ratified** — `.specify/memory/constitution.md` v1.0.0 (2026-09-14). Gate evaluated against the project's own principles.

| # | Principle | Status | Evidence / notes |
|---|-----------|--------|------------------|
| I | Code Standards (file header → crux marker → footer) | PASS (planned) | Every source file this plan creates opens with the required header, carries the crux marker on critical logic (repository create/date-range filter and the totals/balance computation), and closes with the footer. |
| II | Quality Standards (accuracy, reliability, efficiency, clarity) | PASS | Accuracy: the totals/balance invariant (SC-003) lives in pure, tested functions. Reliability: every spec edge case (invalid range, empty set, duplicate submit, bad amount) has a defined handling path. Efficiency: fully local, no network. Clarity: light layered split (`domain` / `data` / `components`). |
| III | Supervised Collaboration | PASS | This plan is a set of recommendations for Developer approval; structural choices are surfaced in Complexity Tracking rather than applied unilaterally. |
| IV | Constructive Objection | N/A | No objection raised; the "frontend only" module boundary is accepted as given. |

**Result**: PASS. No violations requiring Complexity Tracking. The repository seam is recorded below as an explicit structural choice, not a violation — it is the minimum needed to honor the "frontend only, backend later" constraint.

## Project Structure

### Documentation (this feature)

```text
specs/001-statements-entry-view/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── statement-repository.md
│   └── tauri-commands.md
├── checklists/
│   └── requirements.md  # /sp.specify output
└── tasks.md             # /sp.tasks output (NOT created here)
```

### Source Code (repository root)

The application already exists as a Tauri v2 + React scaffold at `tax-statements-analysis/`. This plan extends it in place; it does not create a new project.

```text
tax-statements-analysis/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── components.json                      # shadcn/ui config (new)
├── src/
│   ├── main.tsx
│   ├── App.tsx                          # composes Header + Tabs shell (rewrite)
│   ├── index.css                        # Tailwind v4 entry + theme tokens (new)
│   ├── lib/
│   │   ├── utils.ts                     # shadcn cn() helper (new)
│   │   ├── format.ts                    # money + ISO date formatting (new)
│   │   └── natures.ts                   # In-Flow / Out-Flow nature catalog (new)
│   ├── domain/
│   │   ├── types.ts                     # Statement, BusinessProfile, filter types (new)
│   │   └── validation.ts                # zod schemas + filter rules (new)
│   ├── data/
│   │   ├── repositories.ts              # repository interfaces (the seam) (new)
│   │   └── in-memory.ts                 # in-memory implementation (Module 1) (new)
│   ├── components/
│   │   ├── ui/                          # shadcn-generated primitives (new)
│   │   ├── layout/
│   │   │   ├── RevealHeader.tsx         # brand/location/contacts + settings trigger (new)
│   │   │   └── SettingsDialog.tsx       # edit BusinessProfile (new)
│   │   ├── statements/
│   │   │   ├── CreateStatementForm.tsx  # horizontal form (new)
│   │   │   ├── TypeNatureSelect.tsx     # dependent Type -> Nature popovers (new)
│   │   │   ├── FileAttachmentField.tsx  # single-file picker (new)
│   │   │   ├── StatementsTable.tsx      # data table (new)
│   │   │   ├── DateRangeFilter.tsx      # From/To calendars (new)
│   │   │   ├── SummaryFooter.tsx        # totals + balance (new)
│   │   │   └── NoiseButton.tsx          # Aceternity noise-background CTA (new)
│   │   └── providers/
│   │       └── DataProvider.tsx         # injects repository implementations (new)
│   └── test/
│       └── setup.ts                     # Vitest setup (new)
└── src-tauri/                           # UNCHANGED this module (shell only)
```

**Structure Decision**: Single desktop application. The frontend under `tax-statements-analysis/src/` follows a light layered split — `domain` (types + validation), `data` (repository seam), `components` (UI) — sized for this module, not a large-scale architecture. `src-tauri/` is left untouched because no Rust/backend work is in scope.

## Complexity Tracking

> No constitution violations. The table below records the one deliberate structural choice so it is explicit.

| Choice | Why Needed | Simpler alternative rejected because |
|--------|------------|--------------------------------------|
| Repository seam (`data/repositories.ts` + in-memory impl) | The spec forbids backend/storage work now, yet the UI must be complete; the seam lets Module 2 drop in SQLite/Tauri with zero UI changes. | Directly embedding arrays/state in components would force a UI rewrite when the backend lands, violating the module boundary. |

## Phases

- **Phase 0 — Outline & Research**: see [research.md](./research.md). All technical unknowns resolved; no `NEEDS CLARIFICATION` remain.
- **Phase 1 — Design & Contracts**: see [data-model.md](./data-model.md), [contracts/](./contracts/), and [quickstart.md](./quickstart.md).
- **Phase 2 — Tasks**: deferred to `/sp.tasks`.

### Post-Design Constitution Re-check

Re-evaluated after Phase 1: still **PASS** against constitution v1.0.0. The design keeps interfaces explicit (repository + command contracts), avoids speculative abstractions, honors Principle I (the Code Standards apply to every created source file), and defers all storage concerns to the backend module. No new violations introduced.

## Risks & Follow-ups

- **Code Standards scope**: Principle I says "in each file that is created or edited". This plan applies it to program source files; whether Markdown docs (specs, plans, README) also carry the header/footer is an open interpretation to confirm.
- **`create-new-feature.ps1` is not PowerShell 5.1-safe** (4-arg `Join-Path`); it aborted mid-run during `/sp.specify`. Patch before the next feature.
- **Theme/UI fidelity**: MagicUI/Aceternity "reveal" navbar and "noise" button are copy-in components with their own motion deps; budget for adapting them to the dark/green theme rather than using them verbatim.
