# Phase 0 Research: Income & Expenditure Statement Capture and Review (Module 1)

**Feature**: `001-statements-entry-view` | **Date**: 2026-09-13

All technical unknowns from the plan's Technical Context are resolved below. **No `NEEDS CLARIFICATION` items remain.**

---

## R1. How to satisfy "Create records a statement, View shows it" with no backend in scope

- **Decision**: Introduce a typed **repository seam** (`StatementRepository`, `BusinessProfileRepository`) and ship an **in-memory implementation** for Module 1. Components depend only on the interfaces, injected via a single `DataProvider` React context.
- **Rationale**: The spec forbids backend/storage work, but the UI must still be fully interactive and testable (US1 → US2 flow). An interface + in-memory impl is the smallest structure that keeps the UI complete now and lets Module 2 swap in SQLite/Tauri without touching components.
- **Alternatives considered**: (a) Inline `useState` arrays in components — rejected: forces a UI rewrite when persistence lands and makes cross-tab state awkward. (b) TanStack Query over a fake async API — rejected: adds a dependency and async ceremony with no network to manage (YAGNI).

## R2. UI component system

- **Decision**: **shadcn/ui** (copy-in components) on Tailwind CSS v4, installed via the shadcn CLI with the Vite + React guide.
- **Rationale**: Explicit user requirement; components are owned in-repo, so the bespoke dark/green theme (`#44cc00` / `#38a800`) and rounded/"curvy" styling can be applied directly to the generated code.
- **Alternatives considered**: MUI, Ant Design, Mantine — rejected: heavier, opinionated theming that fights the requested minimalist black-and-white look, and not what was requested.

## R3. Tailwind version and wiring

- **Decision**: **Tailwind CSS v4** using the `@tailwindcss/vite` plugin and a CSS-first `src/index.css` with `@theme` tokens; no `tailwind.config.js`.
- **Rationale**: v4 is the current shadcn/ui default, removes the config file, and is faster under Vite. Theme tokens (colors, radii) live in CSS where they can express the soft/rounded palette directly.
- **Alternatives considered**: Tailwind v3 + `tailwind.config.js` — rejected: legacy path, more config to maintain, no benefit here.

## R4. Forms and validation

- **Decision**: **react-hook-form** with a **zod** schema via `@hookform/resolvers`, one schema in `domain/validation.ts` shared by the form and tests.
- **Rationale**: The spec's "Create disabled until all required fields valid" (FR-013) and dependent-field rules (FR-006/009) are naturally expressed as one schema + `formState.isValid`. Zod gives the same rules to unit tests.
- **Alternatives considered**: Manual `useState` validation — rejected: duplicates rules across UI and tests. Formik — rejected: heavier, less current.

## R5. Date input and ISO handling

- **Decision**: shadcn **Calendar** (built on **react-day-picker**) in a Popover for date choice, with **date-fns** for parsing/formatting. Store and display dates as `YYYY-MM-DD` strings; never rely on `Date.toISOString()` for the displayed value (UTC drift).
- **Rationale**: Satisfies FR-003 (calendar picker, default today) and FR-004/SC-007 (ISO format). Local formatting avoids the classic off-by-one-day bug from UTC conversion.
- **Alternatives considered**: Native `<input type="date">` — rejected: inconsistent styling and not the requested component. dayjs — rejected: react-day-picker already pairs with date-fns, so one date lib is simpler.

## R6. Statement table and large-result handling

- **Decision**: shadcn **data-table** (TanStack Table) with **client-side pagination** (e.g., 25 rows/page) and a scrollable container.
- **Rationale**: Resolves the spec's "large result set stays usable" edge case and SC-002 without virtualizing; totals are computed over the full filtered set, independent of the visible page.
- **Alternatives considered**: Render-all with scroll — rejected: degrades on thousands of rows. Virtualized rows (`@tanstack/react-virtual`) — rejected as premature; pagination meets the target.

## R7. Amount formatting

- **Decision**: Format with `Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })` for grouping/decimals, prefixing the literal `₨ ` symbol; implement once in `lib/format.ts`.
- **Rationale**: FR-033/SC-007 need a stable `₨ #,##0.00` everywhere. Using `Intl` directly with a manual prefix avoids locale-dependent symbol output.
- **Alternatives considered**: `Intl.NumberFormat('en-PK', { currency: 'PKR' })` — rejected: emits `PKR`/`Rs`, not the requested `₨`. `toFixed(2)` — rejected: no thousands separators.

## R8. Icons and motion components

- **Decision**: **react-icons** (`react-icons/lu`, `LuScale`) for the logo icon; **framer-motion** (`motion`) to implement the MagicUI/Aceternity **reveal** navbar and **noise-background** button as adapted, in-repo components (`RevealHeader`, `NoiseButton`).
- **Rationale**: Matches the requested references; Aceternity/MagicUI snippets assume `motion`, so adopting it avoids hand-rolled animation code.
- **Alternatives considered**: Copying the registry components verbatim — rejected: their default styling conflicts with the dark/green theme, so adaptation is required anyway. CSS-only animation — rejected: the reveal/noise effects are substantially easier with `motion`.

## R9. Data/async state management

- **Decision**: **No** state library and **no** query cache. Repository instances are provided through React context; components hold local state and re-read the repository after mutations.
- **Rationale**: All data is local and synchronous in Module 1; adding Redux/Zustand/Query would be speculative complexity (Constitution gate 6).
- **Alternatives considered**: TanStack Query, Zustand — rejected as YAGNI for a single-user local app.

## R10. Testing stack

- **Decision**: **Vitest** + **React Testing Library** + `@testing-library/user-event`, `jsdom` environment, configured in `vite.config.ts` with `src/test/setup.ts`.
- **Rationale**: Fast, Vite-native, minimal config; validates the pure logic (validation, filtering, totals, formatting) and the form's enable/disable and dependent-field behavior the spec emphasizes.
- **Alternatives considered**: Jest — rejected: extra config/transpile layers with Vite. Playwright/E2E — deferred: valuable later against the real Tauri binary, not needed for frontend logic.

## R11. File attachment (frontend-only)

- **Decision**: A styled `<input type="file">` (single file) that captures the selected `File` and stores only its **name** (and a transient handle) in form state; nothing is copied or persisted.
- **Rationale**: FR-012/FR-019 and the View "File" column need the file's name only this module; actual file handling is a backend concern.
- **Alternatives considered**: Tauri dialog/filesystem plugin now — rejected: that is backend/native work explicitly out of scope.

## R12. Tauri command surface (defined, not implemented)

- **Decision**: Document the future command surface in `contracts/tauri-commands.md` (`list_statements`, `create_statement`, `get_business_profile`, `save_business_profile`) but **implement none** of them this module. `src-tauri/` is untouched.
- **Rationale**: Gives Module 2 a precise integration target while honoring the "no backend logic" instruction. The repository seam is designed so a future `TauriStatementRepository` is a drop-in.
- **Alternatives considered**: Implementing stub commands now — rejected: violates the explicit module boundary.

## R13. Window/shell configuration

- **Decision**: Keep the existing Tauri window config as-is for this module, but note that the product title (`tax-statements-analysis`) and window size (800×600) are placeholders to revisit when the UI shell is built (brand is "M&M Tax Law Solutions").
- **Rationale**: Shell tweaks are cosmetic and not part of the spec's functional requirements; flagged so they are not forgotten.
- **Alternatives considered**: Changing `tauri.conf.json` now — deferred to avoid mixing scope into a frontend-only plan.
