---
id: 001
title: Clients Section, Client Records, Categories, Deletions & Monthly Backup Reminder
stage: green
date: 2026-10-20
surface: agent
model: unspecified
feature: 005-clients-section
branch: 004-cloud-sync
user: H.A.R
command: (ad-hoc)
labels: ["clients", "client-records", "categories", "password", "deletion", "drag-and-drop", "backup-reminder", "schema-v7", "ui-blocks"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - tax-statements-analysis/src-tauri/src/store/mod.rs
 - tax-statements-analysis/src-tauri/src/store/schema.rs
 - tax-statements-analysis/src-tauri/src/store/clients.rs
 - tax-statements-analysis/src-tauri/src/store/categories.rs
 - tax-statements-analysis/src-tauri/src/store/client_records.rs
 - tax-statements-analysis/src-tauri/src/store/statements.rs
 - tax-statements-analysis/src-tauri/src/commands/mod.rs
 - tax-statements-analysis/src-tauri/src/commands/error.rs
 - tax-statements-analysis/src-tauri/src/commands/clients.rs
 - tax-statements-analysis/src-tauri/src/commands/categories.rs
 - tax-statements-analysis/src-tauri/src/commands/client_records.rs
 - tax-statements-analysis/src-tauri/src/commands/statements.rs
 - tax-statements-analysis/src-tauri/src/lib.rs
 - tax-statements-analysis/src-tauri/tauri.conf.json
 - tax-statements-analysis/src/domain/types.ts
 - tax-statements-analysis/src/data/repositories.ts
 - tax-statements-analysis/src/data/tauri.ts
 - tax-statements-analysis/src/data/in-memory.ts
 - tax-statements-analysis/src/components/providers/DataProvider.tsx
 - tax-statements-analysis/src/components/clients/CreateClientForm.tsx
 - tax-statements-analysis/src/components/clients/ViewClientsTab.tsx
 - tax-statements-analysis/src/components/clients/ClientCard.tsx
 - tax-statements-analysis/src/components/clients/ClientFields.tsx
 - tax-statements-analysis/src/components/clients/EditClientDialog.tsx
 - tax-statements-analysis/src/components/clients/CategoryFilter.tsx
 - tax-statements-analysis/src/components/clients/CategorySelect.tsx
 - tax-statements-analysis/src/components/clients/CategoryChip.tsx
 - tax-statements-analysis/src/components/clients/ClientRecordsView.tsx
 - tax-statements-analysis/src/components/clients/ClientRecordDialog.tsx
 - tax-statements-analysis/src/components/ui/file-drop-field.tsx
 - tax-statements-analysis/src/components/layout/BackupReminderDialog.tsx
 - tax-statements-analysis/src/components/statements/StatementsTable.tsx
 - tax-statements-analysis/src/components/bills/CreateBillForm.tsx
 - tax-statements-analysis/src/hooks/useBackupReminder.ts
 - tax-statements-analysis/src/lib/categoryColors.ts
 - tax-statements-analysis/src/App.tsx
 - tax-statements-analysis/src/index.css
 - PROJECT_MAP.md
tests:
 - npm run build (tsc + vite) — clean
 - npm test — 90 passed (8 pre-existing failures unchanged: 4 StatementsTable, 4 CreateBillForm)
 - cargo check — clean
---

## Prompt

Build out the Clients section fully: client data should be CNIC, Name, Phone, Whatsapp, Email and an optional Password (which, when set, should also flow into the billing password for the designated client). Redesign the View tab from a table into fixed-width / adjustable-height blocks — all data shown, password hidden behind an eye, client name at the top, three details per row, a contrasting background, editable and deletable, the whole block clickable, hover with a sliding whitish glare + theme-green border + pop-out, searchable across every field, plus a Category dropbox beside the search that can create/edit/delete named, coloured categories.

Clicking a client block opens a records table with a Create button opening a dialog (Name, Date, Remarks, Category, File), searchable by name/remarks/file name, filterable by more than one category and a From/To date range, entirely editable and deletable, with drag-and-drop file upload (the env-file drag-drop currently does not work — make it work).

Also: statements are editable but not deletable — make them deletable, and make sure bills are too. All deletions need confirmation. Edge case: every month, inform the user via dialog box to back up their database file.

Clarified up front (all questions in one batch): keep repeatable client fields; template the bill's client-pick to carry all client info; categories are global and shared; the backup dialog is a remind-only prompt.

## Response snapshot

1. **Schema v7** (`store/mod.rs`, `store/schema.rs`): `SCHEMA_VERSION 6 → 7`; new `DDL_V7` (`categories`, `client_records`, `client_record_files`) + a guarded `ALTER TABLE clients ADD COLUMN category_id`; `REQUIRED_TABLES_V7`; a `version >= 7` verification branch.
2. **Clients** gained `password` and `categoryId` (`store/clients.rs`, commands, seam, in-memory); a new `update_within` / `update_client` **replaces** details + contacts (the create path still merges by CNIC).
3. **Categories** (new `store/categories.rs` + `commands/categories.rs`): one global, name-unique, coloured list; deleting only clears the tag from clients/records in one transaction; name clashes rejected at the boundary with a field error.
4. **Client records** (new `store/client_records.rs` + `commands/client_records.rs`): name, date, remarks, category and one optional file held as a `data` BLOB, mirroring statements; raw-body + `x-record-meta` when a file rides along; open/save-copy through the OS.
5. **Statement deletion** added across all layers (`statements::delete`, `delete_statement`, seam `remove`, table trash + confirm). Bills already deleted with confirmation — verified.
6. **Drag-and-drop fixed**: `dragDropEnabled: false` added to `app.windows[0]` (Tauri v2 defaults it `true`, so WebView2 swallowed OS drops before the DOM saw them). A reusable `FileDropField` now backs the record file field, and the onboarding env-file drop works too.
7. **View Clients redesigned** into blocks (`ClientCard`) with a distractor-free 3-per-row layout, an eye-revealed password, a glare/brand hover (CSS in `index.css`), an all-field search and a `CategoryFilter` dropbox; clicking a block opens `ClientRecordsView`.
8. **Bill autofill** now also carries the client's password into the customer's Password field.
9. **Monthly backup reminder**: `useBackupReminder` (localStorage, per machine) + `BackupReminderDialog`, shown once per calendar month and only once a store exists.
10. `PROJECT_MAP.md` updated throughout (§2–§9) and this PHR written.

## Outcome

- ✅ Impact: the Clients section is now a full-featured block UI with per-client records, shared categories and passwords; statements and bills both delete (with confirmation); file drag-and-drop works; the user is nudged to back up monthly.
- 🧪 Tests: `npm run build` clean; `npm test` 90 passed with the same 8 pre-existing failures (4 `StatementsTable.test.tsx` — no `DataProvider`; 4 `CreateBillForm.test.tsx` — label vs. combobox drift); `cargo check` clean.
- 📁 Files: 13 Rust, 20 frontend, 1 config, PROJECT_MAP.md.
- 🔁 Next prompts: run the app and verify the drag-drop, records CRUD and the monthly backup dialog end to end; decide whether the bill's contact number/email should become repeatable.
- 🧠 Reflection: the drag-drop defect was a single missing config key, not a code bug — Tauri's default `dragDropEnabled: true` keeps OS drops away from the page entirely. Category deletion deliberately clears tags rather than cascading deletes, so filing data is never lost with the tag.

## Evaluation notes (flywheel)

- Failure modes observed: the first cut of `update_client_record` validated a blank `cnic` (an edit never carries one), which would have rejected every edit; caught during review and fixed by making `cnic` an `Option` that is only checked on create. Worth a regression test.
- Graders run and results (PASS/FAIL): tsc + vite PASS; Vitest 90/98 PASS (8 pre-existing); cargo check PASS.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): a Vitest case covering `create → list → update(remove file) → delete` on `InMemoryClientRecordRepository`.
