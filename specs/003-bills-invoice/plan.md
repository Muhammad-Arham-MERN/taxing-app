# Implementation Plan: Customer Bills and Invoices (Module 3)

**Branch**: `003-bills-invoice` | **Date**: 2026-09-18 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/003-bills-invoice/spec.md`

## Summary

Module 3 adds the customer **Bills (invoices)** half of the practice's paperwork, alongside the Statements that Modules 1 and 2 already deliver. A practitioner composes a bill for one customer from one or more **line items**; the application numbers the items, assigns a sequential never-reused invoice number (`INV-0001`), sums the line items, and spells the total out in words; it then renders a **green, one-page invoice PDF on demand** — header, customer block, five-column table, signature line and bank/wallet footer — which opens in the system's default PDF application or is saved to disk. Bills are reviewed in a **View Bills** tab filtered by an optional date range and a **Customer** filter, corrected in place with the invoice reissued, and deleted. Customer names entered on a bill are **remembered** so their details can be reused on later bills.

The architectural decisions all follow from what Modules 1 and 2 already established, so the feature is an extension rather than a new structure:

1. **Same store, extended schema.** Bills, line items and customers live in the **same single SQLite store file** (`tax-statements.sqlite`) already used for statements. The schema version moves 1 → 2 with an additive migration so existing stores keep working. Amounts stay **integer paisa**; tables stay `STRICT`; the journal stays the rollback journal, not WAL, so the one file remains a complete, copyable backup.
2. **Same data-access seam.** The UI talks only to repository interfaces injected by `DataProvider`; a new `BillRepository`/`CustomerRepository` pair gets a Tauri implementation and an in-memory twin, exactly as statements did.
3. **Thin Rust command layer.** New commands delegate straight to new `store::bills` / `store::customers` modules; the IPC layer holds no business logic. The invoice PDF is **not** produced in Rust — the backend only writes the bytes the frontend renders to a temp file and hands them to the OS, or saves a copy, reusing Module 2's `temp::write_out` + `opener` and dialog paths.
4. **Invoice rendered in the frontend on demand.** The invoice is a pure rendering of the bill's current values, so it is generated afresh (never stored) each time it is opened or downloaded, using a new frontend PDF dependency. This is the module's one genuinely new technology and is recorded in Complexity Tracking.

The most easily-missed consequence of "same store" is that **Module 2's location change must now carry bills and customers too** (and extend its empty-store test), otherwise changing the storage directory would silently drop the billing record. That work is in scope here and is called out explicitly.

## Technical Context

**Language/Version**: Rust 1.77.2+ (edition 2021) with Tauri v2 for the backend, and TypeScript 5.x on React 19 for the frontend — both already in place; no language change
**Primary Dependencies**:

- **New (frontend)**: `@react-pdf/renderer` — renders the invoice React document to PDF bytes in the webview. This is the only new runtime dependency the feature adds.
- **Reused (backend)**: `rusqlite` (`bundled`, `blob`) · `tauri-plugin-dialog` · `tauri-plugin-opener` · `tauri-plugin-single-instance` · `uuid` · `serde`/`serde_json`. **No new Rust crate** is required.
- **Reused (frontend)**: `react-hook-form` + `zod` · `@tanstack/react-table` (legacy API) · Radix/shadcn primitives · Tailwind v4 tokens · `framer-motion`.

**Storage**: The **same single self-contained SQLite store file** already used for statements. Schema version raised `1` → `2`; three tables added (`customers`, `bills`, `bill_items`) plus an invoice-number counter in the existing `app_meta` table. Amounts continue as **integer minor units (paisa)**; tables `STRICT`; rollback journal (not WAL) so the `.db` alone remains the whole store. The location stays remembered in `settings.json`; no second settings key and no second file.
**Testing**: Per the developer's standing direction, **no automated backend tests** — the command surface is exercised end to end (see [quickstart.md](./quickstart.md)). Frontend coverage is **extended**, not replaced: new Vitest cases for the bill form, the bills table, amount-in-words and the bill repository's in-memory twin; every existing Module 1/2 test must keep passing.
**Target Platform**: Windows 10/11 desktop, single practitioner, fully offline; development on Windows via `npm run tauri dev`. The MSVC build-tools prerequisite introduced by Module 2 is unchanged and already satisfied.
**Project Type**: Single desktop application (Tauri shell + React webview), extended in place at `tax-statements-analysis/`; no new project.
**Performance Goals**: The View Bills list renders in under 2 seconds over thousands of bills, including when a customer/date filter is applied — achieved by computing `details` and `total` in SQL (`GROUP_CONCAT`/`SUM`) so the list query never loads individual line-item rows. `get_bill` loads one bill with its items. Invoice rendering completes in about a second for a typical one-to-three-item bill.
**Constraints**: Fully offline, no network calls anywhere. Never reuse an invoice number (even after deletion). Customers are never deleted. Statements' behaviour and the `₨` amount presentation are untouched. Bill data is written only through the store's single mutex-guarded connection. No delete path exists for a store file.

**Scale/Scope**: 1 practitioner, 1 store file at a time, 4 user stories, ~8 new Tauri commands (about 18 total), thousands of bills over the application's life, typically 1–3 line items per bill with no hard upper bound.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution: `.specify/memory/constitution.md` v1.0.0 (ratified 2026-09-14). Evaluated against the project's four principles.

| # | Principle | Status | Evidence / notes |
|---|-----------|--------|------------------|
| I | Code Standards (file header → crux marker → footer) | PASS (planned) | Every new Rust and TypeScript source file opens with `بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ` and closes with `وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ`. The crux marker `وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ` goes on the genuinely load-bearing logic: **invoice-number allocation**, the **per-statement bill write transaction** (items replaced wholesale), the **customer upsert**, the **invoice renderer**, the **amount-in-words** function, and the **carry-across additions**. Following Module 1/2 precedent, `specs/` Markdown artifacts do not carry the header/footer (the open interpretation recorded in Module 2's plan is unchanged). |
| II | Quality Standards (accuracy, reliability, efficiency, clarity) | PASS, with one objection re-raised | **Accuracy**: bill totals are summed as integer paisa so the displayed total and its words cannot drift from the line items; invoice numbering is allocated inside the write transaction so it can never collide. **Reliability**: the bill row and its items are written in one transaction that rolls back on drop; a failed create reports failure and does not reset the form. **Efficiency**: the list query aggregates in SQL and never loads item rows; the invoice is rendered on demand. **Clarity**: new Rust is split into `store/bills.rs` and `store/customers.rs` mirroring the existing split; new frontend components live under `src/components/bills/`. |
| III | Supervised Collaboration | PASS | The one new dependency, the schema version bump with an additive migration, and the decision to render the invoice in the frontend rather than Rust are all surfaced here and in Complexity Tracking for the Developer rather than applied silently. |
| IV | Constructive Objection | OBJECTION RAISED — see below | One objection carried forward, one new. |

**Objection 1 (carried forward from Module 2) — no automated tests on the module's riskiest logic.** The developer's direction is honoured. For the record, Module 3 extends exactly the code Module 2 left unguarded: the **carry-across** gains customers, bills and line items, and the **schema migration** on open is new silent-corruption surface. *Options:* (a) accept as directed; (b) add a small Rust integration test covering only the v1→v2 migration and one bill write/read round trip; (c) revisit if a defect escapes. No action taken.

**Objection 2 (new) — the invoice depends on a frontend PDF library.** Rendering the invoice in the webview keeps Rust free of a PDF crate and puts the layout where the data already is, but it adds a sizeable runtime dependency and moves a customer-facing artefact's fidelity into the UI layer. *Alternatives:* (a) `@react-pdf/renderer` in the frontend — chosen (see R1); (b) a Rust crate (`printpdf`/`genpdf`) rendering server-side — larger rewrite, manual layout, and a new backend dependency; (c) `jsPDF` + `jspdf-autotable` — lighter, but a more imperative layout and weaker typography control. **Recommendation: (a)**, recorded for the Developer.

**Result**: PASS. No violations requiring justification as violations; deliberate structural choices are recorded in Complexity Tracking.

### Post-Design Constitution Re-check

Re-evaluated after Phase 1 (2026-09-18): still **PASS**. The design keeps two explicit contracts (the Tauri command surface and the frontend repository seam), adds no speculative abstraction, honours Principle I for every created source file, and preserves the spec's invariants (never reuse an invoice number, never delete a customer, never touch statements' behaviour). Both objections remain open for the Developer and neither blocks implementation.

## Project Structure

### Documentation (this feature)

```text
specs/003-bills-invoice/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── tauri-commands.md      # the new Rust/IPC surface (bills + customers + invoice open/save)
│   └── bill-repository.md     # the frontend seam additions
├── checklists/
│   └── requirements.md  # /sp.specify + /sp.clarify output
└── tasks.md             # /sp.tasks output (NOT created here)
```

### Source Code (repository root)

The application already exists as a Tauri v2 + React app at `tax-statements-analysis/`. This plan extends it in place; `[NEW]` marks files this module adds, `[CHG]` marks files it changes.

```text
tax-statements-analysis/
├── src/                                             # FRONTEND
│   ├── App.tsx                                      # [CHG] nav partitioned into Statements + Bills groups (4 tabs)
│   ├── data/
│   │   ├── repositories.ts                          # [CHG] BillRepository, CustomerRepository, new error classes
│   │   ├── tauri.ts                                 # [CHG] Tauri implementations of the new interfaces
│   │   ├── in-memory.ts                             # [CHG] in-memory twins (test fixture only)
│   │   └── billsInMemory.ts?                        # (folded into in-memory.ts — no extra file)
│   ├── domain/
│   │   ├── types.ts                                 # [CHG] Bill, BillItem, NewBill, BillUpdate, BillFilter, BillSummary, Customer
│   │   ├── billValidation.ts                        # [NEW] zod schemas for the bill form (required rules, +92 wallet)
│   │   └── identity.ts                              # [CHG] add company full name + invoice footer bank constants
│   ├── lib/
│   │   ├── format.ts                                # [CHG] add formatPkr (PKR + commas); keep formatAmount (₨) for statements
│   │   ├── amountInWords.ts                         # [NEW] PKR amount → words
│   │   └── billInvoice.ts                           # [NEW] renderBillInvoice(bill) -> Uint8Array via @react-pdf/renderer
│   └── components/
│       ├── bills/
│       │   ├── CreateBillForm.tsx                   # [NEW] the bill form (reuses the statement form's component style)
│       │   ├── BillItemsEditor.tsx                  # [NEW] line items + "+" add / remove, auto item numbers, total
│       │   ├── EditBillDialog.tsx                   # [NEW] edit in place, regenerate invoice
│       │   ├── BillsTable.tsx                       # [NEW] list: Customer Name, Date, Details, Amount + row actions
│       │   ├── CustomerFilter.tsx                   # [NEW] drop-down of remembered customers, also type-to-search
│       │   ├── BillInvoiceDocument.tsx              # [NEW] the green one-page invoice as a react-pdf Document
│       │   ├── CreateBillForm.test.tsx              # [NEW]
│       │   └── BillsTable.test.tsx                  # [NEW]
│       └── providers/DataProvider.tsx               # [CHG] inject bills + customers
│
└── src-tauri/                                       # BACKEND
    └── src/
        ├── lib.rs                                   # [CHG] register the new commands
        ├── commands/
        │   ├── mod.rs                               # [CHG] pub mod bills
        │   ├── bills.rs                             # [NEW] create/list/get/update/delete + invoice open/save
        │   └── error.rs                             # [CHG] add UnknownBill error kind
        └── store/
            ├── mod.rs                               # [CHG] SCHEMA_VERSION 2, REQUIRED_TABLES, v1→v2 migration on open
            ├── schema.rs                            # [CHG] new DDL + invoice counter seed
            ├── bills.rs                             # [NEW] bill CRUD, invoice-number allocation, list aggregation
            ├── customers.rs                         # [NEW] customer upsert + list
            └── carry.rs                             # [CHG] carry customers, bills, items and the invoice counter
```

**Structure Decision**: Single desktop application, extended in place, split by concern exactly as Modules 1 and 2 already are. The Rust side keeps `store/` as the only place `rusqlite` appears and keeps `commands/` a thin IPC translation; `bills.rs` and `customers.rs` sit beside `statements.rs` rather than in a new layer. On the frontend, everything new lives under `src/components/bills/` and the three new `src/lib`/`src/domain` files, while `App.tsx` gains a grouped tab list — the statement components are reused as the *pattern* for the bill form (as the spec asks), not refactored wholesale. The invoice renderer is the one new capability with no precedent, and it is isolated in a single file behind `renderBillInvoice(bill)` so the rest of the UI does not know it exists.

## Complexity Tracking

> No constitution violations. The table records deliberate structural choices so they are explicit.

| Choice | Why Needed | Simpler alternative rejected because |
|--------|------------|--------------------------------------|
| Invoice PDF rendered in the **frontend** (`@react-pdf/renderer`) rather than in Rust | The invoice is regenerated on demand from the bill's values and opened in the OS PDF viewer (spec Clarifications, FR-027/FR-034). The bill data and the declarative React layout already live in the webview, and Rust already knows how to write bytes out and hand them to the OS. | A Rust PDF crate (`printpdf`/`genpdf`) would add a new backend dependency and require hand-building the flexbox-like layout, duplicated away from the UI. `jsPDF` is lighter but imperative and weaker on typography. |
| Schema **version bump 1 → 2 with an additive migration** on open | The spec requires bills in the **same store file** as statements, so a store created before this module (version 1) must keep opening. Rejecting it would strand the practitioner's existing statements. | Not bumping the version leaves `user_version` lying about the store's shape and gives the next schema change no way to distinguish states. Rejecting v1 stores loses access to existing data — unacceptable. |
| Extending **carry-across** to customers, bills, items and the invoice counter | Location change is an existing capability (Module 2); if it carried only statements, changing the storage directory would silently drop the billing record — a data-loss path the spec's "same store" assumption implies must not exist. | Carrying only statements would be simpler but would break the promise that the practitioner's records move with them. |
| List query computes `details` and `total` in SQL (`GROUP_CONCAT`/`SUM`) | FR-064 requires the list to show Customer Name, Date, Details and Amount; the list must stay fast over thousands of bills and must not load item rows. | Loading every bill's items to render the list would make the list cost proportional to total line-items — the same trap Module 2 avoided for attachments. |
| Amount-in-words implemented in **TypeScript** | The words are needed for on-screen display at creation time (the total and its words are shown live) and for the invoice; both are frontend concerns. | Implementing it in Rust would need a second round trip to show the words the practitioner sees while typing. |
| `formatPkr` added **alongside** `formatAmount` rather than replacing it | The spec keeps the existing `₨` presentation for statements and uses `PKR` + commas for bills (FR-026, clarified 2026-09-18). | Replacing `formatAmount` would change statement amounts, which the client explicitly asked not to do. |

## Phases

- **Phase 0 — Outline & Research**: see [research.md](./research.md). Every unknown is resolved; no `NEEDS CLARIFICATION` remains.
- **Phase 1 — Design & Contracts**: see [data-model.md](./data-model.md), [contracts/](./contracts/) and [quickstart.md](./quickstart.md).
- **Phase 2 — Tasks**: deferred to `/sp.tasks`.

### Suggested delivery order

Stories are ordered by priority in the spec and each is separately demonstrable:

1. **US1 (P1)** — schema v2 + migration, `create_bill`, the Create Bill tab with line items and auto total/words/invoice number, and the invoice PDF. *Viable product on its own.*
2. **US2 (P2)** — View Bills with the optional date range and Customer filter, and the customer memory that feeds it.
3. **US3 (P3)** — opening, correcting and reissuing a bill, plus download.
4. **US4 (P4)** — deleting a bill with confirmation.

The nav partition (FR-001–FR-004) and the customer memory (FR-064–FR-069) land with US1/US2 as noted, since the customer directory is what the US2 filter reads from.

## Risks & Follow-ups

- **Schema migration is new silent-corruption surface.** The v1→v2 step must be additive and idempotent (`CREATE TABLE IF NOT EXISTS`, seed the counter with `ON CONFLICT DO NOTHING`), run inside a transaction, and stamp `user_version` only after it succeeds. A store already at version 2 must be left alone. Flagged because this is the first migration the project performs.
- **Carry-across now spans four things.** Statements, customers, bills, items and the counter must all move, skip-by-identity must remain idempotent, and foreign keys (`bill_items → bills`, `bills → customers`) must be copied in dependency order (customers → bills → items). Getting the order wrong makes a resumed carry fail on a foreign key.
- **Invoice-number allocation must be inside the create transaction.** Reading the counter and incrementing it must be one atomic unit with the insert, or two rapid creates could mint the same number; and the counter must never be decremented, or a deleted number would be reused (FR-019, SC-021).
- **Customer identity is by name.** `bills.customer_name` and `customers.name` are matched with `COLLATE NOCASE` so "Acme" and "acme" are one customer (FR-068). The consequence — two genuinely different customers with the same name cannot both be held — is a deliberate, spec-driven trade-off worth remembering.
- **Frontend PDF fidelity and font.** `@react-pdf/renderer` supports built-in faces (Helvetica) and custom TTFs; the project's Geist Variable is shipped as WOFF2, which the renderer does not take. The plan uses a built-in face for the invoice rather than adding a TTF, to be confirmed by the Developer if a specific typeface is wanted. The logo is the header's `LuScale` scales mark, embedded as an SVG path.
- **`@react-pdf/renderer` bundle size.** It is a substantial dependency (roughly a megabyte) for a desktop webview; acceptable offline, noted so it is a known cost rather than a surprise.
- **No automated guard on migration and carry paths**: see Objection 1.
- **Deferred by the developer (unchanged from Module 2)**: the general policy for how a store survives *future* application versions. This module performs one concrete, additive migration and leaves the broader policy open; it does stamp `user_version = 2` so the information is available when that decision is taken.
