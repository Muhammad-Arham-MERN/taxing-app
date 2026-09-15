# Income & Expenditure Statement Analysis — Module 1

Offline desktop UI for recording income and expenditure statements and reviewing them over a date range, with running totals and a balance.

This module is the **frontend only**. Data lives in an in-memory repository behind a typed seam (`src/data/repositories.ts`), so statements reset when the app closes. SQLite/Tauri persistence is deferred to a later module.

## Prerequisites

- Node.js 20+
- Rust toolchain + Cargo (for the Tauri desktop shell)
- Tauri v2 Windows prerequisites: Microsoft C++ Build Tools + WebView2

## Setup

```bash
cd tax-statements-analysis
npm install
```

## Run

```bash
npm run dev          # frontend only, served on http://localhost:1420
npm run tauri dev    # desktop shell against the Vite dev server
npm run tauri build  # produce the Windows installer
```

## Test

```bash
npm test             # Vitest unit, contract and component tests
npm run test:watch   # watch mode
```

## Typecheck and build

```bash
npm run build        # tsc + vite build
```

## Structure

- `src/domain/` — domain types, zod validation, summary computation
- `src/data/` — repository interfaces (the seam) and the in-memory implementation
- `src/lib/` — formatting helpers (`₨ #,##0.00`, ISO dates, `"None"`) and the nature catalog
- `src/components/ui/` — shadcn/ui primitives
- `src/components/statements/` — Create form, statements table, date-range filter, totals footer
- `src/components/layout/` — reveal header and settings dialog

## Notes

- Statements are immutable: no edit or delete actions exist, by design.
- Attachments record the file name only; nothing is copied or persisted.
- The header falls back to the default business identity when the profile has never been customised.
- The View tab defaults to the current calendar month.
