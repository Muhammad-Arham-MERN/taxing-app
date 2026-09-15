# Phase 1 Data Model: Income & Expenditure Statement Capture and Review (Module 1)

**Feature**: `001-statements-entry-view` | **Date**: 2026-09-13

These types live in `tax-statements-analysis/src/domain/types.ts`. They are the contract the UI and the repository seam share. Storage representation (SQLite schema) is **not** defined here — that belongs to the backend module.

---

## Enumerations

### `StatementType`

| Value | Display label | Meaning |
|-------|---------------|---------|
| `"inflow"` | In-Flow | Money received |
| `"outflow"` | Out-Flow | Money spent |

### `NatureValue` (catalog)

Static catalog in `src/lib/natures.ts`. Each entry belongs to exactly one type; the nature selector is driven entirely by this catalog.

| Type | Values (display labels) |
|------|--------------------------|
| `inflow` | Fee for Income Tax · Fee for Sales Tax · Fee for PRA \| KPRA \| SRA \| BRA \| ETC · Audit Fee · Appeal Fee · Miscellaneous Fee · Loan |
| `outflow` | Expenses · Rent · Salaries · Utilities - IESCO \| PTCL \| Mobile · Stationery · Entertainment · Travelling · Taxes · Office Equipments · Others · Receivable |

```ts
type NatureOption = { value: string; label: string; type: StatementType };
```

---

## Entity: `Statement`

A single recorded financial transaction. **Immutable once created** (FR-032) — no update or delete operations exist in this module.

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `id` | `string` | yes | UUID v4; unique identity (assigned at creation). |
| `date` | `string` | yes | ISO `YYYY-MM-DD`; no future restriction; default = today (FR-003, FR-004). |
| `type` | `StatementType` | yes | One of `"inflow"` / `"outflow"` (FR-005). |
| `nature` | `string` | yes | Must be a `NatureOption.value` whose `type` matches `type` (FR-006–FR-009). |
| `amount` | `number` | yes | Finite number, `> 0`, at most 2 decimal places (FR-011, FR-033). |
| `remarks` | `string \| null` | no | Free text; `null` when not provided → renders `"None"` (FR-010, FR-020). |
| `fileName` | `string \| null` | no | Display name of the attached file; `null` → `"None"` (FR-012, FR-019, FR-020). |
| `fileRef` | `string \| null` | no | Opaque handle reserved for the backend module; unused in Module 1. |
| `createdAt` | `string` | yes | ISO 8601 timestamp of creation; used for tie-breaking only. |

**Relationships**: A `Statement` optionally references exactly one `AttachedFile` (embedded as `fileName`/`fileRef`). A `Statement` has no relationship to `BusinessProfile`.

**Lifecycle / state transitions**: `New (draft in form) → Created (immutable)`. The only transition is creation. There is no `Edited` or `Deleted` state in this module.

---

## Entity: `BusinessProfile`

The practitioner's identifying details shown in the header (FR-025–FR-028).

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `brandName` | `string` | yes | Non-empty; falls back to the default identity when unset (FR-028). |
| `location` | `string` | yes | Non-empty; office address. |
| `contacts` | `string[]` | yes | Ordered list of contact numbers; ships with 3 defaults; editable. |

The header logo is a fixed visual element (`react-icons/lu` `LuScale`, green) and is not user-editable in this module.

**Default identity** (used when the profile has never been customised, FR-028):

- `brandName`: `"M&M Tax Law Solutions"`
- `location`: `"Office no 8, 1st Floor, Pounch House Complex, Adam Jee Road, Rawalpindi"`
- `contacts`: `["+92 334-5739614", "+92 312-5739614", "051-5910021"]`

---

## Value Object: `StatementFilter`

The View tab's query (FR-017, FR-034).

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `from` | `string` | yes | ISO `YYYY-MM-DD`; default = 1st of current month. |
| `to` | `string` | yes | ISO `YYYY-MM-DD`; default = today. |

**Rule**: `from <= to`. When violated the range is invalid and no results are shown (FR-024).

---

## Derived Value: `StatementSummary`

Computed from the filtered set (FR-021, FR-022). Never stored.

| Field | Type | Derivation |
|-------|------|------------|
| `totalInflow` | `number` | Sum of `amount` where `type === "inflow"`. |
| `totalOutflow` | `number` | Sum of `amount` where `type === "outflow"`. |
| `balance` | `number` | `totalInflow - totalOutflow`; may be negative. |

**Invariant (SC-003)**: `balance === totalInflow - totalOutflow` for every rendered result set. An empty result set yields `{ 0, 0, 0 }` (FR-023).

---

## Validation Summary (maps to `src/domain/validation.ts`)

| Rule | Source FR | Enforcement |
|------|-----------|-------------|
| date required + ISO | FR-003, FR-004 | zod `date` string on `YYYY-MM-DD`, default today |
| type required | FR-005 | zod enum `inflow \| outflow` |
| nature required + belongs to type | FR-006–FR-009 | zod refine against catalog; reset on type change |
| amount required, numeric, `> 0` | FR-011 | zod coercion to number + `.positive()` + 2-dp check |
| remarks optional | FR-010 | `string \| null`, trimmed to `null` when blank |
| file ≤ 1 | FR-012 | single-file input; extra selections replace, never append |
| Create disabled until valid | FR-013 | `formState.isValid` gates the button |
| no duplicate submission | FR-016 | submit disabled while a create is in flight / after success reset |
| `from <= to` | FR-024 | filter guard before querying |

## Notes carried into design

- Amounts are stored as plain numbers; no floating-point display artifacts are persisted (formatting happens at render time via `lib/format.ts`).
- `fileRef` exists so the backend module can attach a storage path later without an entity migration; Module 1 leaves it `null`.
- Because statements are immutable, the View tab needs no row actions, confirmation dialogs, or optimistic-update logic.
