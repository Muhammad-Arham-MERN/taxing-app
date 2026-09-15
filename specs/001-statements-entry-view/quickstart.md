# Quickstart: Income & Expenditure Statement Capture and Review (Module 1)

**Feature**: `001-statements-entry-view` | **Date**: 2026-09-13
**Scope reminder**: frontend only. No backend, storage, or date-processing logic is implemented in this module.

---

## Prerequisites

- **Node.js** 20+ and npm
- **Rust** toolchain (stable) + **Cargo**
- **Tauri v2 prerequisites** for Windows: Microsoft C++ Build Tools + WebView2 ([[Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)])
- The existing scaffold at `tax-statements-analysis/` (already present)

## Setup

```bash
cd tax-statements-analysis
npm install
```

Add the Module 1 dependencies:

```bash
# styling + components
npm install -D tailwindcss @tailwindcss/vite
npm install class-variance-authority clsx tailwind-merge lucide-react
npx shadcn@latest init          # writes components.json, wires the CSS entry

# forms + validation
npm install react-hook-form zod @hookform/resolvers

# dates + table + icons + motion
npm install date-fns react-day-picker @tanstack/react-table
npm install react-icons framer-motion

# testing
npm install -D vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom
```

Wire Vitest into `vite.config.ts` (`test: { environment: "jsdom", setupFiles: "./src/test/setup.ts" }`).

## Run

```bash
npm run tauri dev      # launches the desktop shell against the Vite dev server on :1420
npm test               # Vitest unit/contract tests
npm run tauri build    # produces the Windows installer
```

---

## Verification Scenarios

Each maps to the spec's acceptance criteria. Module 1 keeps data in memory, so **statements reset when the app closes** — cross-restart retention (SC-006) is verified in the backend module.

### US1 — Record a statement (P1)

1. Open the app → the **Create** tab shows the "Create Statements" form; the date field reads today (ISO) and **Create is disabled**.
2. Open the **Nature** control *before* choosing a Type → it is disabled.
3. Choose Type = **In-Flow** → Nature enables and offers only the 7 In-Flow options.
4. Choose a Nature, then switch Type to **Out-Flow** → the chosen Nature is cleared and the 11 Out-Flow options appear.
5. Enter an amount of `0`, `-5`, or `abc` → Create stays disabled.
6. Enter a valid amount → Create enables. Submit → the statement is recorded and the form resets (date back to today, Create disabled).
7. Double-click Create → only **one** statement is recorded.

### US2 — Review by date range (P2)

1. Create statements on several dates, some inside and some outside the current month.
2. Open the **View** tab → From/To default to the 1st of the current month and today.
3. Confirm only in-range statements are listed (inclusive bounds) with columns **Date · Type · Nature · Remarks · Amount · File**.
4. A statement with no remarks/file shows **"None"** in those columns.
5. Amounts render as **`₨ #,##0.00`** (thousands separators, 2 decimals).
6. Below the table: **Total In-Flow**, **Total Out-Flow**, **Balance** — and Balance = In-Flow − Out-Flow (negative is shown with a minus).
7. Set a range with no matching statements → empty state, totals read `₨ 0.00`.
8. Set From later than To → range is flagged invalid.
9. Set a wide range over a large seeded data set → list stays paginated/responsive (target < 2s).

### US3 — Personalise the header (P3)

1. Click **Settings** in the header → dialog lets you edit brand name, location, and contacts.
2. Save → header updates **immediately**.
3. On first launch (no profile saved) → header shows the default "M&M Tax Law Solutions" identity with the green `LuScale` logo, never blanks.

---

## Automated checks to land with the code

| Area | Test | Asserts |
|------|------|---------|
| Validation | `domain/validation.test.ts` | required fields; amount > 0; nature belongs to type |
| Format | `lib/format.test.ts` | `₨ 1,234.50`; ISO `YYYY-MM-DD`; `"None"` fallback |
| Filtering/totals | `domain/summary.test.ts` | inclusive range; empty → zeros; `balance = in − out` |
| Contract | `data/repositories.test.ts` | cases C-01…C-09 from the repository contract |
| Form UX | `CreateStatementForm.test.tsx` | Create disabled until valid; Type→Nature reset |
| Table UX | `StatementsTable.test.tsx` | "None" rendering; pagination; totals footer |

## Known Module 1 limitations (by design)

- Statements and the business profile are **not persisted** — they reset on app close (backend module).
- The **File** column shows the file's name only; opening/previewing is out of scope (spec clarification).
- No edit/delete actions exist; statements are immutable (spec clarification).
