# Phase 0 Research: Customer Bills and Invoices (Module 3)

**Feature**: `003-bills-invoice` | **Date**: 2026-09-18 | **Plan**: [plan.md](./plan.md)

Every unknown in the plan's Technical Context is resolved below. Each entry records the decision, why it was taken, and what was rejected. Version figures are the published stable versions at research time and must be pinned by `package-lock.json` / `Cargo.lock` rather than trusted from this document.

---

## R1 — How the invoice PDF is produced

**Decision**: Render the invoice **in the frontend** with `@react-pdf/renderer`. The invoice is a React document (`Document` → `Page` → `View`/`Text`) that describes the header, the customer block, the line-item table, the signature line and the footer; `pdf(element).toBlob()` yields the PDF bytes, which are then handed to the backend to write out (R2). No PDF crate is added to Rust.

**Rationale**: three properties of the spec push the renderer to the frontend.
1. The invoice is **regenerated on demand** (spec Clarifications; FR-027) and must always match the bill's current values — the bill object is already in the webview when the practitioner opens or downloads it.
2. The invoice's requirements are **layout** requirements — green colour scheme, rounded elements, a two-column customer block, a five-column table, a bold centred signature line, a footer (FR-028–FR-033). `@react-pdf/renderer` gives flexbox layout, `borderRadius`, colours and custom fonts, so the layout can be described declaratively, close to how the on-screen components are built.
3. Rust already knows how to write bytes to the OS-managed temp folder and hand them to a viewer, and how to raise a save dialog (Module 2, R8/R10). The backend therefore needs **no new dependency** — it just receives bytes and writes them.

**Alternatives considered**:
- *Rust crate — `printpdf`, `genpdf`* — would keep the artefact server-side but adds a backend dependency and requires building the layout by hand (absolute positioning, manual line wrapping), duplicating structure the UI already expresses. Rejected.
- *`jsPDF` + `jspdf-autotable`* — lighter, and its table plugin fits the line-item table; but layout is imperative, typography control is weaker, and styling the green/rounded look means more manual drawing. Rejected as second choice.
- *`pdf-lib`* — a low-level writer with no layout engine at all; every line and box placed by hand. Rejected.
- *Print the webview to PDF* — Tauri's `print()` opens the OS print dialog and cannot silently produce a file the application then opens or saves. Rejected.

**Consequence to carry**: the renderer is a sizeable frontend dependency (roughly a megabyte) and the invoice's visual fidelity becomes a UI-layer concern; both are recorded in the plan's Complexity Tracking and Risks.

---

## R2 — How the invoice bytes reach the OS and the disk

**Decision**: two new commands, both taking the PDF bytes as the **raw request body** with the suggested file name in a JSON header (`x-bill-invoice-meta`), mirroring Module 2's `x-statement-meta` pattern:
- `open_bill_invoice` — writes the bytes with `temp::write_out(&state.run_folder, file_name, &bytes)` and calls `app.opener().open_path(...)`.
- `save_bill_invoice_copy` — raises `app.dialog().file().set_file_name(&file_name).blocking_save_file()` and writes the bytes to the chosen path; `None` means cancelled.

Both return no substantial payload (`()` and `Option<String>`), so **no command returns file contents** — the direction is frontend → Rust only, exactly as Module 2 constrained it.

**Rationale**: the raw-body transport exists precisely to avoid inflating bytes into a JSON number array (Module 2, contract note). Reusing `temp::write_out` gives the invoice the same per-run temp folder, lock-tolerant cleanup and file-name sanitisation the attachments already have. Reusing the dialog plugin and the opener plugin means no new capability and no new crate.

**Alternatives considered**:
- *Generate the PDF in Rust and write it there* — rejected with R1.
- *Download via a browser blob/anchor* — the app is a webview, not a browser tab; it cannot hand a file to the OS PDF viewer that way. Rejected. (A frontend `Blob` + `<a download>` is also unable to reuse the app's temp-folder lifecycle.)
- *A command that returns the bytes for the frontend to save* — rejected: it reverses Module 2's deliberate rule that file contents do not cross IPC on the way out, for no gain.

**Suggested file name**: `INV-0001.pdf`, derived from the invoice number (`billFileName(invoiceNo)`), so the temp copy and any saved copy carry a recognisable name.

---

## R3 — Invoice numbering

**Decision**: a **sequential counter** kept in the existing `app_meta` table under the key `next_invoice_no` (seeded to `1` when the schema is created or migrated). On create, inside the **same transaction** as the bill insert, the command reads the counter, formats the number as `INV-` + the sequence zero-padded to four digits (growing naturally past 9999: `INV-10000`), inserts the bill with both the formatted `invoice_no` and the integer `invoice_seq`, and increments the counter. The counter is **never decremented** — deletion does not free a number — which is what makes FR-019/SC-021 ("never reused") true.

**Rationale**:
- The number must be unique and never reused, including after deletion. Deriving it from `MAX(invoice_seq)+1` would fail that: deleting the highest bill would let its number be minted again. A monotonic counter cannot.
- Reading and incrementing in the same transaction as the insert makes concurrent/rapid creates safe (the store's `Mutex` already serialises writers, but the transaction keeps the invariant local to the write). This is the module's clearest **crux** and carries the `وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ` marker.
- Storing the integer `invoice_seq` beside the formatted `invoice_no` keeps ordering and range reasoning in SQL while the formatted string is what the practitioner sees and the invoice prints.

**Alternatives considered**:
- *`MAX(invoice_seq)+1`* — rejected: reuses a deleted number.
- *A dedicated `sequences` table* — works but is a table for one value; `app_meta` already exists for exactly this kind of small store metadata (Module 2 uses it for `created_at`/`creator_version`).
- *Date-based numbering* — considered and declined by the client (2026-09-18), who chose the sequential prefixed form.

---

## R4 — Opening a pre-existing (version 1) store

**Decision**: raise `SCHEMA_VERSION` from `1` to `2` and perform an **additive, idempotent migration** whenever a store is opened read-write and its `user_version` is below the current version:
1. Inside one transaction, run the new `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` statements and seed `next_invoice_no` with `ON CONFLICT(key) DO NOTHING`.
2. Stamp `user_version = 2`.
3. Commit.

Verification stays the same shape as Module 2 but becomes version-aware: `application_id` must match, `user_version` must be within `1..=SCHEMA_VERSION`, and the tables required **for that version** must exist (version 1 requires the original three; version 2 additionally requires `customers`, `bills`, `bill_items`). A store already at 2 is left untouched.

**Rationale**: the spec requires bills in the **same store file** as statements. Most existing practitioners have a version-1 store holding their statements; if version 2 could not read it, the module would strand their data — the one outcome the spec's storage assumptions forbid. An additive migration is the least-risk way to bring it forward, and making it idempotent means an interrupted migration is simply re-run on the next open.

**Alternatives considered**:
- *Do not version the schema; just add tables on every open* — leaves `user_version` misrepresenting the store and gives the next change no way to tell the states apart. Rejected.
- *Reject version-1 stores and ask the practitioner to start fresh* — strands existing statements. Rejected outright.
- *A general migration framework* — out of proportion for one additive step; the developer deferred the broad policy (Module 2 assumptions), and this module performs only the concrete step it needs. The framework remains deferred.

**Honest limitation**: an interrupted migration is recoverable by re-opening (the DDL is idempotent and the version is stamped only after success), but the path has no automated test (see the plan's Objection 1).

---

## R5 — How bills and line items are stored

**Decision**: two new tables.
- `bills` — one row per bill: `id` (UUID, assigned once), `invoice_no` (unique), `invoice_seq` (unique, integer), `occurred_on` (ISO `YYYY-MM-DD`), `customer_name` (FK to `customers.name`), `jazzcash` / `easypaisa` (nullable), `account_holder` (the defaulted name), `created_at`, `updated_at`. No stored total — the total is derived from the items so it can never disagree with them (the same reasoning as Module 2's un-stored statement totals).
- `bill_items` — one row per line item: `id` (UUID), `bill_id` (FK to `bills.id`, `ON DELETE CASCADE`), `position` (1-based, `UNIQUE(bill_id, position)`), `details` (free text), `amount_minor` (integer paisa, `CHECK > 0`). The **item number shown is the position**, which is also the display order.

Both tables are `STRICT`. An edit replaces the bill's items **wholesale** (delete rows for the bill, re-insert with fresh positions) inside the bill's single write transaction, so "renumber after removal" (FR-015) and "no gaps" (FR-014) are automatic and the edit remains one atomic unit (FR-048).

**Rationale**: a bill is a header plus an ordered list, and the list is always read or written as a whole — nothing ever fetches one line item on its own. A child table with `position` expresses the ordering the item numbers must follow and lets the total and the `details` summary be computed in SQL for the list query (R7). Storing amounts as integer paisa keeps the total and its words exact, matching Module 2's currency rule.

**Alternatives considered**:
- *Items as a JSON blob on the bill row* — fewer tables, but `SUM`/`GROUP_CONCAT` for the list become impossible without loading the blob, and item-level constraints (positive amount, contiguous positions) are lost. Rejected.
- *Storing the total on the bill* — rejected: it can drift from the items, which SC-003 forbids.
- *Storing a pre-rendered item number separate from position* — rejected: it is exactly the position, and duplicating it invites the two to disagree.

---

## R6 — Customer memory and identity

**Decision**: a `customers` table keyed by name: `name TEXT COLLATE NOCASE PRIMARY KEY`, plus `address`, `contact_person`, `contact_number`, `email`, `ntn`, `created_at`, `updated_at`, all nullable except the name. Whenever a bill is created or updated, its customer fields are **upserted** by name inside the same transaction (`INSERT ... ON CONFLICT(name) DO UPDATE SET ...`), so the latest values win (FR-066, FR-068). `list_customers` returns every customer for the filter drop-down; nothing ever deletes a customer (FR-069).

**Rationale**:
- FR-068 makes the name the identity, so the name is the natural key. `COLLATE NOCASE` makes "Acme" and "acme" one customer, which is what a practitioner typing a name expects.
- Upserting on every bill save keeps the remembered details current without a separate "manage customers" screen the spec does not ask for.
- Never deleting matches FR-069: a customer stays offered even after all their bills are gone.

**Alternatives considered**:
- *A UUID-keyed customer with a separate name index* — more flexible (two customers could share a name) but contradicts FR-068 and adds a lookup the bill write would have to perform. Rejected for this module.
- *Deriving the customer list from `SELECT DISTINCT customer_name FROM bills`* — cannot work, because FR-069 requires customers with no bills to remain offered. A table is required.
- *Case-sensitive identity* — would let "Acme" and "acme" become two customers from a stray shift key. Rejected.

**Consequence to accept**: `NOCASE` is ASCII-only and two genuinely distinct customers with the same name cannot both be held. Both are recorded in the plan's Risks; they are direct consequences of the spec's chosen identity rule.

---

## R7 — The View Bills list query and filtering

**Decision**: one command, `list_bills(from: Option<String>, to: Option<String>, customer: Option<String>)`, returning list rows that already carry what the table shows:
`{ id, invoiceNo, date, customerName, details, total }`, where `details` is `GROUP_CONCAT(bill_items.details, '; ')` in position order and `total` is `SUM(bill_items.amount_minor)` converted from paisa. The query joins `bills` to `bill_items` and `LEFT JOIN`s nothing else, groups by bill, applies `occurred_on BETWEEN ?from AND ?to` only when a range is given, and `bills.customer_name = ?customer` only when a customer is given, and orders `occurred_on DESC, created_at DESC`.

**Rationale**: FR-064 requires Customer Name, Date, Details and Amount per row; computing `details` and `total` in SQL means the list **never loads item rows** individually, so it stays fast over thousands of bills (SC-011) — the same discipline Module 2 applied to attachments. Optional predicates express the spec exactly: neither filter → all bills; range only; customer only; both (FR-039/FR-040). The stable secondary order by `created_at` satisfies FR-041.

**Alternatives considered**:
- *Return bills and load items per row from the frontend* — N+1 round trips and item rows in memory; rejected.
- *A separate "search customers by typed text" command* — the customer set is small and already fetched whole for the drop-down, so type-to-search is filtered client-side (FR-065). Rejected as unnecessary.
- *Returning the full `Bill` (with items) in the list* — the list needs an aggregate, not the items; rejected as heavier than required.

**Note**: `get_bill(id)` is the separate command that returns one bill **with** its customer and item rows, for opening, editing and rendering the invoice.

---

## R8 — Carrying bills when the storage location changes

**Decision**: extend Module 2's carry-across to copy, in dependency order, **customers → bills → bill_items**, plus the `next_invoice_no` counter, using the same skip-by-identity rule (a row whose id/name already exists in the destination is left alone and never overwritten). Each bill and its items are copied in one transaction. The empty-store assessment is widened so "empty" means no statements **and** no bills.

**Rationale**: the spec stores bills in the same file as statements, and Module 2 lets the practitioner move that file's location with their records. If the carry copied only statements, changing the storage directory would silently drop every bill and customer — a data-loss path the spec's assumptions ("the two kinds of record simply share the one store file", FR-056/FR-057) plainly intend not to exist. Foreign keys make the order mandatory: items reference bills, bills reference customers. Reusing the per-row skip-by-identity rule keeps the operation idempotent, so an interrupted carry is resumed by running it again.

**Alternatives considered**:
- *Carry statements only* — rejected: silent data loss on a location change.
- *Copy the whole file* — impossible: the destination may be an existing store with its own records, so a merge is required (as Module 2 established for statements).
- *Copy bills before customers* — rejected: violates the foreign key.

**Consequence**: the carry path, already the riskiest unguarded code (Module 2 Objection 1), now spans five things. This is called out in the plan's Risks.

---

## R9 — Amount in words

**Decision**: implement `amountInWordsPkr(minor: number): string` in TypeScript. It renders an integer-paisa amount as **English** words — hundred, thousand, million, billion — with paisa as the fractional part, and appends "Only". The exact phrasing is fixed in one function so the on-screen total's words and the invoice's words can never differ. The bill's amount in words is the words for the **bill total** (the sum of its line items), shown below the invoice's line-item table (FR-031).

**Rationale**: the words are needed twice — live beside the total while the practitioner types (FR-018) and on the invoice (FR-031) — and both are frontend concerns, so a Rust implementation would force a round trip to show what the practitioner is already looking at.

**Changed at the client's request (2026-09-19)**: the wording was originally the South-Asian lakh/crore scale; the client asked for English numbering instead, so the scale table is now billion/million/thousand and the tests assert the English forms.

**Alternatives considered**:
- *South-Asian lakh/crore numbering* — the original choice, replaced at the client's request on 2026-09-19.
- *A dependency for number-to-words* — the logic is small and specific (short scale + paisa), so a well-tested local function is preferable to a general-purpose dependency. Rejected.
- *Implementing in Rust* — rejected per the round-trip reasoning above.

**Testing note**: this is the one new piece of pure logic that is genuinely worth Vitest coverage (it has no I/O and many edge cases — zero paisa, exact hundreds, thousand/million/billion boundaries); a test file accompanies it.

---

## R10 — Amount presentation and the navigation partition

**Decision**:
- **Amounts**: add `formatPkr(amount) -> "PKR 1,234.00"` (PKR label, comma thousands separators, two decimals) and use it for every bill amount — form, list, total, invoice. **Leave `formatAmount` (the `₨` form) untouched** and keep using it for statements. This implements the client's clarified rule (2026-09-18): Bills use PKR + commas; the existing Rs presentation stays where it is.
- **Navigation**: keep the existing Radix `Tabs`; render **four** `TabsTrigger`s — "Create Statement", "View Statements" — then a small vertical divider — then "Create Bill", "View Bills". The divider is a non-interactive element inside `TabsList` between the two groups; no new tab primitive and no route change. The Bills panels mount the new bill components; the Statements panels are unchanged.

**Rationale**: the client asked for "the design to remain the same, just with a small partition" (spec FR-001/FR-002/FR-003), which is exactly a two-group tab strip. Adding a divider inside the existing list is the smallest change that satisfies it. Keeping a separate `formatPkr` is the only way both amount rules can hold at once (FR-026).

**Alternatives considered**:
- *Two nested `Tabs` (a Statements tab and a Bills tab, each with sub-tabs)* — changes the interaction model and adds a level the client did not ask for. Rejected.
- *Replacing `formatAmount` globally with PKR* — contradicts the client's explicit "keep the Rs format already if it is present". Rejected.
- *Separate screens/routes* — the application has no router; introducing one is out of proportion. Rejected.

---

## Resolved unknowns summary

| Technical Context field | Resolution |
|---|---|
| Invoice PDF production | Frontend `@react-pdf/renderer`; React document → bytes (R1) |
| Bytes to OS / disk | Raw-body commands + `x-bill-invoice-meta`; reuse `temp::write_out`, opener, dialog (R2) |
| Invoice numbering | Monotonic `next_invoice_no` counter in `app_meta`, allocated in the create transaction, never reused (R3) |
| Existing store compatibility | Additive, idempotent v1→v2 migration on open; version-aware verification (R4) |
| Bill storage shape | `bills` + `bill_items` (position, paisa amount), derived total, wholesale item replace on edit (R5) |
| Customer memory | `customers` keyed by `name COLLATE NOCASE`, upserted on bill save, never deleted (R6) |
| List query and filtering | SQL aggregation (`GROUP_CONCAT`/`SUM`); optional date range and customer predicates (R7) |
| Location change | Carry customers → bills → items + counter, skip-by-identity; widen empty-store check (R8) |
| Amount in words | TypeScript `amountInWordsPkr`, lakh/crore + paisa, "Only", of the bill total (R9) |
| Amount display / nav | `formatPkr` for bills beside `formatAmount` for statements; four tabs with a divider (R10) |

**No `NEEDS CLARIFICATION` remains.** The one policy the developer has deferred — how a store survives *future* application versions — is unchanged and out of scope; this module performs only the single additive migration it needs and stamps `user_version = 2` so the broader decision remains open.
